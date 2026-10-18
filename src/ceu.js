// Céu: cúpula com shader próprio + ilhas distantes enevoadas + cubo de reflexo para o mar e
// para o PBR dos materiais do navio.
import * as THREE from 'three';
import { RUIDO, ATMOSFERA, NUVENS } from './glsl.js';

export function uniformesCeu(config) {
  return { uSolDir: { value: config.sol.direcao }, uTempo: { value: 0 } };
}

export function criarCupula(uniformes, comDiscoDoSol = true) {
  const material = new THREE.ShaderMaterial({
    uniforms: uniformes,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vDir = w.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * w;
        gl_Position.z = gl_Position.w * 0.99999; // sempre no fundo
      }`,
    fragmentShader: RUIDO + ATMOSFERA + NUVENS + /* glsl */ `
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = atmosfera(d);
        vec4 nv = nuvens(d);
        float disco = smoothstep(0.99968, 0.99982, dot(d, uSolDir));
        ${comDiscoDoSol ? 'c += vec3(1.0, 0.72, 0.42) * disco * 30.0 * (1.0 - nv.a * 0.85);' : ''}
        c = mix(c, nv.rgb, nv.a);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const cupula = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), material);
  cupula.frustumCulled = false;
  return cupula;
}

// Ilhas: planos deslocados por octavas de |sen·cos| (silhueta serrilhada) e pintados com a mesma
// atmosfera do céu — quanto mais longe, mais somem no horizonte.
export function criarIlhas(uniformes) {
  const material = new THREE.ShaderMaterial({
    uniforms: uniformes,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: ATMOSFERA + /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 v = vW - cameraPosition; float dist = length(v); vec3 d = v / dist;
        vec3 horizonte = atmosfera(vec3(d.x, 0.0, d.z));
        float luz = max(dot(normalize(vN), uSolDir), 0.0);
        vec3 base = vec3(0.07, 0.05, 0.09) + vec3(0.9, 0.4, 0.2) * luz * 0.35;
        float bruma = clamp(1.0 - exp(-dist * 0.00042), 0.0, 1.0);
        bruma = mix(bruma, bruma * 0.8, clamp(vW.y / 120.0, 0.0, 1.0));
        gl_FragColor = vec4(mix(base, horizonte, bruma), 1.0);
      }`,
  });
  const grupo = new THREE.Group();
  const ilhas = [
    { ang: -2.35, dist: 1900, larg: 900, alt: 150, semente: 1 },
    { ang: -2.05, dist: 2400, larg: 700, alt: 90, semente: 2 },
    { ang: 0.9, dist: 2100, larg: 1100, alt: 120, semente: 3 },
    { ang: 1.4, dist: 2700, larg: 800, alt: 70, semente: 4 },
  ];
  for (const ilha of ilhas) {
    const g = new THREE.PlaneGeometry(ilha.larg, ilha.larg * 0.5, 96, 32);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / ilha.larg * 2, z = pos.getZ(i) / (ilha.larg * 0.25);
      const domo = Math.max(0, 1 - x * x - z * z * 0.9);
      let serra = 0, amp = 1, freq = 3;
      for (let o = 0; o < 5; o++) {
        serra += amp * Math.abs(Math.sin(x * freq * 2.1 + ilha.semente * 3.3 + o) * Math.cos(z * freq * 1.7 + ilha.semente + o * 1.9));
        amp *= 0.5; freq *= 2.1;
      }
      pos.setY(i, Math.pow(domo, 0.9) * ilha.alt * (0.55 + 0.45 * serra) - 12);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.position.set(Math.sin(ilha.ang) * ilha.dist, 0, Math.cos(ilha.ang) * ilha.dist);
    m.rotation.y = ilha.ang;
    grupo.add(m);
  }
  return grupo;
}

// Cena só com o céu: alimenta o reflexo do mar (cubo cru) e a luz ambiente do PBR (PMREM).
export function criarReflexoDoCeu(renderer, uniformes) {
  const cenaCeu = new THREE.Scene();
  cenaCeu.add(criarCupula(uniformes, false)); // sem disco: o brilho do sol na água vem do especular
  const alvo = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(1, 10000, alvo);
  cenaCeu.add(cubeCam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let ambiente = null;
  function atualizar(refazerAmbiente = false) {
    cubeCam.update(renderer, cenaCeu);
    if (refazerAmbiente || !ambiente) {
      ambiente?.dispose();
      ambiente = pmrem.fromCubemap(alvo.texture);
    }
  }
  atualizar(true);
  return { cubo: alvo.texture, get ambiente() { return ambiente.texture; }, atualizar };
}

// Mar: soma de ondas de Gerstner (GPU para desenhar, CPU para o navio flutuar), rastro do navio,
// reflexo do céu e do navio, sombra do casco, espuma e névoa casada com o horizonte.
import * as THREE from 'three';
import { ATMOSFERA } from './glsl.js';

const G = 9.81;

// Pré-calcula as ondas: direção, número de onda k = 2π/L e velocidade de fase c = √(g/k).
export function prepararOndas(config) {
  return config.mar.ondas.map(([ang, L, A]) => {
    const k = 2 * Math.PI / L;
    return { dx: Math.sin(ang), dz: Math.cos(ang), k, c: Math.sqrt(G / k), A, L };
  });
}

// Deslocamento de Gerstner num ponto de repouso (x, z). Igual ao do shader.
function deslocar(ondas, Q, x, z, t, saida) {
  let sx = 0, sy = 0, sz = 0;
  const n = ondas.length;
  for (const o of ondas) {
    const f = o.k * (o.dx * x + o.dz * z - o.c * t);
    const q = Q / (o.k * o.A * n);
    const c = Math.cos(f);
    sx += q * o.A * o.dx * c;
    sz += q * o.A * o.dz * c;
    sy += o.A * Math.sin(f);
  }
  saida.x = sx; saida.y = sy; saida.z = sz;
  return saida;
}

// Altura da água num ponto do MUNDO. Em Gerstner o vértice anda de lado: o ponto que aparece em
// (x, z) veio de outro lugar. Três iterações acham esse ponto de origem (Lei da crista que anda).
export function criarAlturaDaAgua(ondas, Q) {
  const tmp = { x: 0, y: 0, z: 0 };
  return (x, z, t, percurso) => {
    const zz = z - percurso;
    let ox = x, oz = zz;
    for (let i = 0; i < 3; i++) {
      deslocar(ondas, Q, ox, oz, t, tmp);
      ox = x - tmp.x; oz = zz - tmp.z;
    }
    return deslocar(ondas, Q, ox, oz, t, tmp).y;
  };
}

// Malha radial: anéis cada vez mais espaçados — muito vértice perto da câmera, pouco no horizonte.
function malhaRadial(aneis, segmentos, crescimento) {
  const pos = [0, 0, 0], idx = [];
  for (let a = 1; a <= aneis; a++) {
    const r = 1.1 * (Math.pow(crescimento, a) - 1);
    for (let s = 0; s < segmentos; s++) {
      const ang = s / segmentos * Math.PI * 2;
      pos.push(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    }
  }
  for (let s = 0; s < segmentos; s++) idx.push(0, 1 + (s + 1) % segmentos, 1 + s);
  for (let a = 1; a < aneis; a++) {
    const i0 = 1 + (a - 1) * segmentos, i1 = 1 + a * segmentos;
    for (let s = 0; s < segmentos; s++) {
      const s1 = (s + 1) % segmentos;
      idx.push(i0 + s, i0 + s1, i1 + s, i0 + s1, i1 + s1, i1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

// GLSL comum ao vértice e ao fragmento: ondas, forma do casco e rastro.
function glslComum(config, ondas, amostrasCasco) {
  const n = config.navio;
  return /* glsl */ `
#define NW ${ondas.length}
uniform vec4 uOndas[NW];   // (dx, dz, k, c)
uniform float uAmp[NW];
uniform float uTempo;
uniform float uPercurso;
uniform sampler2D uCasco;  // meia-boca na linha d'água, ${amostrasCasco} amostras ao longo do casco
const float Q = ${config.mar.inclinacao.toFixed(3)};
const float Z_PROA = ${n.zProa.toFixed(1)};
const float COMPR = ${n.comprimento.toFixed(1)};
const float BOCA = ${n.meiaBoca.toFixed(2)};

float meiaBoca(float z){
  float u = (z - Z_PROA) / COMPR;
  if (u < 0.0 || u > 1.0) return -1.0;
  return texture2D(uCasco, vec2((u * ${amostrasCasco - 1}.0 + 0.5) / ${amostrasCasco}.0, 0.5)).r * BOCA;
}
// distância (m) de um ponto da água ao costado; negativa = dentro do casco
float distCasco(vec2 p){
  float w = meiaBoca(p.y);
  float zf = p.y < Z_PROA + 1.0 ? Z_PROA : Z_PROA + COMPR;
  float wf = p.y < Z_PROA + 1.0 ? 0.0 : texture2D(uCasco, vec2(${amostrasCasco - 0.5} / ${amostrasCasco}.0, 0.5)).r * BOCA;
  float fora = length(vec2(max(abs(p.x) - wf, 0.0), p.y - zf));
  return w < 0.0 ? fora : abs(p.x) - w;
}
// x = braços de Kelvin (o V que abre a 19,5° da proa), y = esteira turbulenta da popa, z = contato
vec3 rastro(vec2 p){
  vec2 rel = p - vec2(0.0, Z_PROA - 0.3);
  float braco = 0.0;
  if (rel.y > 0.0) {
    float larg = 0.9 + rel.y * 0.028;
    float d = abs(rel.x) - rel.y * 0.36;               // tan(19,5°) ≈ 0,354
    braco = exp(-d * d / (larg * larg)) * exp(-rel.y / 170.0);
  }
  float atras = p.y - (Z_PROA + COMPR - 2.0);
  float turb = 0.0;
  if (atras > -10.0) {
    float l = 3.6 + max(atras, 0.0) * 0.06;
    turb = smoothstep(1.0, 0.25, abs(p.x) / l) * exp(-max(atras, 0.0) / 210.0) * smoothstep(-10.0, 2.0, atras);
  }
  float hd = distCasco(p);
  float naProa = smoothstep(Z_PROA + 20.0, Z_PROA + 2.0, p.y);
  float contato = exp(-max(hd, 0.0) * 0.9) * (0.35 + 0.65 * naProa);
  return vec3(braco, turb, contato);
}
// ondas transversais de Kelvin: as cristas paralelas entre os braços do V
float transversais(vec2 p){
  vec2 rel = p - vec2(0.0, Z_PROA - 0.3);
  if (rel.y <= 0.0) return 0.0;
  float d = abs(rel.x) - rel.y * 0.36;
  return smoothstep(0.5, -3.0, d) * exp(-rel.y / 80.0) * sin(rel.y * 0.62 - 0.4);
}
vec3 gerstner(vec2 q, float some, out vec3 nrm){
  vec3 P = vec3(0.0), N = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < NW; i++){
    vec4 w = uOndas[i];
    float A = uAmp[i] * (i < 3 ? 1.0 : some);   // as 3 maiores nunca somem; as pequenas somem longe
    float f = w.z * (dot(w.xy, q) - w.w * uTempo);
    float C = cos(f), S = sin(f);
    float qi = Q / (w.z * uAmp[i] * float(NW));
    P.x += qi * A * w.x * C; P.z += qi * A * w.y * C; P.y += A * S;
    float WA = w.z * A;
    N.x -= w.x * WA * C; N.z -= w.y * WA * C; N.y -= qi * WA * S;
  }
  nrm = N;
  return P;
}
`;
}

export function criarMar(config, { ondas, normal, espuma, cuboCeu, uniformesCeu, amostrasCasco }) {
  const m = config.mar, n = config.navio;
  const comum = glslComum(config, ondas, amostrasCasco);
  // posição e comprimento dos mastros para a sombra projetada na água
  const mastrosZ = n.mastros.map((ms) => (n.zProa + ms.u * n.comprimento).toFixed(2)).join(', ');
  const mastrosH = n.mastros.map((ms) => (ms.secoes.reduce((a, b) => a + b, 0)).toFixed(1)).join(', ');
  const mastrosL = n.mastros.map((ms) => (ms.vergas[0] * 0.47).toFixed(1)).join(', ');

  const uniformes = {
    ...uniformesCeu,
    uOndas: { value: ondas.map((o) => new THREE.Vector4(o.dx, o.dz, o.k, o.c)) },
    uAmp: { value: ondas.map((o) => o.A) },
    uPercurso: { value: 0 },
    uCasco: { value: null },
    uNormal: { value: normal },
    uEspuma: { value: espuma },
    uCeuCubo: { value: cuboCeu },
    uReflexo: { value: null },
    uMatrizReflexo: { value: new THREE.Matrix4() },
    uCorSol: { value: config.sol.cor },
    uCorFundo: { value: m.corFundo },
    uCorEspalha: { value: m.corEspalhamento },
  };

  const material = new THREE.ShaderMaterial({
    uniforms: uniformes,
    vertexShader: comum + /* glsl */ `
      varying vec3 vW; varying vec2 vQ; varying vec4 vReflUv; varying float vH; varying float vDist; varying vec3 vRastro;
      uniform mat4 uMatrizReflexo;
      void main(){
        vec3 p = position;
        float dist = length(p.xz - cameraPosition.xz);
        float some = 1.0 - smoothstep(250.0, 1400.0, dist);
        vec2 q = p.xz + vec2(0.0, -uPercurso);          // o mar corre; o navio fica
        vec3 nrm;
        vec3 d = gerstner(q, some, nrm);
        d *= 1.0 - smoothstep(900.0, 2600.0, length(p.xz)); // horizonte calmo
        vec3 rs = rastro(p.xz);
        float hd = distCasco(p.xz);
        // onda de proa sobe, o meio do casco afunda a água, o rastro levanta cristas
        float ergue = 0.55 * exp(-max(hd, 0.0) * 0.5) * smoothstep(Z_PROA + 20.0, Z_PROA, p.z)
                    - 0.25 * exp(-max(hd, 0.0) * 0.4) * smoothstep(Z_PROA + 8.0, Z_PROA + 20.0, p.z) * smoothstep(Z_PROA + 32.0, Z_PROA + 22.0, p.z)
                    + 0.30 * rs.x + 0.14 * transversais(p.xz) + 0.12 * rs.y;
        vec3 wp = p + d + vec3(0.0, ergue, 0.0);
        vW = wp; vQ = q; vH = d.y; vDist = dist; vRastro = rs;
        vReflUv = uMatrizReflexo * vec4(p.x, 0.0, p.z, 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: comum + ATMOSFERA + /* glsl */ `
      varying vec3 vW; varying vec2 vQ; varying vec4 vReflUv; varying float vH; varying float vDist; varying vec3 vRastro;
      uniform sampler2D uNormal; uniform sampler2D uEspuma; uniform samplerCube uCeuCubo; uniform sampler2D uReflexo;
      uniform vec3 uCorSol; uniform vec3 uCorFundo; uniform vec3 uCorEspalha;

      // sombra do navio na água: raio até o sol testado contra o casco e contra cada mastro com velas
      float sombraNavio(vec3 p){
        float s = 0.0; vec3 L = uSolDir;
        for (int k = 0; k < 3; k++){
          float y = 1.2 + float(k) * 2.2;
          vec2 h = p.xz + L.xz * (y / L.y);
          float w = meiaBoca(h.y);
          if (w > 0.0 && abs(h.x) < w * 0.9) s = 1.0;
        }
        float mz[3]; float mh[3]; float ml[3];
        mz[0] = ${mastrosZ.split(', ')[0]}; mz[1] = ${mastrosZ.split(', ')[1]}; mz[2] = ${mastrosZ.split(', ')[2]};
        mh[0] = ${mastrosH.split(', ')[0]}; mh[1] = ${mastrosH.split(', ')[1]}; mh[2] = ${mastrosH.split(', ')[2]};
        ml[0] = ${mastrosL.split(', ')[0]}; ml[1] = ${mastrosL.split(', ')[1]}; ml[2] = ${mastrosL.split(', ')[2]};
        for (int i = 0; i < 3; i++){
          float t = (mz[i] - p.z) / L.z;
          if (t > 0.0){
            vec3 h = p + L * t;
            float w = ml[i] * (1.0 - 0.35 * smoothstep(8.0, mh[i], h.y));
            if (h.y > 6.0 && h.y < mh[i] && abs(h.x) < w) s = max(s, 0.8);
          }
        }
        return s;
      }

      void main(){
        vec2 sp = vW.xz;
        float mb = meiaBoca(sp.y);
        if (mb > 0.0 && abs(sp.x) < mb - 0.35) discard;   // não há água dentro do casco

        vec3 gn; gerstner(vQ, 1.0 - smoothstep(250.0, 1400.0, vDist), gn);
        vec3 N = gn / max(length(gn), 1e-4);
        vec2 vento = vec2(0.02, 0.06) * uTempo;
        vec3 d1 = texture2D(uNormal, vQ * 0.045 + vento).xyz * 2.0 - 1.0;
        vec3 d2 = texture2D(uNormal, vQ * 0.013 - vento * 0.4 + 0.37).xyz * 2.0 - 1.0;
        float detalhe = mix(1.0, 0.25, smoothstep(40.0, 700.0, vDist)) * (1.0 - vRastro.y * 0.6);
        vec2 dn = (d1.xy * 0.55 + d2.xy * 0.8) * detalhe;
        N = normalize(N + vec3(dn.x, 0.0, dn.y) * 0.9);

        vec3 V = normalize(cameraPosition - vW);
        float NdV = max(dot(N, V), 0.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 ceu = textureCube(uCeuCubo, R).rgb;
        float lum = dot(ceu, vec3(0.3, 0.5, 0.2));
        ceu = mix(vec3(lum), ceu, 1.15) * vec3(0.78, 0.8, 0.9);
        vec2 ruv = vReflUv.xy / vReflUv.w + N.xz * 0.035;
        vec4 navioRefl = texture2D(uReflexo, ruv);
        vec3 refl = mix(ceu, navioRefl.rgb, clamp(navioRefl.a, 0.0, 1.0) * 0.92);
        float F = min(0.02 + 0.98 * pow(clamp(1.0 - NdV, 0.0, 1.0), 5.0), 0.82);  // Fresnel de Schlick

        float solVisivel = 1.0 - sombraNavio(vW) * 0.85;
        float crista = clamp(vH * 0.55 + 0.35, 0.0, 1.5);
        float contraSol = pow(clamp(dot(-V, uSolDir) * 0.5 + 0.5, 0.0, 1.0), 3.0);
        vec3 corpo = uCorFundo + uCorEspalha * crista * (0.35 + 1.4 * contraSol * solVisivel) * vec3(1.0, 0.95, 0.85);
        corpo += vec3(0.05, 0.13, 0.11) * vRastro.y * 0.9;   // água aerada da esteira é mais clara
        vec3 cor = mix(corpo, refl, F);

        vec3 H = normalize(uSolDir + V);
        float NdH = max(dot(N, H), 0.0);
        vec3 esp = uCorSol * (pow(NdH, 900.0) * 55.0 + pow(NdH, 140.0) * 3.2 + pow(NdH, 30.0) * 0.25);
        cor += esp * solVisivel * (1.0 - smoothstep(1800.0, 3000.0, vDist) * 0.6);

        vec2 fq = vQ + dn * 0.6;
        float f1 = texture2D(uEspuma, fq * 0.11).r, f2 = texture2D(uEspuma, fq * 0.037 + 0.5).r;
        float mancha = texture2D(uEspuma, fq * 0.021).g;
        float trama = f1 * 0.6 + f2 * 0.55;
        float topo = smoothstep(${m.espumaCrista.toFixed(2)}, 1.55, vH + mancha * 0.5) * 0.9;
        float esteira = vRastro.x * 0.85 + vRastro.y * (0.55 + 0.45 * mancha) + vRastro.z * 1.1;
        float fm = clamp(topo + esteira, 0.0, 1.4);
        float espuma = smoothstep(1.0 - fm, 1.25 - fm * 0.8, trama) * min(fm * 1.6, 1.0);
        float leitosa = clamp(fm * 0.45, 0.0, 0.5);
        float lam = max(dot(N, uSolDir), 0.0) * 0.8 + 0.2;
        vec3 corEspuma = vec3(0.24, 0.24, 0.30) + uCorSol * lam * 0.95 * solVisivel;
        cor = mix(cor, corEspuma * 0.55 + vec3(0.02, 0.06, 0.07), leitosa * (1.0 - espuma));
        cor = mix(cor, corEspuma, espuma);

        cor *= mix(0.55, 1.0, smoothstep(0.0, 3.5, distCasco(sp)));   // água escurece colada ao casco

        vec3 olhar = -V;
        vec3 horizonte = atmosfera(vec3(olhar.x, 0.0, olhar.z) + vec3(1e-3, 0.0, 0.0));
        float neblina = max(1.0 - exp(-vDist * ${m.neblina}), smoothstep(1500.0, 2900.0, vDist));
        cor = mix(cor, horizonte, neblina);
        gl_FragColor = vec4(clamp(cor, 0.0, 64.0), 1.0);
      }`,
  });

  const malha = new THREE.Mesh(malhaRadial(m.aneis, m.segmentos, m.crescimentoAnel), material);
  malha.frustumCulled = false;
  malha.renderOrder = 1;
  return { malha, uniformes };
}

// Textura 1D com a meia-boca do casco na linha d'água (0..1 da boca máxima).
export function texturaDoCasco(larguras, meiaBocaMax) {
  const n = larguras.length, dados = new Uint8Array(n * 4);
  larguras.forEach((w, i) => {
    const v = Math.round(Math.min(Math.max(w / meiaBocaMax, 0), 1) * 255);
    dados[i * 4] = dados[i * 4 + 1] = dados[i * 4 + 2] = v; dados[i * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(dados, n, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

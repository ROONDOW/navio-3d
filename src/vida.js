// Borrifo (partículas com gravidade) e gaivotas.
import * as THREE from 'three';

// Borrifo: buffer circular de N gotas. Nascem na proa (onde o casco corta a onda), ao longo do
// costado e na esteira da popa; sobem, caem a 9,8 m/s², ficam para trás com o mar que corre.
export function criarBorrifo(config, texturaPonto, N = 1400) {
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), vida = new Float32Array(N), dur = new Float32Array(N), tam = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -100;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aVida', new THREE.BufferAttribute(vida, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aTam', new THREE.BufferAttribute(tam, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: texturaPonto }, uSol: { value: config.sol.cor }, uEscala: { value: 600 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aVida; attribute float aTam; uniform float uEscala; varying float vVida;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        vVida = aVida; gl_PointSize = aTam * uEscala / -mv.z * (0.6 + 0.8 * (1.0 - aVida)); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform vec3 uSol; varying float vVida;
      void main(){ float a = texture2D(uTex, gl_PointCoord).a;
        float some = smoothstep(0.0, 0.15, vVida) * smoothstep(1.0, 0.75, 1.0 - vVida);
        gl_FragColor = vec4((vec3(0.35, 0.36, 0.42) + uSol * 0.9) * a * some * 0.32, 1.0); }`,
  });
  const pontos = new THREE.Points(geo, material);
  pontos.frustumCulled = false;
  const v = config.mar.velocidadeNavio, Z0 = config.navio.zProa, L = config.navio.comprimento;
  let cursor = 0, acumulado = 0;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  const nascer = (o, vv, du, t) => {
    const i = cursor; cursor = (cursor + 1) % N;
    pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z;
    vel[i * 3] = vv.x; vel[i * 3 + 1] = vv.y; vel[i * 3 + 2] = vv.z;
    vida[i] = 1; dur[i] = du; tam[i] = t;
  };
  function atualizar(dt, tempo, navio, alturaAgua) {
    acumulado += dt * 420;
    const surto = Math.max(0, Math.sin(tempo * 0.9) * 0.5 + 0.6); // a proa bate mais forte em ondas
    while (acumulado > 1) {
      acumulado -= 1;
      const r = Math.random(), lado = Math.random() < 0.5 ? -1 : 1;
      let z, x, sobe, abre;
      if (r < 0.55) { z = Z0 - 0.5 + Math.random() * 4; x = lado * (0.3 + (z - Z0 + 0.5) * 0.65); sobe = 2.5 + Math.random() * 3.5 * surto; abre = 2.2; }
      else if (r < 0.85) { z = Z0 + 4 + Math.random() * 24; x = lado * (4.7 + Math.random() * 0.3); sobe = 0.6 + Math.random() * 1.2; abre = 1; }
      else { z = Z0 + L - 1 + Math.random() * 6; x = (Math.random() - 0.5) * 7; sobe = 0.8 + Math.random() * 1.6; abre = 1.4; }
      p.set(x, 0, z).applyMatrix4(navio.matrixWorld);
      p.y = alturaAgua(p.x, p.z) + 0.1;
      d.set(lado * abre * (0.5 + Math.random()), sobe, v * (0.2 + Math.random() * 0.4));
      nascer(p, d, 0.9 + Math.random() * 1.1, 0.18 + Math.random() * 0.45);
    }
    for (let i = 0; i < N; i++) {
      if (vida[i] <= 0) continue;
      vida[i] -= dt / dur[i];
      vel[i * 3 + 1] -= 9.8 * dt;
      vel[i * 3] *= 0.985;
      vel[i * 3 + 2] += (v - vel[i * 3 + 2]) * dt * 0.8; // arrasto: a gota passa a andar com o mar
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (vida[i] <= 0) pos[i * 3 + 1] = -100;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aVida.needsUpdate = true; geo.attributes.aTam.needsUpdate = true;
  }
  return { pontos, atualizar, material };
}

// Gaivotas: corpo, cabeça, bico e asas de duas articulações (braço e mão). Voam em elipses em
// volta do navio; alternam batida (9 Hz) e planeio, com a mão atrasada em relação ao braço.
export function criarGaivotas(n = 7) {
  const grupo = new THREE.Group();
  const branco = new THREE.MeshStandardMaterial({ color: 0xe8e2dc, roughness: 0.8, side: THREE.DoubleSide });
  const cinza = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.8, side: THREE.DoubleSide });
  const bico = new THREE.MeshStandardMaterial({ color: 0xd8a030 });
  const asa = (envergadura, raiz, ponta, recuo) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -raiz / 2, envergadura, 0, -ponta / 2 + recuo, envergadura, 0, ponta / 2 + recuo, 0, 0, raiz / 2], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    return g;
  };
  const gBraco = asa(0.55, 0.32, 0.26, 0.05), gMao = asa(0.6, 0.26, 0.08, 0.2);
  const aves = [];
  for (let i = 0; i < n; i++) {
    const ave = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), branco); corpo.scale.set(1, 0.9, 3.2); ave.add(corpo);
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), branco); cabeca.position.set(0, 0.05, -0.36); ave.add(cabeca);
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), bico); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.04, -0.47); ave.add(b);
    const asas = [];
    for (const lado of [-1, 1]) {
      const ombro = new THREE.Group(); ombro.position.set(lado * 0.08, 0.03, -0.02); ombro.scale.x = lado;
      ombro.add(new THREE.Mesh(gBraco, branco));
      const pulso = new THREE.Group(); pulso.position.x = 0.55; ombro.add(pulso);
      pulso.add(new THREE.Mesh(gMao, cinza)); // pontas escuras, como nas gaivotas de verdade
      ave.add(ombro); asas.push([ombro, pulso]);
    }
    ave.scale.setScalar(1.6);
    grupo.add(ave);
    aves.push({ ave, asas, raio: 22 + Math.random() * 30, alt: 18 + Math.random() * 16, vel: (0.18 + Math.random() * 0.12) * (Math.random() < 0.5 ? 1 : -1),
      fase: Math.random() * 6.28, faseAsa: Math.random() * 6.28, cz: -10 + Math.random() * 20 });
  }
  function atualizar(t) {
    for (const a of aves) {
      const ang = a.fase + t * a.vel;
      a.ave.position.set(Math.cos(ang) * a.raio, a.alt + Math.sin(t * 0.7 + a.fase) * 2.5, Math.sin(ang) * a.raio * 0.7 + a.cz);
      const vx = -Math.sin(ang) * a.vel, vz = Math.cos(ang) * a.vel * 0.7;
      a.ave.rotation.set(0, Math.atan2(-vx, -vz), -Math.sign(a.vel) * 0.35); // inclina para dentro da curva
      const batendo = Math.sin(t * 0.35 + a.faseAsa) > -0.2;
      const bate = batendo ? Math.sin(t * 9 + a.faseAsa) : 0;
      for (const [ombro, pulso] of a.asas) {
        ombro.rotation.z = bate * 0.55 + (batendo ? 0.05 : 0.12);
        pulso.rotation.z = batendo ? Math.sin(t * 9 + a.faseAsa - 0.9) * 0.45 : -0.08;
      }
    }
  }
  return { grupo, atualizar };
}

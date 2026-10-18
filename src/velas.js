// Velas: superfície em grade cujos vértices são empurrados ao longo da normal pela "barriga"
// (seno nos dois sentidos), rajada lenta e tremor fino. A normal é refeita por diferença finita,
// para a luz acompanhar a curva. A luz do sol atravessa a lona por trás (translucidez barata).
import * as THREE from 'three';

export const uniformesVela = {
  uTempo: { value: 0 },
  uSolVista: { value: new THREE.Vector3(0, 0, 1) }, // sol em espaço de câmera (o fragmento trabalha lá)
  uCorSol: { value: new THREE.Color(1, 0.6, 0.32) },
};

const BARRIGA = /* glsl */ `
uniform float uTempo;
attribute vec3 aTu; attribute vec3 aTv; attribute vec3 aVela; attribute vec2 aUv;
// aVela = (profundidade da barriga, fase, 1 = bandeira)
float barriga(vec2 uv){
  float prof = aVela.x, fase = aVela.y;
  if (aVela.z > 0.5) {  // bandeira: onda que corre da adriça para a ponta, crescendo na ponta
    float w = sin(uv.x * 7.0 - uTempo * 9.0 + fase) * 0.6 + sin(uv.x * 13.0 - uTempo * 14.0 + fase * 1.7 + uv.y * 2.0) * 0.25;
    return w * uv.x * prof;
  }
  float rajada = 1.0 + 0.08 * sin(uTempo * 1.6 + fase) + 0.04 * sin(uTempo * 4.1 + fase * 2.0);
  float b = prof * rajada
          * pow(max(sin(3.14159 * clamp(uv.x, 0.0, 1.0)), 0.0), 0.8)
          * pow(max(sin(3.14159 * (0.05 + 0.9 * clamp(uv.y, 0.0, 1.0))), 0.0), 0.85);
  float tremor = sin(uv.x * 11.0 + uTempo * 8.5 + fase) * sin(uv.y * 7.0 - uTempo * 6.0) * 0.035 * prof * uv.y;
  return b + tremor;
}
`;

const DESLOCA = /* glsl */ `
float b0 = barriga(aUv);
vec3 transformed = position + normal * b0;
`;

const NORMAL = /* glsl */ `
float eps = 0.01;
vec2 suv = clamp(aUv, 0.0, 1.0 - eps);
float s0 = barriga(suv), su = barriga(suv + vec2(eps, 0.0)), sv = barriga(suv + vec2(0.0, eps));
vec3 dPu = aTu + normal * (su - s0) / eps;
vec3 dPv = aTv + normal * (sv - s0) / eps;
vec3 cr = cross(dPu, dPv);
vec3 objectNormal = dot(cr, cr) > 1e-10 ? cr * inversesqrt(dot(cr, cr)) : normal;
if (dot(objectNormal, normal) < 0.0) objectNormal = -objectNormal;
`;

export function materialVela(mapa, { bandeira = false, cor = 0xffffff } = {}) {
  const material = new THREE.MeshStandardMaterial({
    map: mapa, color: cor, side: THREE.DoubleSide, roughness: 0.92, metalness: 0,
    alphaTest: bandeira ? 0.5 : 0, envMapIntensity: 0.6,
  });
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformesVela);
    s.vertexShader = BARRIGA + s.vertexShader
      .replace('#include <beginnormal_vertex>', NORMAL)
      .replace('#include <begin_vertex>', DESLOCA);
    s.fragmentShader = 'uniform vec3 uSolVista; uniform vec3 uCorSol;\n' + s.fragmentShader.replace('#include <opaque_fragment>', /* glsl */ `
      float atravessa = clamp(-dot(normal, uSolVista), 0.0, 1.0);
      outgoingLight += diffuseColor.rgb * uCorSol * atravessa * ${bandeira ? '0.2' : '0.45'};
      #include <opaque_fragment>`);
  };
  // a sombra precisa da mesma barriga, senão a vela inflada projeta sombra de vela chapada
  const profundidade = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide,
    map: bandeira ? mapa : null, alphaTest: bandeira ? 0.5 : 0,
  });
  profundidade.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformesVela);
    s.vertexShader = BARRIGA + s.vertexShader.replace('#include <begin_vertex>', DESLOCA);
  };
  return { material, profundidade };
}

// Grade de vela entre quatro cantos (a, b no topo; c, d embaixo), com os atributos da barriga.
export function geometriaVela([a, b, c, d], frente, profundidade, fase, { nu = 18, nv = 16, bandeira = 0 } = {}) {
  const pos = [], nrm = [], uv = [], tu = [], tv = [], vela = [], idx = [];
  const topo = new THREE.Vector3(), base = new THREE.Vector3(), p = new THREE.Vector3();
  const du = new THREE.Vector3(), dv = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      topo.lerpVectors(a, b, u); base.lerpVectors(d, c, u); p.lerpVectors(topo, base, v);
      dv.subVectors(base, topo);
      du.subVectors(b, a).multiplyScalar(1 - v).add(new THREE.Vector3().subVectors(c, d).multiplyScalar(v));
      nn.crossVectors(du, dv);
      if (nn.lengthSq() < 1e-8) nn.copy(frente);
      nn.normalize(); if (nn.dot(frente) < 0) nn.negate();
      pos.push(p.x, p.y, p.z); nrm.push(nn.x, nn.y, nn.z); uv.push(u, v);
      tu.push(du.x, du.y, du.z); tv.push(dv.x, dv.y, dv.z); vela.push(profundidade, fase, bandeira);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const k = j * (nu + 1) + i;
    idx.push(k, k + nu + 1, k + 1, k + 1, k + nu + 1, k + nu + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aTu', new THREE.Float32BufferAttribute(tu, 3));
  g.setAttribute('aTv', new THREE.Float32BufferAttribute(tv, 3));
  g.setAttribute('aVela', new THREE.Float32BufferAttribute(vela, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.boundingSphere.radius += profundidade * 2 + 1;
  return g;
}

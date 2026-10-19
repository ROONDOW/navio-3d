// O navio, inteiro em código. Coordenadas locais: proa em -Z, x = bombordo(-)/boreste(+), y = cima,
// y = 0 é a linha d'água. Peças fixas são juntadas por material (uma malha por material) e todo o
// cordame vira UMA InstancedMesh — é isso que deixa centenas de peças custarem poucas chamadas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aleatorio, texturaTabuas, texturaCasco, texturaLona, texturaBandeira, texturaGrade } from './texturas.js';
import { materialVela, geometriaVela } from './velas.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

// ════════════════════════════ forma do casco ════════════════════════════
// u vai de 0 (proa) a 1 (popa). Cada função devolve metros.
export function formaDoCasco(config) {
  const { zProa: Z0, comprimento: L, meiaBoca: B, calado: D } = config.navio;
  const QUEBRAS = { castelo: 0.155, tombadilho: 0.665, chupeta: 0.865 }; // degraus do convés

  // meia-boca máxima na estação u: afina na proa, estreita um pouco na popa (painel de popa)
  const bocaMax = (u) => {
    let e = Math.pow(Math.sin(Math.min(u / 0.5, 1) * Math.PI / 2), 0.62);
    if (u > 0.55) { const t = (u - 0.55) / 0.45; e *= 1 - 0.28 * t * t; }
    return B * e;
  };
  // profundidade da quilha (positiva para baixo): sobe na proa e um pouco na popa
  const fundo = (u) => {
    const e = Math.min(u / 0.2, 1);
    let d = D * (1 - Math.pow(1 - e, 2) * 0.7);
    if (u > 0.88) d *= 1 - (u - 0.88) / 0.12 * 0.35;
    return d;
  };
  const tosado = (u) => 2.9 + 0.8 * (1 - u) ** 2 + 0.3 * u * u; // a linha do convés sobe nas pontas
  // altura do convés onde se pisa (com os degraus do castelo, tombadilho e chupeta)
  const conves = (u) => {
    const b = tosado(u);
    if (u < QUEBRAS.castelo) return b + 1.3;
    if (u < QUEBRAS.tombadilho) return b;
    if (u < QUEBRAS.chupeta) return b + 1.5;
    return b + 2.7;
  };
  // altura da borda do costado (suave, sem degrau: a amurada cobre os degraus por fora)
  const borda = (u) => tosado(u) + 1.05 + 1.3 * (1 - sm(0.155, 0.23, u)) + 1.5 * sm(0.59, 0.665, u)
    + 1.2 * sm(0.79, 0.865, u) + 0.9 * (1 - u) ** 6;
  const sAltura = (u, y) => Math.min(Math.max((y + fundo(u)) / (borda(u) + fundo(u)), 0), 1);
  // seção transversal: bojo cheio no meio, fino nas pontas, com leve "tumblehome" no alto
  const secao = (u, s) => {
    const fino = 1 - bocaMax(u) / B, joelho = 0.62;
    if (s < joelho) return Math.pow(Math.sin(s / joelho * Math.PI / 2), 0.45 + fino * 1.4);
    const t = (s - joelho) / (1 - joelho);
    return 1 - 0.09 * t * t;
  };
  const largura = (u, y) => 0.18 + (bocaMax(u) - 0.18) * secao(u, sAltura(u, y));
  // a roda de proa avança no alto (lançamento) e a popa se projeta para trás
  const avanco = (u, s) => -3.2 * Math.pow(Math.max(0, 1 - u / 0.2), 2.5) * Math.pow(s, 1.5)
    + 1.3 * Math.pow(Math.max(0, (u - 0.85) / 0.15), 2) * s;
  const zEm = (u, y) => Z0 + u * L + avanco(u, sAltura(u, y));
  const ponto = (u, y, lado, alvo = new THREE.Vector3()) => alvo.set(lado * largura(u, y), y, zEm(u, y));
  // normal do costado por diferença finita (para encostar portinholas, frisos e mesas de enxárcia)
  const normal = (u, y, lado) => {
    const a = ponto(u + 0.002, y, lado), b = ponto(u - 0.002, y, lado), c = ponto(u, y + 0.05, lado), d = ponto(u, y - 0.05, lado);
    const n = new THREE.Vector3().crossVectors(a.sub(b), c.sub(d)).normalize();
    if (n.x * lado < 0) n.negate();
    return n;
  };
  return { Z0, L, B, QUEBRAS, bocaMax, fundo, conves, borda, largura, ponto, normal, zEm };
}

// ════════════════════════════ juntador por material ════════════════════════════
class Lote {
  constructor() { this.porMaterial = new Map(); this.rotulo = null; this.caixas = new Map(); }
  add(geo, material, matriz) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const nome of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(nome)) g.deleteAttribute(nome);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matriz) g.applyMatrix4(matriz);
    if (this.rotulo) { // caixa medida da geometria já posta no lugar: o teste do convés não depende de pegada escrita à mão
      g.computeBoundingBox();
      const c = this.caixas.get(this.rotulo);
      if (c) c.union(g.boundingBox); else this.caixas.set(this.rotulo, g.boundingBox.clone());
    }
    if (!this.porMaterial.has(material)) this.porMaterial.set(material, []);
    this.porMaterial.get(material).push(g);
  }
  montar(grupo) {
    for (const [mat, geos] of this.porMaterial) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = !mat.userData.semSombra;
      m.receiveShadow = true;
      grupo.add(m);
      geos.forEach((g) => g.dispose());
    }
  }
}

const compor = (pos = V(0, 0, 0), rot = new THREE.Euler(), esc = V(1, 1, 1)) =>
  new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), esc);
// matriz que estica um objeto de altura 1 (eixo Y) entre dois pontos
function entre(a, b, rx = 1, rz = rx) {
  const d = new THREE.Vector3().subVectors(b, a), comp = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(rx, comp, rz));
}
const comBase = (pos, x, y, z, esc = V(1, 1, 1)) => new THREE.Matrix4().makeBasis(x, y, z).scale(esc).setPosition(pos);

// perfis torneados
const perfil = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const CANO = perfil([[0.001, -0.2], [0.07, -0.19], [0.08, -0.12], [0.05, -0.07], [0.19, -0.03], [0.215, 0.04], [0.205, 0.24], [0.225, 0.29],
  [0.195, 0.34], [0.175, 1.2], [0.19, 1.25], [0.16, 1.3], [0.15, 1.9], [0.185, 1.95], [0.195, 2.05], [0.165, 2.1], [0.09, 2.1], [0.09, 1.7]], 18);
const BALAUSTRE = perfil([[0.001, 0], [0.07, 0], [0.07, 0.06], [0.045, 0.1], [0.05, 0.22], [0.08, 0.36], [0.05, 0.52], [0.035, 0.6],
  [0.06, 0.66], [0.06, 0.72], [0.001, 0.72]], 8);
const LANTERNA = perfil([[0.001, 0], [0.34, 0], [0.36, 0.02], [0.4, 0.2], [0.43, 0.45], [0.44, 0.55], [0.43, 0.65], [0.4, 0.9], [0.36, 1.08], [0.34, 1.1], [0.001, 1.1]], 18);
const CUBO = new THREE.BoxGeometry(1, 1, 1);
const CILINDRO = new THREE.CylinderGeometry(1, 1, 1, 12);
const CILINDRO6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const ESFERA = new THREE.SphereGeometry(1, 12, 8);

export function criarNavio(config) {
  const n = config.navio, F = formaDoCasco(config);
  const rnd = aleatorio(2024);
  const grupo = new THREE.Group();
  const lote = new Lote();
  // pegada de cada peça no convés (retângulo em x e z), para o teste provar que nada se atropela
  const disposicao = { itens: [] };
  const ocupa = (nome, x0, x1, z0, z1) => disposicao.itens.push({ nome, x0, x1, z0, z1 });
  const cordas = []; // [a, b, raio, rótulo]
  let rotulo = 'cabo';
  // corda com barriga: divide em pedaços e afunda o meio numa parábola
  const corda = (a, b, raio = 0.035, flecha = 0, pedacos = 1) => {
    if (flecha === 0 || pedacos === 1) { cordas.push([a.clone(), b.clone(), raio, rotulo]); return; }
    let ant = a.clone();
    for (let i = 1; i <= pedacos; i++) {
      const t = i / pedacos, p = a.clone().lerp(b, t);
      p.y -= flecha * 4 * t * (1 - t);
      cordas.push([ant, p.clone(), raio, rotulo]); ant = p;
    }
  };

  // ── materiais ──
  const tex = {
    casco: texturaCasco(),
    conves: texturaTabuas({ semente: 3, base: [30, 32, 44], fileiras: 8 }),
    parede: texturaTabuas({ semente: 8, base: [22, 45, 22], fileiras: 10, desgaste: 0.8 }),
    mastro: texturaTabuas({ semente: 13, base: [26, 40, 26], fileiras: 3, pregos: false }),
  };
  const std = (p) => new THREE.MeshStandardMaterial({ envMapIntensity: 0.7, ...p });
  const M = {
    casco: std({ map: tex.casco, roughness: 0.72, side: THREE.DoubleSide }),
    conves: std({ map: tex.conves, roughness: 0.85 }),
    parede: std({ map: tex.parede, roughness: 0.8 }),
    mastro: std({ map: tex.mastro, color: 0xcaa488, roughness: 0.7 }),
    amurada: std({ map: tex.parede, color: 0xb0896a, roughness: 0.7 }),
    vermelho: std({ color: 0x64150f, roughness: 0.6 }),
    preto: std({ color: 0x15100c, roughness: 0.6 }),
    ouro: std({ color: 0xb8893a, metalness: 1, roughness: 0.38, envMapIntensity: 0.8 }),
    ferro: std({ color: 0x1c1c1f, metalness: 0.85, roughness: 0.42 }),
    corda: std({ color: 0x3a2a1c, roughness: 0.95 }),
    vao: std({ color: 0x050302, roughness: 1 }),
    janela: std({ color: 0x000000, emissive: 0xffa64a, emissiveIntensity: 3.2, roughness: 0.25 }),
    lampada: std({ color: 0x000000, emissive: 0xffb45c, emissiveIntensity: 9, roughness: 0.2 }),
  };
  M.janela.userData.semSombra = true; M.lampada.userData.semSombra = true;

  // ════ casco: grade de 120 estações × 68 pontos (34 por bordo, da quilha à borda) ════
  {
    const pos = [], uv = [], idx = [], p = new THREE.Vector3();
    const NU = 120, NC = 68, MEIO = 34;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, fd = F.fundo(u), bd = F.borda(u);
      for (let c = 0; c <= NC; c++) {
        const lado = c < MEIO ? -1 : 1, t = Math.pow(Math.abs(c - MEIO) / MEIO, 0.9);
        const y = -fd + t * (bd + fd);
        if (c === MEIO) p.set(0, -fd - 0.32, F.Z0 + u * F.L); // quilha
        else F.ponto(u, y, lado, p);
        pos.push(p.x, p.y, p.z); uv.push((F.Z0 + u * F.L) / 8, t);
      }
    }
    for (let i = 0; i < NU; i++) for (let c = 0; c < NC; c++) {
      const a = i * (NC + 1) + c, b = a + 1, d = a + NC + 1, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    lote.add(g, M.casco);
    // painel de popa: leque fechando a última estação
    const anel = [];
    for (let c = 0; c <= NC; c++) {
      const lado = c < MEIO ? -1 : 1, t = Math.pow(Math.abs(c - MEIO) / MEIO, 0.9), y = -F.fundo(1) + t * (F.borda(1) + F.fundo(1));
      anel.push(c === MEIO ? V(0, -F.fundo(1) - 0.32, F.Z0 + F.L) : F.ponto(1, y, lado));
    }
    const centro = V(0, (F.borda(1) - F.fundo(1)) / 2, F.zEm(1, (F.borda(1) - F.fundo(1)) / 2));
    const pp = [centro.x, centro.y, centro.z], puv = [0.5, 0.5], pi = [];
    anel.forEach((q) => { pp.push(q.x, q.y, q.z); puv.push(q.x / 8, (q.y + F.fundo(1)) / (F.borda(1) + F.fundo(1))); });
    for (let k = 0; k < anel.length - 1; k++) pi.push(0, k + 1, k + 2);
    const gp = new THREE.BufferGeometry();
    gp.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    gp.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
    gp.setIndex(pi); gp.computeVertexNormals();
    lote.add(gp, M.casco);
  }

  // ════ conveses (um por patamar), com abaulamento para escorrer água ════
  const conves = (u0, u1) => {
    const NU = Math.max(4, Math.ceil((u1 - u0) * 90)), NC = 12, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = u0 + (u1 - u0) * i / NU, y0 = F.conves(Math.min(Math.max(u, u0 + 1e-4), u1 - 1e-4));
      const meia = Math.max(F.largura(u, y0) - 0.16, 0.05);
      for (let c = 0; c <= NC; c++) {
        const g = -1 + 2 * c / NC, x = g * meia, y = y0 + 0.1 * (1 - g * g), z = F.zEm(u, y0);
        pos.push(x, y, z); uv.push(z / 5, x / 5);
      }
    }
    for (let i = 0; i < NU; i++) for (let c = 0; c < NC; c++) {
      const a = i * (NC + 1) + c;
      idx.push(a, a + NC + 1, a + 1, a + 1, a + NC + 1, a + NC + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    lote.add(g, M.conves);
  };
  const Q = F.QUEBRAS;
  conves(0.02, Q.castelo); conves(Q.castelo, Q.tombadilho); conves(Q.tombadilho, Q.chupeta); conves(Q.chupeta, 0.995);

  // ════ amurada e frisos: tubos que correm ao longo do costado ════
  const linhaCostado = (s, lado, afasta, u0 = 0.01, u1 = 0.995) => {
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const u = u0 + (u1 - u0) * i / 90, fd = F.fundo(u), y = -fd + s * (F.borda(u) + fd);
      pts.push(F.ponto(u, y, lado).add(F.normal(u, y, lado).multiplyScalar(afasta)));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  const linhaBorda = (lado, ergue, recua) => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const u = 0.012 + 0.983 * i / 80, y = F.borda(u) + ergue, p = F.ponto(u, F.borda(u) - 0.01, lado);
      p.x -= lado * recua; p.y = y; pts.push(p);
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  for (const lado of [-1, 1]) {
    lote.add(new THREE.TubeGeometry(linhaBorda(lado, 0.04, 0.08), 160, 0.11, 6), M.amurada);       // corrimão
    lote.add(new THREE.TubeGeometry(linhaCostado(0.84, lado, 0.0), 160, 0.07, 6), M.ouro);          // friso dourado
    lote.add(new THREE.TubeGeometry(linhaCostado(0.46, lado, 0.03), 160, 0.12, 6), M.preto);        // cinta da linha d'água
    lote.add(new THREE.TubeGeometry(linhaCostado(0.7, lado, 0.06), 160, 0.09, 6), M.preto);         // cinta alta
    lote.add(new THREE.TubeGeometry(linhaCostado(0.975, lado, 0.12), 160, 0.05, 6), M.ouro);        // filete da borda
  }

  // ════ anteparas nos degraus do convés, com portas e janelas ════
  const antepara = (u, yBaixo, yAlto, sentido) => {
    const wb = F.largura(u, yBaixo) - 0.12, wa = F.largura(u, yAlto) - 0.12;
    const forma = new THREE.Shape();
    forma.moveTo(-wb, yBaixo); forma.lineTo(wb, yBaixo); forma.lineTo(wa, yAlto + 0.12); forma.lineTo(-wa, yAlto + 0.12); forma.closePath();
    const g = new THREE.ExtrudeGeometry(forma, { depth: 0.2, bevelEnabled: false });
    const uvs = g.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 0.2, uvs.getY(i) * 0.2);
    const z = F.Z0 + u * F.L;
    lote.add(g, M.parede, compor(V(0, 0, z - 0.1)));
    ocupa('antepara ' + u, -Math.max(wb, wa), Math.max(wb, wa), z - 0.1, z + 0.1);
    return { z: z + sentido * 0.12, largAlto: wa };
  };
  const porta = (x, y, z, s, l = 0.9, a = 1.25) => {
    lote.add(CUBO, M.vao, compor(V(x, y + a / 2, z), undefined, V(l, a, 0.05)));
    lote.add(CUBO, M.amurada, compor(V(x, y + a + 0.06, z + s * 0.02), undefined, V(l + 0.2, 0.12, 0.08)));
    for (const dx of [-1, 1]) lote.add(CUBO, M.amurada, compor(V(x + dx * (l / 2 + 0.05), y + a / 2, z + s * 0.02), undefined, V(0.1, a, 0.08)));
    lote.add(CUBO, M.vermelho, compor(V(x, y + a / 2, z + s * 0.03), undefined, V(l * 0.92, a * 0.96, 0.05)));
    lote.add(ESFERA, M.ouro, compor(V(x + l * 0.3, y + a * 0.5, z + s * 0.08), undefined, V(0.05, 0.05, 0.05))); // maçaneta
  };
  const janela = (x, y, z, s, l = 0.55, a = 0.5) => {
    lote.add(CUBO, M.janela, compor(V(x, y, z), undefined, V(l, a, 0.04)));
    for (const dy of [-1, 1]) lote.add(CUBO, M.ouro, compor(V(x, y + dy * (a / 2 + 0.04), z + s * 0.03), undefined, V(l + 0.16, 0.07, 0.06)));
    for (const dx of [-1, 1]) lote.add(CUBO, M.ouro, compor(V(x + dx * (l / 2 + 0.04), y, z + s * 0.03), undefined, V(0.07, a, 0.06)));
    lote.add(CUBO, M.ouro, compor(V(x, y, z + s * 0.03), undefined, V(0.035, a, 0.04)));  // caixilho
    lote.add(CUBO, M.ouro, compor(V(x, y, z + s * 0.03), undefined, V(l, 0.035, 0.04)));
  };
  const cast = antepara(Q.castelo, F.conves(Q.castelo + 0.001), F.conves(Q.castelo - 0.001), 1);
  const tomb = antepara(Q.tombadilho, F.conves(Q.tombadilho - 0.001), F.conves(Q.tombadilho + 0.001), -1);
  const chup = antepara(Q.chupeta, F.conves(Q.chupeta - 0.001), F.conves(Q.chupeta + 0.001), -1);
  const yMeio = F.conves(Q.castelo + 0.001), yTomb = F.conves(Q.tombadilho - 0.001), yChup = F.conves(Q.chupeta - 0.001);
  porta(0, yMeio, cast.z, 1, 0.8, 1.1); janela(-2.2, yMeio + 0.7, cast.z, 1, 0.45, 0.4); janela(2.2, yMeio + 0.7, cast.z, 1, 0.45, 0.4);
  porta(-1.1, yTomb, tomb.z, -1); porta(1.1, yTomb, tomb.z, -1); janela(-3, yTomb + 0.8, tomb.z, -1); janela(3, yTomb + 0.8, tomb.z, -1);
  porta(0, yChup, chup.z, -1, 0.8, 1.05); janela(-1.7, yChup + 0.65, chup.z, -1, 0.5, 0.4); janela(1.7, yChup + 0.65, chup.z, -1, 0.5, 0.4);

  // balaustradas na frente de cada patamar elevado
  const balaustrada = (x0, x1, y, z) => {
    if (x1 - x0 < 0.4) return; // trecho curto demais entre a escada e a borda: fica só a amurada
    lote.rotulo = 'balaustrada ' + x0.toFixed(1) + ' ' + z.toFixed(1);
    const nb = Math.max(2, Math.round(Math.abs(x1 - x0) / 0.28));
    for (let i = 0; i <= nb; i++) lote.add(BALAUSTRE, M.amurada, compor(V(x0 + (x1 - x0) * i / nb, y, z)));
    lote.add(CUBO, M.amurada, compor(V((x0 + x1) / 2, y + 0.76, z), undefined, V(Math.abs(x1 - x0) + 0.16, 0.1, 0.18)));
    lote.add(CUBO, M.amurada, compor(V((x0 + x1) / 2, y + 0.03, z), undefined, V(Math.abs(x1 - x0) + 0.1, 0.07, 0.14)));
    lote.rotulo = null;
  };
  const yC = F.conves(Q.castelo - 0.001) + 0.1, yT = F.conves(Q.tombadilho + 0.001) + 0.1, yP = F.conves(Q.chupeta + 0.001) + 0.1;
  // vãos das escadas: 1,3 m (escada de 1,08 m com os corrimãos + o ressalto de 8 cm do corrimão da balaustrada)
  balaustrada(-cast.largAlto + 0.2, -2.8, yC, cast.z - 0.2); balaustrada(-1.5, 1.5, yC, cast.z - 0.2); balaustrada(2.8, cast.largAlto - 0.2, yC, cast.z - 0.2);
  balaustrada(-tomb.largAlto + 0.2, -3.35, yT, tomb.z + 0.2); balaustrada(-2.05, 2.05, yT, tomb.z + 0.2); balaustrada(3.35, tomb.largAlto - 0.2, yT, tomb.z + 0.2);
  balaustrada(-chup.largAlto + 0.2, -2.6, yP, chup.z + 0.2); balaustrada(-1.4, 1.4, yP, chup.z + 0.2); balaustrada(2.6, chup.largAlto - 0.2, yP, chup.z + 0.2);
  // escadas entre os patamares
  const escada = (x, yb, ya, z, s) => {
    const nd = Math.round((ya - yb) / 0.26), recuo = (ya - yb) * 0.7;
    const zl = z + s * 0.15, zf = z + s * (recuo + 0.15); // encosta na antepara: começa 15 cm dela
    ocupa('escada ' + x.toFixed(1) + ' ' + z.toFixed(1), x - 0.5, x + 0.5, Math.min(zl, zf), Math.max(zl, zf));
    lote.rotulo = 'escada ' + x.toFixed(1) + ' ' + z.toFixed(1);
    for (let i = 1; i < nd; i++) { const t = i / nd; lote.add(CUBO, M.amurada, compor(V(x, yb + t * (ya - yb), z + s * recuo * (1 - t)), undefined, V(0.85, 0.05, 0.22))); }
    for (const dx of [-0.47, 0.47]) lote.add(CUBO, M.amurada, entre(V(x + dx, yb, z + s * recuo), V(x + dx, ya + 0.7, z - s * 0.15), 0.06, 0.14));
    lote.rotulo = null;
  };
  escada(-2.15, yMeio, yC - 0.1, cast.z, 1); escada(2.15, yMeio, yC - 0.1, cast.z, 1);
  escada(-2.7, yTomb, yT - 0.1, tomb.z, -1); escada(2.7, yTomb, yT - 0.1, tomb.z, -1);
  escada(-2, yChup, yP - 0.1, chup.z, -1); escada(2, yChup, yP - 0.1, chup.z, -1);

  // ════ portinholas e canhões ════
  // peça encostada no costado: base local (x = ao longo do casco, y = cima, z = para fora)
  const noCostado = (u, y, lado) => {
    const p = F.ponto(u, y, lado), nn = F.normal(u, y, lado);
    const ao = V(0, 1, 0).cross(nn).normalize(), cima = new THREE.Vector3().crossVectors(nn, ao).normalize();
    return { p, nn, ao, cima };
  };
  const portinhola = (u, y, lado, aberta) => {
    const { p, nn, ao, cima } = noCostado(u, y, lado), l = 0.62, a = 0.56;
    const peca = (off, sx, sy, sz, mat, rotX = 0) => {
      const c = p.clone().add(ao.clone().multiplyScalar(off.x)).add(cima.clone().multiplyScalar(off.y)).add(nn.clone().multiplyScalar(off.z));
      const m = comBase(c, ao, cima, nn, V(sx, sy, sz));
      if (rotX) m.multiply(new THREE.Matrix4().makeRotationX(rotX));
      lote.add(CUBO, mat, m);
    };
    if (aberta) peca(V(0, 0, 0.005), l, a, 0.02, M.vao);
    peca(V(0, a / 2 + 0.05, 0.04), l + 0.2, 0.1, 0.1, M.ouro); peca(V(0, -a / 2 - 0.05, 0.04), l + 0.2, 0.1, 0.1, M.ouro);
    peca(V(-l / 2 - 0.05, 0, 0.04), 0.1, a, 0.1, M.ouro); peca(V(l / 2 + 0.05, 0, 0.04), 0.1, a, 0.1, M.ouro);
    if (aberta) { // tampa erguida na dobradiça de cima + cano saindo
      const dob = p.clone().add(cima.clone().multiplyScalar(a / 2 + 0.05)).add(nn.clone().multiplyScalar(0.06));
      const ang = 1.1, dirC = cima.clone().multiplyScalar(Math.cos(ang)).add(nn.clone().multiplyScalar(Math.sin(ang)));
      const dirN = nn.clone().multiplyScalar(Math.cos(ang)).sub(cima.clone().multiplyScalar(Math.sin(ang)));
      const centro = dob.clone().add(dirC.clone().multiplyScalar(a * 0.5));
      lote.add(CUBO, M.vermelho, comBase(centro, ao, dirC, dirN, V(l + 0.1, a + 0.05, 0.08)));
      lote.add(CUBO, M.ferro, comBase(centro.clone().add(dirN.clone().multiplyScalar(0.05)), ao, dirC, dirN, V(0.06, a, 0.02)));
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nn);
      lote.add(CANO, M.ferro, new THREE.Matrix4().compose(p.clone().add(nn.clone().multiplyScalar(-0.9)), q, V(1, 1, 1)));
    } else {
      peca(V(0, 0, 0.05), l, a, 0.06, M.vermelho);
      peca(V(0, 0, 0.09), l * 0.8, 0.05, 0.02, M.ferro);
    }
  };
  for (const lado of [-1, 1]) {
    for (let i = 0; i < 9; i++) portinhola(0.2 + i * 0.052, 1.6, lado, false);               // bateria baixa, fechada (acima da água mesmo com o navio arfando)
    for (let i = 0; i < n.canhoesPorBordo; i++) portinhola(0.27 + i * 0.075, F.conves(0.27 + i * 0.075) + 0.55, lado, true); // bateria do convés
  }
  // canhões no convés, sobre reparos, apontando para as portinholas abertas
  for (const lado of [-1, 1]) for (let i = 0; i < n.canhoesPorBordo; i++) {
    const u = 0.27 + i * 0.075, y = F.conves(u), x = lado * (F.largura(u, y) - 1.2), z = F.Z0 + u * F.L;
    lote.rotulo = 'canhão ' + lado + ' ' + i;
    lote.add(CUBO, M.vermelho, compor(V(x, y + 0.28, z), undefined, V(1.15, 0.34, 0.62)));
    ocupa('canhão ' + lado + ' ' + i, x - 0.6, x + 0.6, z - 0.4, z + 0.4);
    for (const dz of [-0.36, 0.36]) for (const dx of [-0.4, 0.4]) lote.add(CILINDRO, M.amurada, compor(V(x + dx, y + 0.17, z + dz), new THREE.Euler(0, 0, Math.PI / 2), V(0.17, 0.1, 0.17)));
    lote.rotulo = null;
  }

  // ════ convés principal: escotilhas com grade, cabrestante, escaler e malaguetas ════
  {
    const grade = texturaGrade();
    const M_grade = std({ map: grade, roughness: 0.85 });
    for (const u of [(-12.8 + 16) / 31, (1.0 + 16) / 31]) { // escotilhas: uma no castelo, uma entre o grande e o cabrestante: braçola de madeira + tampa em grade
      const y = F.conves(u) + 0.1, z = F.Z0 + u * F.L;
      lote.rotulo = 'escotilha ' + u.toFixed(2);
      lote.add(CUBO, M.amurada, compor(V(0, y + 0.18, z), undefined, V(2.4, 0.36, 2.0)));
      ocupa('escotilha ' + u, -1.2, 1.2, z - 1.0, z + 1.0);
      lote.add(CUBO, M_grade, compor(V(0, y + 0.37, z), undefined, V(2.1, 0.03, 1.7)));
      lote.rotulo = null;
    }
    { // cabrestante: tambor, chapéu e barras
      const u = (3.3 + 16) / 31, y = F.conves(u) + 0.1, z = F.Z0 + u * F.L;
      ocupa('cabrestante', -1.2, 1.2, z - 1.2, z + 1.2);
      lote.rotulo = 'cabrestante';
      lote.add(new THREE.CylinderGeometry(0.42, 0.55, 1.1, 14), M.amurada, compor(V(0, y + 0.55, z)));
      lote.add(new THREE.CylinderGeometry(0.62, 0.62, 0.18, 14), M.amurada, compor(V(0, y + 1.15, z)));
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; lote.add(CILINDRO, M.amurada, compor(V(Math.cos(a) * 0.75, y + 1.15, z + Math.sin(a) * 0.75), new THREE.Euler(0, -a, Math.PI / 2), V(0.04, 0.9, 0.04))); }
      lote.rotulo = null;
    }
    { // escaler emborcado sobre picadeiros, entre o traquete e o grande
      const u = (-5.0 + 16) / 31, y = F.conves(u) + 0.75, z = F.Z0 + u * F.L; // entre o traquete e o grande
      ocupa('escaler', -1.05, 1.05, z - 3.0, z + 3.0);
      lote.rotulo = 'escaler';
      const casco = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      lote.add(casco, M.parede, compor(V(0, y, z), undefined, V(1.05, 0.55, 3.0))); // cúpula = fundo do bote, quilha para cima
      lote.add(CUBO, M.amurada, compor(V(0, y + 0.55, z), undefined, V(0.12, 0.1, 5.4))); // quilha por cima: lê como bote virado
      lote.add(new THREE.TorusGeometry(1, 0.06, 6, 24), M.amurada, compor(V(0, y, z), new THREE.Euler(Math.PI / 2, 0, 0), V(1.05, 3.0, 1)));
      for (const dz of [-1.6, 1.6]) lote.add(CUBO, M.preto, compor(V(0, y - 0.45, z + dz), undefined, V(1.9, 0.5, 0.25)));
      lote.rotulo = null;
    }
    // malaguetas: anel de pinos em volta do pé de cada mastro (onde se amarram as adriças)
    n.mastros.forEach((ms) => {
      const y = F.conves(ms.u) + 0.1, z = F.Z0 + ms.u * F.L;
      const zr = z + (ms.velaBaixa ? 0.9 : -0.9);
      lote.rotulo = 'malagueta ' + ms.nome;
      lote.add(CUBO, M.amurada, compor(V(0, y + 0.85, zr), undefined, V(2.2, 0.12, 0.2)));
      for (const dx of [-0.95, 0.95]) lote.add(CUBO, M.amurada, compor(V(dx, y + 0.42, zr), undefined, V(0.14, 0.85, 0.14)));
      for (let i = 0; i < 7; i++) lote.add(CILINDRO6, M.ouro, compor(V(-0.75 + i * 0.25, y + 0.98, zr), undefined, V(0.03, 0.3, 0.03)));
      lote.rotulo = null;
      ocupa('mastro ' + ms.nome, -ms.raio, ms.raio, z - ms.raio, z + ms.raio);
      ocupa('malagueta ' + ms.nome, -1.1, 1.1, zr - 0.1, zr + 0.1);
    });
  }

  // ════ galerias de popa (varandas laterais) e janelas do painel ════
  for (const lado of [-1, 1]) {
    const u = 0.91, y = F.conves(u) - 0.4, { p, nn, ao, cima } = noCostado(u, y, lado);
    const c = p.clone().add(nn.clone().multiplyScalar(0.45));
    lote.add(CUBO, M.vermelho, comBase(c, ao, cima, nn, V(2.2, 1.8, 0.9)));
    lote.add(CUBO, M.ouro, comBase(c.clone().add(cima.clone().multiplyScalar(1.0)), ao, cima, nn, V(2.5, 0.16, 1.1)));
    lote.add(CUBO, M.ouro, comBase(c.clone().add(cima.clone().multiplyScalar(-1.0)), ao, cima, nn, V(2.4, 0.14, 1.0)));
    lote.add(CILINDRO, M.vermelho, comBase(c.clone().add(cima.clone().multiplyScalar(-1.5)), ao, cima, nn, V(0.5, 0.8, 0.5)).multiply(new THREE.Matrix4().makeScale(1, 1, 1))); // pingente
    for (const dx of [-0.45, 0.45]) for (const dy of [-0.4, 0.35]) {
      const w = c.clone().add(ao.clone().multiplyScalar(dx)).add(cima.clone().multiplyScalar(dy)).add(nn.clone().multiplyScalar(0.46));
      lote.add(CUBO, M.janela, comBase(w, ao, cima, nn, V(0.36, 0.4, 0.03)));
      lote.add(CUBO, M.ouro, comBase(w.clone().add(nn.clone().multiplyScalar(0.02)), ao, cima, nn, V(0.42, 0.05, 0.03)));
    }
  }
  {
    const yb = F.conves(1) - 1.2, zp = F.zEm(1, yb) + 0.05;
    for (let i = 0; i < 5; i++) janela(-2.4 + i * 1.2, yb, zp, 1, 0.6, 0.7);
    lote.add(CUBO, M.ouro, compor(V(0, yb + 0.7, zp + 0.05), undefined, V(7.2, 0.14, 0.12)));
    lote.add(CUBO, M.ouro, compor(V(0, yb - 0.7, zp + 0.05), undefined, V(6.8, 0.12, 0.12)));
  }

  // ════ lanternas de popa e do convés ════
  const lanternas = [], luzes = [];
  const lanterna = (p, comLuz) => {
    const e = 0.7;
    lote.rotulo = 'lanterna ' + lanternas.length;
    lote.add(LANTERNA, M.lampada, compor(p, undefined, V(e, e, e)));
    lote.add(new THREE.ConeGeometry(0.34, 0.32, 8), M.ferro, compor(p.clone().add(V(0, 0.92, 0))));          // chapéu
    lote.add(new THREE.TorusGeometry(0.16, 0.025, 5, 10), M.ferro, compor(p.clone().add(V(0, 1.16, 0)), new THREE.Euler(0, 0, Math.PI / 2))); // argola
    lote.add(CILINDRO6, M.ferro, compor(p.clone().add(V(0, -0.02, 0)), undefined, V(0.3, 0.06, 0.3)));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; lote.add(CILINDRO6, M.ferro, compor(p.clone().add(V(Math.cos(a) * 0.29, 0.4, Math.sin(a) * 0.29)), undefined, V(0.022, 0.8, 0.022))); } // grades
    lote.add(CILINDRO, M.ferro, compor(p.clone().add(V(0, -0.6, 0)), undefined, V(0.04, 1.1, 0.04))); // haste
    lanternas.push(p.clone());
    lote.rotulo = null;
    if (comLuz) {
      const luz = new THREE.PointLight(0xffaa55, 22, 18, 2);
      luz.position.copy(p).add(V(0, 0.25, 0));
      luzes.push(luz); grupo.add(luz);
    }
  };
  const yPopa = F.borda(0.985) + 0.9;
  lanterna(V(-2.6, yPopa, F.zEm(0.985, yPopa) - 0.3), true);
  lanterna(V(2.6, yPopa, F.zEm(0.985, yPopa) - 0.3), false);
  lanterna(V(0, yPopa + 0.6, F.zEm(0.99, yPopa) - 0.1), true);
  // as do convés ficam no corrimão da amurada: a haste (1,15 m) assenta no topo da borda
  for (const [lado, u] of [[-1, 0.6325], [1, 0.3825]]) lanterna( // entre duas portinholas: nada embaixo da haste
    V(lado * (F.largura(u, F.borda(u)) - 0.12), F.borda(u) + 1.15, F.Z0 + u * F.L), false);

  // ════ leme (roda) no tombadilho ════
  const leme = new THREE.Group();
  {
    const u = 0.83, y = F.conves(u), z = F.Z0 + u * F.L;
    const roda = new THREE.Group();
    roda.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), M.amurada));
    roda.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 10).rotateX(Math.PI / 2), M.ouro));
    for (let i = 0; i < 8; i++) {
      const raio = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 5), M.amurada);
      raio.rotation.z = i * Math.PI / 4; roda.add(raio);
    }
    leme.add(roda); leme.userData.roda = roda;
    leme.position.set(0, y + 1.35, z);
    // o timoneiro fica ATRÁS da roda (lado da popa, +Z) olhando para a proa; à frente dele, a bitácula
    disposicao.roda = z; disposicao.pedestal = z - 0.35; disposicao.bitacula = z - 1.1; disposicao.conves = y;
    ocupa('roda e suportes', -0.8, 0.8, disposicao.pedestal - 0.25, z + 0.06);
    ocupa('bitácula', -0.31, 0.31, disposicao.bitacula - 0.28, disposicao.bitacula + 0.28);
    ocupa('lugar do timoneiro', -0.45, 0.45, z + 0.12, z + 0.9);
    lote.rotulo = 'roda e suportes';
    for (const dx of [-0.32, 0.32]) lote.add(CUBO, M.amurada, compor(V(dx, y + 0.68, disposicao.pedestal), undefined, V(0.14, 1.36, 0.5))); // suportes do eixo
    lote.add(new THREE.CylinderGeometry(0.2, 0.2, 0.78, 12), M.amurada, compor(V(0, y + 1.35, disposicao.pedestal), new THREE.Euler(0, 0, Math.PI / 2))); // tambor
    lote.add(CILINDRO, M.ferro, compor(V(0, y + 1.35, z - 0.17), new THREE.Euler(Math.PI / 2, 0, 0), V(0.05, 0.4, 0.05)));        // eixo da roda
    lote.rotulo = 'bitácula';
    lote.add(CUBO, M.amurada, compor(V(0, y + 0.55, disposicao.bitacula), undefined, V(0.62, 1.1, 0.55)));                          // bitácula
    lote.add(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.ouro, compor(V(0, y + 1.1, disposicao.bitacula))); // cúpula da bússola
    lote.rotulo = null;
    grupo.add(leme);
    leme.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // ════ gurupés, pau da bujarrona, figura de proa, âncora ════
  const proaTopo = V(0, F.borda(0.0) + 0.2, F.zEm(0.0, F.borda(0.0)));
  const dirGurupes = V(0, Math.sin(0.27), -Math.cos(0.27));
  const pontaGurupes = proaTopo.clone().add(dirGurupes.clone().multiplyScalar(11));
  const pontaBujarrona = pontaGurupes.clone().add(dirGurupes.clone().multiplyScalar(7.5));
  lote.add(new THREE.CylinderGeometry(0.22, 0.42, 1, 12), M.mastro, entre(proaTopo.clone().add(dirGurupes.clone().multiplyScalar(-3)), pontaGurupes, 1));
  lote.add(new THREE.CylinderGeometry(0.1, 0.2, 1, 10), M.mastro, entre(pontaGurupes.clone().add(dirGurupes.clone().multiplyScalar(-2)), pontaBujarrona, 1));
  lote.add(CILINDRO, M.preto, entre(pontaGurupes.clone().add(V(0, -0.1, 0)), pontaGurupes.clone().add(V(0, -2.4, 0.2)), 0.07)); // pau de gata
  for (const t of [0.35, 0.7]) lote.add(new THREE.TorusGeometry(0.32, 0.05, 6, 14), M.ferro,
    compor(proaTopo.clone().lerp(pontaGurupes, t), new THREE.Euler(0.27 + Math.PI / 2, 0, 0)));
  // figura de proa: voluta dourada (espiral) sob o gurupés
  {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * Math.PI * 2.4, r = 0.9 * (1 - t * 0.75);
      pts.push(V(0, F.borda(0) - 1.4 + Math.sin(a) * r, F.zEm(0.0, F.borda(0) - 1.0) - 0.4 - Math.cos(a) * r * 0.9 - t * 0.6));
    }
    lote.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.16, 8), M.ouro);
    for (const lado of [-1, 1]) {
      const curva = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, u = 0.004 + t * 0.06, y = F.borda(u) - 1.2 - t * 0.6; curva.push(F.ponto(u, y, lado).add(V(lado * 0.1, 0, 0))); }
      lote.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curva), 20, 0.09, 6), M.ouro); // braços da figura
    }
  }
  rotulo = 'cabo da âncora';
  // âncora pendurada no turco
  {
    const u = 0.07, y = F.borda(u) - 0.2, base = F.ponto(u, y, 1).add(V(0.5, 0, 0));
    lote.add(CILINDRO, M.amurada, entre(F.ponto(u, y, 1).add(V(-0.6, 0, 0)), base.clone().add(V(1.0, 0.1, 0)), 0.16)); // turco
    const topo = base.clone().add(V(0.9, -0.3, 0)), haste = topo.clone().add(V(0.05, -2.6, 0.05));
    lote.add(CILINDRO, M.ferro, entre(topo, haste, 0.09));
    lote.add(new THREE.TorusGeometry(0.75, 0.08, 6, 16, Math.PI), M.ferro, compor(haste.clone().add(V(0, 0.65, 0)), new THREE.Euler(0, Math.PI / 2, Math.PI)));
    lote.add(CILINDRO, M.amurada, compor(topo.clone().add(V(0, -0.2, 0)), new THREE.Euler(Math.PI / 2, 0, 0), V(0.1, 1.6, 0.1))); // cepo
    corda(base.clone().add(V(1.0, 0, 0)), topo, 0.03);
  }

  // ════ mastros, cestos, vergas, velas redondas ════
  const lona = { a: texturaLona(5, 0), b: texturaLona(17, 1) };
  const matVela = { a: materialVela(lona.a, { cor: 0xd9cbb6 }), b: materialVela(lona.b, { cor: 0xd6c6ae }) };
  const velas = [];
  const addVela = (geo, mv, matriz, nome = 'vela') => {
    const m = new THREE.Mesh(geo, mv.material);
    m.name = nome;
    m.customDepthMaterial = mv.profundidade;
    m.castShadow = true; m.receiveShadow = false;
    if (matriz) { m.matrixAutoUpdate = false; m.matrix.copy(matriz); }
    grupo.add(m); velas.push(m);
    return m;
  };
  let fase = 0;
  const topos = []; // topo de cada mastro (para estais)
  n.mastros.forEach((ms, im) => {
    const u = ms.u, zM = F.Z0 + u * F.L, yBase = F.conves(u) - 0.2;
    const alturas = [];
    let y = yBase, raio = ms.raio;
    ms.secoes.forEach((comp, k) => {
      const yTopo = y + comp, rTopo = raio * 0.78;
      lote.add(new THREE.CylinderGeometry(rTopo, raio, comp, 12), M.mastro, compor(V(0, y + comp / 2, zM)));
      // braçadeiras de ferro na seção
      for (let b = 1; b < 4; b++) lote.add(CILINDRO, M.ferro, compor(V(0, y + comp * b / 4, zM), undefined, V(raio * 1.03, 0.08, raio * 1.03)));
      alturas.push(yTopo);
      if (k < 2) { // cesto (plataforma) e vaus no topo das duas primeiras seções
        const larg = k === 0 ? 3.2 : 1.9;
        lote.add(CUBO, M.amurada, compor(V(0, yTopo - 0.1, zM), undefined, V(larg, 0.16, larg * 0.75)));
        for (const dx of [-1, 1]) lote.add(CUBO, M.preto, compor(V(dx * larg * 0.36, yTopo - 0.3, zM), undefined, V(0.14, 0.2, larg * 0.8)));
        lote.add(CUBO, M.preto, compor(V(0, yTopo + 0.35, zM - 0.25), undefined, V(0.55, 0.7, 0.9)));   // calcês (sobreposição)
        if (k === 0) for (let b = 0; b < 7; b++) lote.add(BALAUSTRE, M.amurada, compor(V(-larg / 2 + 0.2 + b * (larg - 0.4) / 6, yTopo, zM + larg * 0.35), undefined, V(0.6, 0.8, 0.6)));
      }
      y = yTopo - 1.2; raio = rTopo * 0.85; // a próxima seção começa abaixo do topo (sobreposição)
    });
    lote.add(ESFERA, M.ouro, compor(V(0, alturas[2] + 0.15, zM), undefined, V(0.22, 0.22, 0.22))); // pomo do topo
    topos.push(V(0, alturas[2], zM), V(0, alturas[0], zM), V(0, alturas[1], zM));

    // vergas: braceadas pelo mesmo ângulo, cada uma um pouco abaixo do topo da sua seção
    const giro = new THREE.Matrix4().makeRotationY(n.bracear);
    const yVergas = [alturas[0] - 1.3, alturas[1] - 1.0, alturas[2] - 0.7];
    const pontasVerga = [];
    ms.vergas.forEach((env, k) => {
      const yv = yVergas[k];
      const base = new THREE.Matrix4().makeTranslation(0, yv, zM - ms.raio - 0.15).multiply(giro);
      const r = 0.16 + env * 0.009;
      lote.add(new THREE.CylinderGeometry(r * 0.45, r, env / 2, 10), M.mastro, base.clone().multiply(compor(V(env / 4, 0, 0), new THREE.Euler(0, 0, -Math.PI / 2))));
      lote.add(new THREE.CylinderGeometry(r * 0.45, r, env / 2, 10), M.mastro, base.clone().multiply(compor(V(-env / 4, 0, 0), new THREE.Euler(0, 0, Math.PI / 2))));
      lote.add(CILINDRO, M.ferro, base.clone().multiply(compor(V(0, 0, 0), new THREE.Euler(0, 0, Math.PI / 2), V(r * 1.1, 0.5, r * 1.1))));
      const ponto = (x, yy, zz) => V(x, yy, zz).applyMatrix4(base);
      pontasVerga.push([ponto(-env * 0.48, 0, 0), ponto(env * 0.48, 0, 0)]);
      rotulo = ms.nome + ': estribos';
      // estribos (cabo onde os marinheiros pisam) pendurados sob a verga
      for (const lado of [-1, 1]) corda(ponto(lado * 0.6, -0.1, 0.2), ponto(lado * env * 0.48, -0.1, 0.2), 0.025, 0.55, 6);
      // vela redonda: do grampo desta verga até a verga de baixo (ou o convés na vela grande)
      if (k === 0 && !ms.velaBaixa) return;
      const envTopo = env * 0.94, alt = k === 0 ? yv - (F.conves(u) + 3.2) : yv - yVergas[k - 1] - 0.4;
      const envBaixo = k === 0 ? env * 1.0 : ms.vergas[k - 1] * 0.94;
      const cantos = [V(-envTopo / 2, 0, 0), V(envTopo / 2, 0, 0), V(envBaixo / 2, -alt, 0), V(-envBaixo / 2, -alt, 0)];
      const geo = geometriaVela(cantos, V(0, 0, 1), alt * 0.14 + 0.4, (fase += 1.3), { arco: k === 0 ? 0 : 1.0 });
      const mVela = base.clone().multiply(compor(V(0, -0.15, -0.28), new THREE.Euler(0, Math.PI, 0)));
      addVela(geo, im === 1 ? matVela.b : matVela.a, mVela, ms.nome + ' ' + ['baixa', 'gávea', 'joanete'][k]);
      rotulo = ms.nome + ': escotas';
      // escotas: dos punhos da vela até o costado (vela grande) ou até a verga de baixo
      const punho = (x) => V(x, -alt, 0.6).applyMatrix4(mVela);
      if (k === 0) for (const lado of [-1, 1]) corda(punho(lado * envBaixo / 2), F.ponto(u + 0.08, F.borda(u + 0.08) + 0.1, lado), 0.03);
    });

    // enxárcias (4 por bordo) com enfrechates (os degraus), do cesto até as mesas no costado.
    // As mesas ficam do mastro para ré, como nos navios de verdade: a vela redonda pende à vante delas.
    for (const lado of [-1, 1]) {
      rotulo = ms.nome + ': enxárcias';
      const pes = [], cabecas = [];
      for (let s = 0; s < 4; s++) {
        const uu = u + 0.03 + s * 0.02, yp = F.borda(uu) - 0.35;
        const pe = F.ponto(uu, yp, lado).add(F.normal(uu, yp, lado).multiplyScalar(0.55));
        const cabeca = V(lado * (0.5 + s * 0.12), alturas[0] - 0.25, zM - 0.1 + s * 0.18);
        corda(pe, cabeca, 0.04); pes.push(pe); cabecas.push(cabeca);
        lote.add(CUBO, M.preto, compor(pe.clone().add(V(-lado * 0.25, 0, 0)), undefined, V(0.5, 0.12, 0.35))); // bigota/mesa
      }
      const alturaEnx = cabecas[0].y - pes[0].y;
      for (let h = 0.5; h < alturaEnx - 0.6; h += 0.45) { // enfrechates
        const t = h / alturaEnx;
        for (let s = 0; s < 3; s++) corda(pes[s].clone().lerp(cabecas[s], t), pes[s + 1].clone().lerp(cabecas[s + 1], t), 0.018);
      }
      rotulo = ms.nome + ': enxárcias do mastaréu';
      // enxárcias do mastaréu: da borda do cesto até o topo dele, também com enfrechates
      const larg = 1.5, pesM = [], cabM = [];
      for (let s = 0; s < 3; s++) {
        const pe = V(lado * larg * (0.6 + s * 0.15), alturas[0] - 0.1, zM - 0.05 + s * 0.45), cab = V(lado * 0.3, alturas[1] - 0.3, zM + s * 0.2);
        corda(pe, cab, 0.03); pesM.push(pe); cabM.push(cab);
      }
      for (let h = 0.45; h < cabM[0].y - pesM[0].y - 0.5; h += 0.42) {
        const t = h / (cabM[0].y - pesM[0].y);
        for (let s = 0; s < 2; s++) corda(pesM[s].clone().lerp(cabM[s], t), pesM[s + 1].clone().lerp(cabM[s + 1], t), 0.015);
      }
      rotulo = ms.nome + ': adriças';
      // ostagas e adriças: do meio de cada verga até o topo da seção de cima
      pontasVerga.forEach((par, k) => {
        const meio = par[0].clone().lerp(par[1], 0.5);
        corda(meio.clone().add(V(lado * 0.4, 0.15, 0)), V(lado * 0.15, (alturas[Math.min(k + 1, 2)] - 0.2), zM), 0.022);
      });
      rotulo = ms.nome + ': amantilhos';
      // amantilhos: das pontas das vergas até o topo do mastro acima (seguram a verga nivelada)
      pontasVerga.forEach((par, k) => {
        if (k === 2) return;
        corda(par[lado > 0 ? 1 : 0], V(lado * 0.25, alturas[k + 1] - 0.3, zM), 0.02);
      });
      rotulo = ms.nome + ': brandais';
      // brandais: do topo do mastaréu até o costado, mais para ré
      const ub = Math.min(u + 0.1, 0.97), yb = F.borda(ub) - 0.3;
      corda(V(lado * 0.3, alturas[1] - 0.4, zM), F.ponto(ub, yb, lado).add(F.normal(ub, yb, lado).multiplyScalar(0.5)), 0.04);
      corda(V(lado * 0.2, alturas[2] - 0.3, zM), F.ponto(Math.min(ub + 0.04, 0.98), yb, lado).add(V(lado * 0.4, 0, 0)), 0.03);
      rotulo = ms.nome + ': braços';
      // braços: das pontas das vergas para ré (é com eles que se braceia)
      pontasVerga.forEach((par, k) => {
        const ponta = par[lado > 0 ? 1 : 0], ur = Math.min(u + 0.1 + k * 0.035, 0.98);
        corda(ponta, F.ponto(ur, F.borda(ur) + 0.2, lado), 0.022, 0.25, 4);
      });
    }
  });

  rotulo = 'estais';
  // estais: de cada topo para vante (sustentam os mastros contra o avanço)
  const [tTraq, bTraq, mTraq, tGr, bGr, mGr, tMz, bMz, mMz] = topos;
  const estaiGiba = [bTraq.clone().add(V(0, -0.05, -0.3)), pontaGurupes.clone().add(V(0, -0.1, 0))];
  const estaiBujarrona = [mTraq.clone().add(V(0, -0.05, -0.2)), pontaBujarrona.clone().lerp(pontaGurupes, 0.5)];
  corda(...estaiGiba, 0.06);
  corda(...estaiBujarrona, 0.045);
  corda(tTraq.clone().add(V(0, -0.2, -0.1)), pontaBujarrona, 0.04);
  corda(bGr.clone().add(V(0, -0.05, -0.3)), V(0, F.conves(0.24) + 0.5, F.Z0 + 0.235 * F.L), 0.06);
  corda(mGr.clone().add(V(0, -0.05, -0.2)), bTraq.clone().add(V(0, 0.3, 0.3)), 0.04);
  corda(tGr.clone(), tTraq.clone().add(V(0, -0.1, 0.25)), 0.03);
  corda(bMz.clone().add(V(0, -0.05, -0.3)), V(0, F.conves(0.5) + 0.6, F.Z0 + 0.49 * F.L), 0.05);
  corda(mMz.clone().add(V(0, -0.05, -0.2)), bGr.clone().add(V(0, 0.4, 0.3)), 0.035);
  corda(tMz.clone(), mGr.clone().add(V(0, 0.2, 0.2)), 0.03);
  rotulo = 'patarrazes';
  // patarrazes do gurupés (cabos que o seguram por baixo e dos lados)
  corda(pontaGurupes.clone().add(V(0, -2.4, 0.2)), pontaBujarrona, 0.03);
  corda(pontaGurupes.clone().add(V(0, -2.4, 0.2)), V(0, F.borda(0.02) - 1.6, F.zEm(0.02, F.borda(0.02) - 1.6)), 0.04);
  for (const lado of [-1, 1]) corda(pontaGurupes.clone().lerp(proaTopo, 0.3), F.ponto(0.05, F.borda(0.05) - 0.2, lado), 0.035);

  // bujarronas: três velas triangulares nos estais da proa
  const bujarrona = (cabeca, amura, escota, prof, mv, nome) => {
    const geo = geometriaVela([cabeca, cabeca.clone().add(V(0, -0.05, 0.08)), escota, amura], V(1, 0, 0), prof, (fase += 1.3), { nu: 12, nv: 14 });
    addVela(geo, mv, undefined, nome);
    rotulo = 'escota da ' + nome;
    corda(escota, F.ponto(0.2, F.borda(0.2) + 0.2, 1), 0.025, 0.4, 4);
  };
  // giba (no estai do traquete) e bujarrona (no estai do mastaréu), envergadas no próprio estai
  const zTraq = F.Z0 + n.mastros[0].u * F.L;
  const noEstai = ([a, b], t) => a.clone().lerp(b, t);
  bujarrona(noEstai(estaiGiba, 0.14), noEstai(estaiGiba, 0.96), V(0.9, F.borda(0.1) + 1.2, zTraq - 4.2), 0.9, matVela.a, 'giba');
  bujarrona(noEstai(estaiBujarrona, 0.22), noEstai(estaiBujarrona, 0.97), V(3.2, F.borda(0.04) + 2.8, zTraq - 9.5), 1.0, matVela.b, 'bujarrona');

  rotulo = 'mezena: adriça e escota';
  // mezena (vela latina quadrangular): entre a carangueja e a retranca, para ré do mastro de ré
  {
    const ms = n.mastros[2], zM = F.Z0 + ms.u * F.L, yB = F.conves(ms.u);
    const garganta = V(0, yB + 10.5, zM + 0.4), pico = V(0.3, yB + 14.2, zM + 7.6);
    const pRetranca = V(0, yB + 2.4, zM + 0.4), fRetranca = V(1.2, yB + 2.0, F.Z0 + F.L + 2.6);
    lote.add(new THREE.CylinderGeometry(0.12, 0.2, 1, 10), M.mastro, entre(garganta, pico, 1));
    lote.add(new THREE.CylinderGeometry(0.12, 0.22, 1, 10), M.mastro, entre(pRetranca, fRetranca, 1));
    const geo = geometriaVela([garganta.clone().add(V(0, -0.2, 0.2)), pico.clone().add(V(0, -0.25, 0)), fRetranca.clone().add(V(0, 0.25, -0.3)), pRetranca.clone().add(V(0, 0.25, 0.2))], V(1, 0, 0), 0.9, (fase += 1.3), { nu: 14, nv: 14 });
    addVela(geo, matVela.b, undefined, 'mezena (latina)');
    corda(pico, tMz.clone(), 0.03);                       // adriça do pico
    corda(fRetranca, V(0, F.borda(0.995) + 0.3, F.zEm(0.995, F.borda(0.995))), 0.03); // escota da mezena
  }

  // bandeira no topo do mastro grande
  {
    // vento: as redondas (frente +Z, giradas π e braceadas) embarrigam para (−sen b, 0, −cos b); bandeira e flâmula voam para lá
    const voo = new THREE.Euler(0, Math.PI + n.bracear, 0);
    const mv = materialVela(texturaBandeira(), { bandeira: true });
    const pau = tGr.clone().add(V(0, 3.0, 0));   // pau da bandeira: a bandeira voa ACIMA da vela mais alta
    lote.add(new THREE.CylinderGeometry(0.05, 0.09, 1, 6), M.mastro, entre(tGr, pau, 1));
    lote.add(ESFERA, M.ouro, compor(pau.clone().add(V(0, 0.08, 0)), undefined, V(0.12, 0.12, 0.12)));
    const geo = geometriaVela([V(0, 0, 0), V(0, 0, 3.6), V(0, -2.25, 3.6), V(0, -2.25, 0)], V(1, 0, 0), 0.55, 0, { nu: 20, nv: 8, bandeira: 1 });
    const m = addVela(geo, mv, compor(pau.clone().add(V(0, -0.1, 0)), voo), 'bandeira');
    m.castShadow = false;
    // flâmula: fita vermelha longa (9,5 m) e afilada no topo do traquete, como a do original
    const mf = materialVela(null, { bandeira: true, cor: 0x9a1612 });
    const topoTr = tTraq.clone().add(V(0, 0.3, 0));
    const gf = geometriaVela([V(0, 0, 0), V(0, 0, 9.5), V(0, -0.05, 9.5), V(0, -0.62, 0)], V(1, 0, 0), 0.7, 1.7, { nu: 24, nv: 2, bandeira: 1 });
    addVela(gf, mf, compor(topoTr, voo), 'flâmula').castShadow = false;
  }

  // ════ a lona encosta no cabo: onde um estai ou braço passa à frente da vela, a barriga cede ali ════
  // (no navio de verdade a vela roça o estai; sem isto o cabo atravessa a lona inflada). A barriga
  // máxima de cada vértice é a mesma conta do shader (rajada 1,12 + tremor); o cabo vira um teto.
  {
    const forma = (u, v) => Math.pow(Math.max(Math.sin(Math.PI * u), 0), 0.8) * Math.pow(Math.max(Math.sin(Math.PI * (0.05 + 0.9 * v)), 0), 0.85);
    const q = new THREE.Vector3(), nw = new THREE.Vector3(), d1 = new THREE.Vector3(), d2 = new THREE.Vector3(), r = new THREE.Vector3();
    // aproximação entre o raio da normal (q + nw·s, s em [0, L]) e o cabo [a, b]: devolve [s, distância, t no cabo]
    const aproxima = (L, a, b) => {
      d1.copy(nw).multiplyScalar(L); d2.subVectors(b, a); r.subVectors(q, a);
      const A = d1.dot(d1), E = d2.dot(d2), Fq = d2.dot(r), C = d1.dot(r), B = d1.dot(d2), den = A * E - B * B;
      let s = den > 1e-9 ? THREE.MathUtils.clamp((B * Fq - C * E) / den, 0, 1) : 0;
      let t = (B * s + Fq) / E;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-C / A, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((B - C) / A, 0, 1); }
      const p1 = q.clone().addScaledVector(d1, s), p2 = a.clone().addScaledVector(d2, t);
      return [s * L, p1.distanceTo(p2), t, p2.sub(q).dot(nw)];
    };
    const RAIO = 2.4, FOLGA = 0.18, DURO = 1.25;
    for (const m of velas) {
      const G = m.geometry, A = G.attributes.aVela;
      if (A.getZ(0) > 0.5) continue; // bandeiras voam livres
      if (m.matrixAutoUpdate) m.updateMatrix(); // as redondas têm matriz fixa: recalcular apagaria o lugar delas
      const M = m.matrix, Mn = new THREE.Matrix3().getNormalMatrix(M), P = G.attributes.position, Nn = G.attributes.normal, UV = G.attributes.aUv;
      G.computeBoundingBox();
      const caixa = G.boundingBox.clone().applyMatrix4(M).expandByScalar(A.getX(0) * 1.2 + RAIO + 0.5);
      const perto = cordas.filter(([a, b]) => caixa.intersectsBox(new THREE.Box3().setFromPoints([a, b])));
      for (let i = 0; i < P.count; i++) {
        const prof = A.getX(i), u = UV.getX(i), v = UV.getY(i), bMax = prof * (1.12 * forma(u, v) + 0.035 * v);
        if (bMax < 0.02) continue;
        q.fromBufferAttribute(P, i).applyMatrix4(M); nw.fromBufferAttribute(Nn, i).applyMatrix3(Mn).normalize();
        let teto = Infinity;
        for (const [a, b, raio] of perto) {
          const [s, d, t, frente] = aproxima(bMax + RAIO, a, b);
          const comp = a.distanceTo(b);
          if (frente < -0.05 || d > RAIO || (t * comp < 0.35 && t < 1e-3) || ((1 - t) * comp < 0.35 && t > 1 - 1e-3)) continue; // ponta do cabo: é onde ele se amarra
          teto = Math.min(teto, s - FOLGA - raio + Math.max(0, d - DURO) * 1.4); // sulco: duro até 1,25 m do cabo, suave depois
        }
        if (teto < bMax) A.setX(i, prof * Math.max(teto, 0) / bMax);
      }
      A.needsUpdate = true;
    }
  }

  // ════ cordame: todos os cabos numa única InstancedMesh ════
  {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    const inst = new THREE.InstancedMesh(geo, M.corda, cordas.length);
    cordas.forEach(([a, b, r], i) => inst.setMatrixAt(i, entre(a, b, r)));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    grupo.add(inst);
  }

  disposicao.caixas = [...lote.caixas].map(([nome, b]) => ({ nome, min: b.min.toArray(), max: b.max.toArray() }));
  lote.montar(grupo);

  // meia-boca na linha d'água em 64 estações, para o mar recortar e contornar o casco
  const AMOSTRAS = 64;
  const larguras = Array.from({ length: AMOSTRAS }, (_, i) => F.largura(i / (AMOSTRAS - 1), 0));

  return {
    grupo, velas, cabos: cordas, leme, luzes, lanternas, larguras, disposicao, amostras: AMOSTRAS, forma: F,
    emissivos: [M.lampada], contagem: { cordas: cordas.length, velas: velas.length, lanternas: lanternas.length },
  };
}

// Ataques de geometria rodados DENTRO da página (window.__navio), sobre a geometria real:
// velas com a barriga calculada igual ao shader, cabos como segmentos, câmera pelo código de verdade.
// Uso: pg.evaluate(conteúdo deste arquivo, opções). Devolve achados com nome e coordenada.
async ({ instantes = [0, 7.3, 13.1], folgaPonta = 0.35, folgaBorda = 0.35, planta = null } = {}) => {
  const W = window.__navio, N = W.navio, g = N.grupo;
  const V3 = g.position.constructor;
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();

  // ── barriga: cópia fiel do GLSL de src/velas.js ──
  const barriga = (ux, uy, prof, fase, band, t) => {
    if (band > 0.5) {
      const w = Math.sin(ux * 7 - t * 9 + fase) * 0.6 + Math.sin(ux * 13 - t * 14 + fase * 1.7 + uy * 2) * 0.25;
      return w * ux * prof;
    }
    const cl = (x) => Math.min(Math.max(x, 0), 1);
    const rajada = 1 + 0.08 * Math.sin(t * 1.6 + fase) + 0.04 * Math.sin(t * 4.1 + fase * 2);
    const b = prof * rajada * Math.pow(Math.max(Math.sin(Math.PI * cl(ux)), 0), 0.8) * Math.pow(Math.max(Math.sin(Math.PI * (0.05 + 0.9 * cl(uy))), 0), 0.85);
    const tremor = Math.sin(ux * 11 + t * 8.5 + fase) * Math.sin(uy * 7 - t * 6) * 0.035 * prof * uy;
    return b + tremor;
  };

  // ── velas no espaço do navio, num instante t ──
  const velasEm = (t) => N.velas.filter((m) => m.visible).map((m) => {
    const M = inv.clone().multiply(m.matrixWorld);
    const G = m.geometry, P = G.attributes.position, Nn = G.attributes.normal, UV = G.attributes.aUv, AV = G.attributes.aVela;
    const pts = [], uv = [], borda = [];
    for (let i = 0; i < P.count; i++) {
      const b = barriga(UV.getX(i), UV.getY(i), AV.getX(i), AV.getY(i), AV.getZ(i), t);
      const p = new V3(P.getX(i) + Nn.getX(i) * b, P.getY(i) + Nn.getY(i) * b, P.getZ(i) + Nn.getZ(i) * b).applyMatrix4(M);
      pts.push(p); uv.push([UV.getX(i), UV.getY(i)]);
      const u = UV.getX(i), v = UV.getY(i);
      if (u < 1e-4 || u > 1 - 1e-4 || v < 1e-4 || v > 1 - 1e-4) borda.push(p);
    }
    const idx = G.index.array, tris = [], bordaSeg = [];
    // lado da borda de cada vértice (u=0, u=1, v=0, v=1); aresta com os dois no mesmo lado é borda (tralha)
    const lados = (i) => { const [u, v] = uv[i], l = []; if (u < 1e-4) l.push('u0'); if (u > 1 - 1e-4) l.push('u1'); if (v < 1e-4) l.push('v0'); if (v > 1 - 1e-4) l.push('v1'); return l; };
    for (let k = 0; k < idx.length; k += 3) {
      tris.push([pts[idx[k]], pts[idx[k + 1]], pts[idx[k + 2]]]);
      for (const [i, j] of [[idx[k], idx[k + 1]], [idx[k + 1], idx[k + 2]], [idx[k + 2], idx[k]]]) if (lados(i).some((l) => lados(j).includes(l))) bordaSeg.push([pts[i], pts[j]]);
    }
    const min = new V3(Infinity, Infinity, Infinity), max = new V3(-Infinity, -Infinity, -Infinity);
    pts.forEach((p) => { min.min(p); max.max(p); });
    return { nome: m.name || 'vela', tris, borda, bordaSeg, min, max, bandeira: AV.getZ(0) > 0.5, pts, uv, M, normal0: new V3(Nn.getX(0), Nn.getY(0), Nn.getZ(0)), prof: AV.getX(0) };
  });

  // ── interseção segmento × triângulo (Möller–Trumbore), devolve o ponto ou null ──
  const e1 = new V3(), e2 = new V3(), pv = new V3(), tv = new V3(), qv = new V3(), dir = new V3();
  const segTri = (a, b, [p0, p1, p2]) => {
    dir.subVectors(b, a);
    e1.subVectors(p1, p0); e2.subVectors(p2, p0);
    pv.crossVectors(dir, e2);
    const det = e1.dot(pv);
    if (Math.abs(det) < 1e-12) return null;
    const id = 1 / det;
    tv.subVectors(a, p0);
    const u = tv.dot(pv) * id; if (u < 0 || u > 1) return null;
    qv.crossVectors(tv, e1);
    const v = dir.dot(qv) * id; if (v < 0 || u + v > 1) return null;
    const s = e2.dot(qv) * id; if (s < 0 || s > 1) return null;
    return a.clone().addScaledVector(dir, s);
  };
  const distSeg = (p, a, b) => {
    const ab = new V3().subVectors(b, a), t = Math.min(Math.max(new V3().subVectors(p, a).dot(ab) / Math.max(ab.lengthSq(), 1e-12), 0), 1);
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  };
  const distBorda = (p, vela) => vela.bordaSeg.reduce((d, [a, b]) => Math.min(d, distSeg(p, a, b)), Infinity);
  const caixaSeg = (a, b, vela, folga = 0.05) =>
    Math.max(a.x, b.x) >= vela.min.x - folga && Math.min(a.x, b.x) <= vela.max.x + folga &&
    Math.max(a.y, b.y) >= vela.min.y - folga && Math.min(a.y, b.y) <= vela.max.y + folga &&
    Math.max(a.z, b.z) >= vela.min.z - folga && Math.min(a.z, b.z) <= vela.max.z + folga;

  // cabos: do próprio navio (com rótulo) + o cabo plantado pelo controle doente
  const cabos = N.cabos.map(([a, b, r, rot]) => ({ a: new V3(a.x, a.y, a.z), b: new V3(b.x, b.y, b.z), rot }));
  for (const [a, b, rot] of planta || []) cabos.push({ a: new V3(...a), b: new V3(...b), rot });

  const achados = { caboVela: {}, velaVela: {} };
  const anota = (mapa, chave, p, t, seg) => {
    const r = (mapa[chave] ??= { n: 0, exemplo: null, instantes: new Set(), seg: null });
    r.n++; r.instantes.add(t); if (!r.exemplo) { r.exemplo = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; r.seg = seg; }
  };

  for (const t of instantes) {
    const velas = velasEm(t);
    // cabo × vela: só conta longe das pontas do cabo (onde ele se amarra)
    for (const c of cabos) for (const vela of velas) {
      if (!caixaSeg(c.a, c.b, vela)) continue;
      for (const tri of vela.tris) {
        const p = segTri(c.a, c.b, tri);
        if (!p || p.distanceTo(c.a) < folgaPonta || p.distanceTo(c.b) < folgaPonta) continue;
        if (distBorda(p, vela) < 0.12) continue; // cabo deitado na tralha (estai da bujarrona): é onde a vela enverga
        anota(achados.caboVela, `${c.rot} × ${vela.nome}`, p, t, [c.a, c.b].map((q) => [q.x, q.y, q.z].map((x) => +x.toFixed(2))));
      }
    }
    // vela × vela: arestas de uma contra triângulos da outra; contato nas duas bordas (verga comum) não conta
    for (let i = 0; i < velas.length; i++) for (let j = 0; j < velas.length; j++) {
      if (i === j) continue;
      const A = velas[i], B = velas[j];
      if (A.max.x < B.min.x || A.min.x > B.max.x || A.max.y < B.min.y || A.min.y > B.max.y || A.max.z < B.min.z || A.min.z > B.max.z) continue;
      for (const [p0, p1, p2] of A.tris) for (const [a, b] of [[p0, p1], [p1, p2], [p2, p0]]) {
        if (!caixaSeg(a, b, B)) continue;
        for (const tri of B.tris) {
          const p = segTri(a, b, tri);
          if (!p) continue;
          if (distBorda(p, A) < folgaBorda && distBorda(p, B) < folgaBorda) continue;
          const chave = [A.nome, B.nome].sort().join(' × ');
          anota(achados.velaVela, chave, p, t);
        }
      }
    }
  }
  const lista = (mapa) => Object.entries(mapa).map(([k, r]) => ({ par: k, n: r.n, exemplo: r.exemplo, instantes: r.instantes.size, cabo: r.seg }));

  // ── vento coerente (D3): bandeira e flâmula voam para onde as velas embarrigam ──
  const velas0 = velasEm(instantes[0]);
  const embarriga = new V3();
  velas0.filter((v) => !v.bandeira).forEach((v) => {
    // direção da barriga = normal (já orientada pela "frente") levada ao navio
    const nM = v.normal0.clone().transformDirection(v.M);
    embarriga.addScaledVector(nM, Math.sign(v.prof));
  });
  embarriga.y = 0; embarriga.normalize();
  const voo = velas0.filter((v) => v.bandeira).map((v) => {
    const raiz = new V3(), ponta = new V3(); let nr = 0, np = 0;
    v.pts.forEach((p, i) => { if (v.uv[i][0] < 1e-4) { raiz.add(p); nr++; } else if (v.uv[i][0] > 1 - 1e-4) { ponta.add(p); np++; } });
    const d = ponta.divideScalar(np).sub(raiz.divideScalar(nr)); d.y = 0;
    return { nome: v.nome, cos: +(d.normalize().dot(embarriga)).toFixed(3) };
  });

  // ── peças soltas: nada de Mesh avulso em aves e partículas; cordame numa instância só ──
  const contar = (raiz) => { let mesh = 0, inst = 0; raiz?.traverse((o) => { if (o.isInstancedMesh) inst++; else if (o.isMesh) mesh++; }); return { mesh, inst }; };
  const pecas = { gaivotas: contar(W.gaivotas?.grupo), borrifo: contar(W.borrifo?.pontos) };

  return {
    caboVela: lista(achados.caboVela), velaVela: lista(achados.velaVela),
    vento: { embarriga: [+embarriga.x.toFixed(3), +embarriga.z.toFixed(3)], voo },
    pecas, nVelas: velas0.length, nCabos: cabos.length,
    // centro e normal da primeira vela redonda, para os controles plantarem cabos
    alvo: (() => { const v = velas0.find((x) => !x.bandeira); const c = v.pts[Math.floor(v.pts.length / 2)]; const n = v.normal0.clone().transformDirection(v.M);
      const tg = new V3().subVectors(v.pts[1], v.pts[0]).normalize(); return { nome: v.nome, c: [c.x, c.y, c.z], n: [n.x, n.y, n.z], tg: [tg.x, tg.y, tg.z] }; })(),
  };
}

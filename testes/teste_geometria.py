"""Ataques de geometria do navio sobre a geometria REAL (rodada 2 do verificador cego, 2026-10-18).

  python testes/teste_geometria.py

Famílias do Catálogo: D1 (peças que se atropelam: cabo × vela e vela × vela, com a barriga do shader
recalculada em três instantes), D3 (bandeira e flâmula voam para onde as velas embarrigam), banido
"Mesh solto em ave/partícula" e C1 (câmera em pose alcançável não entra em vela nem cabo).
Cada checagem tem controle doente (cabo plantado atravessando uma vela tem de ser acusado) e
controle são (cabo plantado na frente da vela, sem tocar, não pode ser acusado).
Sai com 1 se qualquer item reprovar.
"""
import math, pathlib, sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8732/index.html?escala=0.5"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"]
JS = (pathlib.Path(__file__).resolve().parent / "geometria.js").read_text(encoding="utf-8")
resultados = []

def item(nome, ok, detalhe):
    resultados.append((nome, ok))
    print(f"[{'OK ' if ok else 'FALHA'}] {nome} — {detalhe}")

# câmera: posição real calculada pelo laço da cena, comparada com velas e cabos naquele quadro
CAMERA = """async ([poses, folgaVela, folgaCabo]) => {
  const W = window.__navio, N = W.navio, c = W.cam, g = N.grupo, V3 = g.position.constructor;
  const quadro = () => new Promise((r) => requestAnimationFrame(() => r()));
  const ruins = [];
  for (const [az, el, dist] of poses) {
    c.az = az; c.vaz = 0; c.elUsuario = el; c.distUsuario = dist; c.ultimoToque = 1e9;
    await quadro(); await quadro();
    g.updateMatrixWorld(true);
    const p = W.camera.position.clone().applyMatrix4(g.matrixWorld.clone().invert());
    let dv = Infinity, nomeV = '';
    for (const m of N.velas) {
      const M = g.matrixWorld.clone().invert().multiply(m.matrixWorld), P = m.geometry.attributes.position;
      const q = new V3();
      for (let i = 0; i < P.count; i++) { q.fromBufferAttribute(P, i).applyMatrix4(M); const d = q.distanceTo(p); if (d < dv) { dv = d; nomeV = m.name; } }
    }
    let dc = Infinity, nomeC = '';
    for (const [a, b, r, rot] of N.cabos) {
      const ab = new V3().subVectors(b, a), t = Math.min(Math.max(new V3().subVectors(p, a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0), 1);
      const d = p.distanceTo(a.clone().addScaledVector(ab, t)); if (d < dc) { dc = d; nomeC = rot; }
    }
    // a barriga empurra a lona até prof×1,12 para fora da grade: a folga da vela já conta com isso
    if (dv < folgaVela || dc < folgaCabo) ruins.push({ pose: [az, el, dist].map((x) => +x.toFixed(2)), cam: [p.x, p.y, p.z].map((x) => +x.toFixed(1)), vela: [nomeV, +dv.toFixed(2)], cabo: [nomeC, +dc.toFixed(2)] });
  }
  return ruins;
}"""

with sync_playwright() as pw:
    nav = pw.chromium.launch(headless=True, args=ARGS)
    pg = nav.new_page(viewport={"width": 640, "height": 360})
    pg.goto(URL)
    pg.wait_for_function("window.__navio && document.body.classList.contains('pronto')", timeout=60000)
    pg.evaluate("() => { window.__navio.congelado.ativo = true; }")
    pg.wait_for_timeout(500)

    r = pg.evaluate(JS, {})
    print(f"{r['nVelas']} velas e {r['nCabos']} cabos medidos em 3 instantes")

    # D1 — cabo × vela
    for a in r["caboVela"]:
        print(f"    cabo × vela: {a['par']} — {a['n']} toque(s) em {a['instantes']} instante(s), ex. {a['exemplo']}, cabo {a['cabo']}")
    item("D1a. nenhum cabo atravessa vela (longe das pontas)", not r["caboVela"], f"{len(r['caboVela'])} par(es)")
    # D1 — vela × vela
    for a in r["velaVela"]:
        print(f"    vela × vela: {a['par']} — {a['n']} aresta(s), ex. {a['exemplo']}")
    item("D1b. nenhuma vela atravessa outra", not r["velaVela"], f"{len(r['velaVela'])} par(es)")

    # controles: cabo plantado através da vela (doente) e na frente dela sem tocar (são)
    al = r["alvo"]; c, n, tg = al["c"], al["n"], al["tg"]
    atravessa = [[c[i] - n[i] * 2 for i in range(3)], [c[i] + n[i] * 2 for i in range(3)], "DOENTE"]
    frente = [[c[i] + n[i] * 3 - tg[i] * 2 for i in range(3)], [c[i] + n[i] * 3 + tg[i] * 2 for i in range(3)], "SAO"]
    rc = pg.evaluate(JS, {"instantes": [0], "planta": [atravessa, frente]})
    pares = [a["par"] for a in rc["caboVela"]]
    item("D1c. controle doente (cabo plantado através da vela é acusado)", any(p.startswith("DOENTE") for p in pares), f"alvo: {al['nome']}; pares: {[p for p in pares if p.startswith(('DOENTE', 'SAO'))]}")
    item("D1d. controle são (cabo plantado 3 m à frente da vela-alvo não a toca)", f"SAO × {al['nome']}" not in pares, f"pares do cabo são: {[p for p in pares if p.startswith('SAO')]}")

    # D3 — vento coerente
    ok = all(v["cos"] > 0.5 for v in r["vento"]["voo"]) and len(r["vento"]["voo"]) == 2
    item("D3. bandeira e flâmula voam a favor do vento das velas", ok, f"barriga das velas (x, z) = {r['vento']['embarriga']}; cos do voo: {r['vento']['voo']}")

    # banido: Mesh solto em aves e partículas
    pc = r["pecas"]
    item("B. aves e borrifo sem Mesh avulso", pc["gaivotas"]["mesh"] == 0 and pc["borrifo"]["mesh"] == 0 and pc["gaivotas"]["inst"] > 0,
         f"gaivotas {pc['gaivotas']}, borrifo {pc['borrifo']}")

    # C1 — câmera nas poses que o usuário alcança (arrasto: el 0,015 a 1,2; roda: dist ≥ 24)
    poses = [(k * math.pi / 12, el, d) for k in range(24) for el in (0.015, 0.2, 0.35, 0.6, 0.9, 1.2) for d in (24, 26, 30, 36)]
    ruins = pg.evaluate(CAMERA, [poses, 1.6, 0.6])
    for x in ruins[:8]:
        print(f"    câmera: pose (az, el, dist) {x['pose']} em {x['cam']} — vela {x['vela']}, cabo {x['cabo']}")
    item("C1. câmera não entra em vela nem cabo (576 poses)", not ruins, f"{len(ruins)} pose(s) ruim(ns)")
    # controle doente do C1: com a folga enorme toda pose vira ruim (a régua enxerga)
    ruins_d = pg.evaluate(CAMERA, [poses[:6], 500, 500])
    item("C1b. controle doente (folga absurda acusa todas)", len(ruins_d) == 6, f"{len(ruins_d)}/6")
    nav.close()

falhas = [x for x in resultados if not x[1]]
print(f"\n{len(resultados) - len(falhas)}/{len(resultados)} itens OK")
sys.exit(1 if falhas else 0)

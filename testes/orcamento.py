"""Orçamento por quadro: chamadas de desenho e triângulos (total de todos os passes: reflexo,
sombra, cena e pós) e de onde vêm os triângulos. Compara com os pisos do PRD."""
import json, sys
from playwright.sync_api import sync_playwright

PISOS = {"chamadas": 150, "triangulos": 300_000}
with sync_playwright() as pw:
    nav = pw.chromium.launch(headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"])
    pg = nav.new_page(viewport={"width": 1280, "height": 720})
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:8732/index.html?escala=1")
    pg.wait_for_function("window.__navio && window.__navio.renderer", timeout=60000)
    pg.wait_for_timeout(5000)
    poses = {"geral": (0.16, 74, 2.45), "lado": (0.12, 34, 1.5708), "aerea": (0.75, 40, 2.2)}
    res = {"erros_console": erros, "poses": {}}
    for nome, (e, d, a) in poses.items():
        pg.evaluate(f"() => {{ const c = window.__navio.cam; c.elUsuario = {e}; c.distUsuario = {d}; c.az = {a}; c.vaz = 0; c.ultimoToque = 1e9; }}")
        pg.wait_for_timeout(1500)
        amostras = pg.evaluate("""async () => { const r = window.__navio.renderer, out = [];
          for (let i = 0; i < 12; i++) { await new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));
            out.push([r.info.render.calls, r.info.render.triangles]); }
          return out; }""")
        res["poses"][nome] = {"chamadas_max": max(c for c, _ in amostras), "triangulos_max": max(t for _, t in amostras)}
    # de onde vêm os triângulos (geometria de cada sistema, uma vez)
    res["por_sistema"] = pg.evaluate("""() => { const s = window.__navio; const cena = s.camera.parent || null;
      const conta = (o) => { let t = 0, m = 0; o.traverse(x => { if (x.isMesh || x.isPoints) { const g = x.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        t += x.isInstancedMesh ? n * x.count : (x.isPoints ? 0 : n); m++; } }); return { triangulos: Math.round(t), malhas: m }; };
      const navio = conta(s.navio.grupo);
      let mar = null, raiz = s.navio.grupo; while (raiz.parent) raiz = raiz.parent;
      raiz.traverse(x => { if (x.isMesh && x.material && x.material.uniforms && x.material.uniforms.uPercurso) mar = conta(x); });
      return { navio, mar }; }""")
    nav.close()
pior = {k: max(p[k + "_max"] for p in res["poses"].values()) for k in ("chamadas", "triangulos")}
res["pior_caso"] = pior
res["veredito"] = {k: ("OK" if pior[k] <= PISOS[k] else f"ACIMA do piso {PISOS[k]}") for k in PISOS}
print(json.dumps(res, ensure_ascii=False, indent=1))

"""Fotografa a roda do leme de perto no original e no nosso (câmera apontada para a roda)."""
import io
from playwright.sync_api import sync_playwright
from PIL import Image

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"]
# congela o laço de câmera de cada cena e aponta uma câmera fixa para a roda
APONTAR = """([raiz, alvoNome]) => {
  const s = window[raiz]; const cam = s.camera; const roda = alvoNome === 'orig' ? s.built.wheel : s.navio.leme;
  const p = new cam.position.constructor(); roda.getWorldPosition(p);
  return [p.x, p.y, p.z];
}"""
fotos = []
with sync_playwright() as pw:
    nav = pw.chromium.launch(headless=True, args=ARGS)
    for nome, url, raiz, chave in [("orig", "http://127.0.0.1:8731/fonte-opus/original.html", "__scene", "orig"),
                                   ("nosso", "http://127.0.0.1:8732/index.html?escala=1", "__navio", "nosso")]:
        pg = nav.new_page(viewport={"width": 960, "height": 640})
        pg.goto(url); pg.wait_for_function(f"window.{raiz} && window.{raiz}.renderer", timeout=60000); pg.wait_for_timeout(5000)
        roda = pg.evaluate(APONTAR, [raiz, chave])
        for k, (dx, dy, dz) in enumerate([(0.6, 5.5, 4.0), (2.8, 1.6, 3.2)]):  # de ré-boreste e de vante-bombordo
            # sobrescreve a câmera depois do laço da cena, a cada quadro
            pg.evaluate("""([raiz, r, d]) => { const s = window[raiz]; const cam = s.camera;
              const orig = s.renderer.render.bind(s.renderer);
              s.renderer.render = (cena, c) => { if (c === cam) { cam.position.set(r[0]+d[0], r[1]+d[1], r[2]+d[2]); cam.lookAt(r[0], r[1], r[2]); cam.updateMatrixWorld(); } return orig(cena, c); };
              s.__restaura = () => { s.renderer.render = orig; }; }""", [raiz, roda, [dx, dy, dz]])
            pg.wait_for_timeout(1500)
            fotos.append((f"{nome}-{k}", Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("RGB")))
            pg.evaluate(f"() => window.{raiz}.__restaura()")
        pg.close()
    nav.close()
w, h = 480, 320
folha = Image.new("RGB", (w * 2, h * 2))
for i, (nome, im) in enumerate(fotos):
    folha.paste(im.resize((w, h)), ((i // 2) * w, (i % 2) * h))
folha.save("testes/leme.jpg", quality=90)
print([n for n, _ in fotos])

"""Fotos de conferência da rodada 2 (câmera manual, tempo congelado): escaler de cima, lanterna do convés,
estais na frente das velas, bujarronas e bandeiras. Gera testes/rodada2.jpg (folha 3 × 2)."""
import io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"]
# (nome, posição da câmera, alvo) no espaço do navio
POSES = [
    ("escaler de cima", (3.5, 9.5, -3.2), (0, 5.4, -5)),
    ("lanterna de boreste", (8, 8.5, -6), (4.8, 6.2, -4.1)),
    ("estais e redondas (proa-bombordo)", (-14, 16, -30), (0, 16, -6)),
    ("bujarronas (sotavento)", (16, 10, -26), (0, 13, -20)),
    ("bandeira e flâmula", (22, 30, -14), (0, 30, -6)),
    ("geral", (38, 14, 30), (0, 12, -3)),
]
APONTA = """([pos, alvo]) => { const W = window.__navio, cam = W.camera, g = W.navio.grupo;
  const P = new cam.position.constructor(...pos).applyMatrix4(g.matrixWorld), A = new cam.position.constructor(...alvo).applyMatrix4(g.matrixWorld);
  const orig = W.__renderOrig ??= W.renderer.render.bind(W.renderer);
  W.renderer.render = (c, k) => { if (k === cam) { cam.position.copy(P); cam.lookAt(A); cam.updateMatrixWorld(); } return orig(c, k); }; }"""
fotos = []
with sync_playwright() as pw:
    nav = pw.chromium.launch(headless=True, args=ARGS)
    pg = nav.new_page(viewport={"width": 800, "height": 500})
    pg.goto("http://127.0.0.1:8732/index.html?escala=1")
    pg.wait_for_function("window.__navio && document.body.classList.contains('pronto')", timeout=60000)
    pg.evaluate("() => { window.__navio.congelado.ativo = true; }")
    for nome, pos, alvo in POSES:
        pg.evaluate(APONTA, [pos, alvo]); pg.wait_for_timeout(1200)
        fotos.append((nome, Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("RGB")))
    nav.close()
w, h = 800, 500
folha = Image.new("RGB", (w * 3, h * 2))
for i, (nome, im) in enumerate(fotos):
    folha.paste(im, ((i % 3) * w, (i // 3) * h))
    ImageDraw.Draw(folha).text(((i % 3) * w + 10, (i // 3) * h + 8), nome, fill=(255, 255, 255))
folha.save("testes/rodada2.jpg", quality=88)
print("testes/rodada2.jpg")

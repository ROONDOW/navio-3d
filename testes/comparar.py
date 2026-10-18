"""Fotografa o original do Opus e o nosso navio nas mesmas poses de câmera e monta uma folha
lado a lado (esquerda = original, direita = nosso). Usa a RTX para as duas renderizarem cheias.

  python testes/comparar.py [saida.jpg]
"""
import sys, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

SAIDA = sys.argv[1] if len(sys.argv) > 1 else "testes/lado-a-lado.jpg"
L, A = 1280, 720
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"]
CENAS = [
    ("ORIGINAL (Opus)", "http://127.0.0.1:8731/fonte-opus/original.html", "__scene", ("userEl", "userDist", "az", "lastInput")),
    ("NOSSO", "http://127.0.0.1:8732/index.html?escala=1", "__navio", ("elUsuario", "distUsuario", "az", "ultimoToque")),
]
POSES = [("geral", 0.16, 74, 2.45), ("lado", 0.12, 34, 1.5708), ("popa", 0.22, 30, 0.35),
         ("aérea", 0.75, 40, 2.2), ("proa", 0.06, 26, 2.7), ("rasante", 0.03, 28, -1.2)]

fotos = {}
with sync_playwright() as p:
    nav = p.chromium.launch(headless=True, args=ARGS)
    for nome, url, raiz, (el, dist, az, toque) in CENAS:
        pg = nav.new_page(viewport={"width": L, "height": A})
        pg.goto(url); pg.wait_for_function(f"window.{raiz} && window.{raiz}.renderer", timeout=60000)
        pg.wait_for_timeout(6000)
        for pose, e, d, a in POSES:
            pg.evaluate(f"() => {{ const c = window.{raiz}.cam; c.{el} = {e}; c.{dist} = {d}; c.az = {a}; c.vaz = 0; c.{toque} = 1e9; }}")
            pg.wait_for_timeout(3500)
            fotos[(nome, pose)] = Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("RGB")
        pg.close()
    nav.close()

esc = 0.5
w, h = int(L * esc), int(A * esc)
folha = Image.new("RGB", (w * 2 + 6, (h + 4) * len(POSES)), (12, 10, 14))
dr = ImageDraw.Draw(folha)
try:
    fonte = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 18)
except OSError:
    fonte = ImageFont.load_default()
for i, (pose, *_ ) in enumerate(POSES):
    for j, (nome, *_r) in enumerate(CENAS):
        im = fotos[(nome, pose)].resize((w, h), Image.LANCZOS)
        x, y = j * (w + 6), i * (h + 4)
        folha.paste(im, (x, y))
        dr.rectangle([x, y, x + 230, y + 26], fill=(0, 0, 0))
        dr.text((x + 6, y + 3), f"{nome} · {pose}", fill=(255, 230, 160), font=fonte)
folha.save(SAIDA, quality=90)
for (nome, pose), im in fotos.items():
    im.save(SAIDA.replace(".jpg", f"-{'orig' if 'ORIG' in nome else 'nosso'}-{pose}.jpg"), quality=92)
print("salvo", SAIDA, folha.size)

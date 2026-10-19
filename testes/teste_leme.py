"""Regressão do leme (2026-10-18, achado pelo Vitor): o timoneiro fica ATRÁS da roda olhando para a
proa (-Z), então a bitácula (bússola) tem de estar À FRENTE da roda e o espaço logo atrás dela livre.
Fonte: Wikipedia "Binnacle" — "mounted in front of the helmsman"."""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    nav = pw.chromium.launch(headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
    pg = nav.new_page(viewport={"width": 640, "height": 360})
    pg.goto("http://127.0.0.1:8732/index.html?escala=0.5")
    pg.wait_for_function("window.__navio && window.__navio.navio", timeout=60000)
    d = pg.evaluate("() => window.__navio.navio.disposicao")
    nav.close()

falhas = []
# a proa está em -Z: "à frente" = z menor
if not d["bitacula"] < d["roda"] - 0.5:
    falhas.append(f"bitácula em z={d['bitacula']:.2f} não está à frente da roda (z={d['roda']:.2f}): o timoneiro teria de olhar para trás")
if d["roda"] < d["pedestal"] < d["roda"] + 1.0:
    falhas.append(f"pedestal em z={d['pedestal']:.2f} ocupa o lugar do timoneiro (até 1 m atrás da roda)")
print("disposição:", {k: round(v, 2) for k, v in d.items() if isinstance(v, (int, float))})
print("FALHOU:\n  " + "\n  ".join(falhas) if falhas else "PASSOU: bitácula à frente da roda, lugar do timoneiro livre")
sys.exit(1 if falhas else 0)

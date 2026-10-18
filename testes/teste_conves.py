"""Família de defeito: peças do convés se atropelando (achado do leme, 2026-10-18).
1) leme: bitácula à frente da roda; lugar do timoneiro livre atrás dela.
2) nenhuma pegada no convés invade outra (retângulos em x e z), com 2 cm de tolerância.
Cada execução imprime as colisões; código de saída 1 se houver alguma."""
import sys
from playwright.sync_api import sync_playwright

def ler(url="http://127.0.0.1:8732/index.html?escala=0.5"):
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        pg = nav.new_page(viewport={"width": 640, "height": 360})
        pg.goto(url); pg.wait_for_function("window.__navio && window.__navio.navio", timeout=60000)
        d = pg.evaluate("() => window.__navio.navio.disposicao"); nav.close()
    return d

def colisoes(itens, tol=0.02):
    out = []
    for i in range(len(itens)):
        for j in range(i + 1, len(itens)):
            a, b = itens[i], itens[j]
            ix = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
            iz = min(a["z1"], b["z1"]) - max(a["z0"], b["z0"])
            if ix > tol and iz > tol:
                out.append(f"{a['nome']} × {b['nome']} (sobreposição {ix:.2f} m em x, {iz:.2f} m em z)")
    return out

if __name__ == "__main__":
    # controle do próprio teste: dois retângulos que se cruzam têm de ser acusados, dois vizinhos não
    assert colisoes([{"nome": "a", "x0": 0, "x1": 1, "z0": 0, "z1": 1}, {"nome": "b", "x0": 0.5, "x1": 2, "z0": 0.5, "z1": 2}]), "controle doente não acusado"
    assert not colisoes([{"nome": "a", "x0": 0, "x1": 1, "z0": 0, "z1": 1}, {"nome": "b", "x0": 1, "x1": 2, "z0": 0, "z1": 1}]), "controle são acusado"
    d = ler()
    falhas = []
    if not d["bitacula"] < d["roda"] - 0.5:
        falhas.append(f"bitácula (z={d['bitacula']:.2f}) não está à frente da roda (z={d['roda']:.2f})")
    falhas += colisoes(d["itens"])
    print(f"{len(d['itens'])} peças registradas no convés")
    print("FALHOU:\n  " + "\n  ".join(falhas) if falhas else "PASSOU: leme na orientação certa e nenhuma peça do convés invade outra")
    sys.exit(1 if falhas else 0)

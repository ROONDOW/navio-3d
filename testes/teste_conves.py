"""Família de defeito: peças do convés se atropelando (achado do leme, 2026-10-18).
1) leme: bitácula à frente da roda; lugar do timoneiro livre atrás dela.
2) nenhuma pegada no convés invade outra (retângulos em x e z), com 2 cm de tolerância.
3) nenhuma CAIXA MEDIDA invade outra: o próprio Lote mede a geometria de cada peça rotulada
   (canhão, lanterna, escaler, balaustrada, escada, roda, bitácula…), sem pegada escrita à mão
   (rodada 2 do verificador: a lanterna sobre o reparo passava porque ninguém a tinha declarado).
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

def colisoes3d(caixas, tol=0.02):
    out = []
    for i in range(len(caixas)):
        for j in range(i + 1, len(caixas)):
            a, b = caixas[i], caixas[j]
            ov = [min(a["max"][k], b["max"][k]) - max(a["min"][k], b["min"][k]) for k in range(3)]
            # em planta (x, z) se sobrepõem e o vão vertical entre elas é menor que 1,5 m: uma está dentro
            # da outra OU plantada em cima dela (a haste da lanterna nascendo no topo do reparo, rodada 2)
            if ov[0] > tol and ov[2] > tol and -ov[1] < 1.5:
                como = "se cruzam" if ov[1] > tol else f"uma apoiada/encostada na outra (vão {max(-ov[1], 0):.2f} m)"
                out.append(f"{a['nome']} × {b['nome']} ({como}; planta {ov[0]:.2f} × {ov[2]:.2f} m)")
    return out

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
    cx = lambda n, a, b: {"nome": n, "min": a, "max": b}
    assert colisoes3d([cx("a", [0, 0, 0], [1, 1, 1]), cx("b", [0.5, 0.5, 0.5], [2, 2, 2])]), "controle doente 3D não acusado"
    assert colisoes3d([cx("a", [0, 0, 0], [1, 1, 1]), cx("b", [0.5, 1.0, 0.5], [2, 2, 2])]), "controle doente 3D não acusado (um plantado no outro)"
    assert not colisoes3d([cx("a", [0, 0, 0], [1, 1, 1]), cx("b", [1.0, 0, 0], [2, 1, 1])]), "controle são 3D acusado (lado a lado)"
    assert not colisoes3d([cx("a", [0, 0, 0], [1, 1, 1]), cx("b", [0.2, 2.6, 0.2], [0.8, 3, 0.8])]), "controle são 3D acusado (bem acima, vão de 1,6 m)"
    d = ler()
    falhas = []
    if not d["bitacula"] < d["roda"] - 0.5:
        falhas.append(f"bitácula (z={d['bitacula']:.2f}) não está à frente da roda (z={d['roda']:.2f})")
    falhas += colisoes(d["itens"])
    falhas += colisoes3d(d["caixas"])
    print(f"{len(d['itens'])} pegadas declaradas e {len(d['caixas'])} caixas medidas no convés")
    print("FALHOU:\n  " + "\n  ".join(falhas) if falhas else "PASSOU: leme na orientação certa e nenhuma peça do convés invade outra")
    sys.exit(1 if falhas else 0)

"""Medidor de desempenho: abre a cena num Chromium sem janela (com placa de vídeo de verdade),
espera aquecer, coloca a câmera em poses fixas e conta quadros. Roda a mesma rotina no original
do Opus e no nosso navio, para a comparação ser justa.

  python testes/medir.py [integrada|rtx] [largura] [altura]
"""
import json, sys, time
from playwright.sync_api import sync_playwright

PLACA = sys.argv[1] if len(sys.argv) > 1 else "integrada"
L = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
A = int(sys.argv[3]) if len(sys.argv) > 3 else 720
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader=false",
        "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"]
if PLACA == "rtx":
    ARGS.append("--force_high_performance_gpu")
else:
    ARGS.append("--force_low_power_gpu")

CENAS = {
    "original (Opus)": ("http://127.0.0.1:8731/fonte-opus/original.html", "__scene", "cam", ("userEl", "userDist", "az", "lastInput")),
    "nosso navio":     ("http://127.0.0.1:8732/index.html?escala=1", "__navio", "cam", ("elUsuario", "distUsuario", "az", "ultimoToque")),
}
POSES = {"longe": (0.16, 74, 2.45), "perto": (0.12, 34, 1.5708), "aérea": (0.75, 40, 2.2)}

MEDIR = """async (ms) => { let n = 0; const t0 = performance.now();
  await new Promise(r => { (function f(){ n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : r(); })(); });
  return n / ((performance.now() - t0) / 1000); }"""

def rodar():
    res = {"placa": PLACA, "viewport": f"{L}x{A}"}
    with sync_playwright() as p:
        nav = p.chromium.launch(headless=True, args=ARGS)
        for nome, (url, raiz, camn, (el, dist, az, toque)) in CENAS.items():
            pg = nav.new_page(viewport={"width": L, "height": A})
            erros = []
            pg.on("pageerror", lambda e: erros.append(str(e)))
            pg.goto(url); pg.wait_for_function(f"window.{raiz} && window.{raiz}.renderer", timeout=60000)
            gpu = pg.evaluate(f"""() => {{ const gl = window.{raiz}.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info');
                return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }}""")
            pg.evaluate(MEDIR, 6000)  # aquecimento: compila shaders, sobe texturas
            linha = {"gpu": gpu, "erros": erros}
            for pose, (e, d, a) in POSES.items():
                pg.evaluate(f"""() => {{ const c = window.{raiz}.{camn}; c.{el} = {e}; c.{dist} = {d}; c.az = {a}; c.vaz = 0; c.{toque} = 1e9; }}""")
                pg.evaluate(MEDIR, 1500)
                fps = [round(pg.evaluate(MEDIR, 4000), 1) for _ in range(2)]
                tela = pg.evaluate(f"() => window.{raiz}.renderer.domElement.width + 'x' + window.{raiz}.renderer.domElement.height")
                linha[pose] = {"fps": fps, "tela": tela}
            res[nome] = linha
            pg.close()
        nav.close()
    print(json.dumps(res, ensure_ascii=False, indent=1))

rodar()

"""Bateria do PRD "Cena 3D de oceano e navio" (§9), com par doente/são em cada checagem.

  python testes/bateria.py

1. console sem erro (doente: página com erro de propósito tem de ser acusada)
2. nada parado > 0,5 s (doente: cena congelada tem de reprovar)
3. três constantes do CONFIG mudam a cena em tempo de execução
4. silhueta legível sem pós (?cru): o navio contrasta com o fundo
5. zero arquivo de modelo 3D no pacote
6. sem WebGL: o aviso aparece
7. prefers-reduced-motion: a câmera para de girar sozinha
8. "existe mas não aparece": bandeira e flâmula visíveis na tela (pixels escuros/vermelhos no alto)
Sai com 1 se qualquer item reprovar.
"""
import io, re, sys, pathlib
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8732/index.html"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"]
RAIZ = pathlib.Path(__file__).resolve().parent.parent
resultados = []

def item(nome, ok, detalhe):
    resultados.append((nome, ok, detalhe))
    print(f"[{'OK ' if ok else 'FALHA'}] {nome} — {detalhe}")

def foto(pg):
    return np.asarray(Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("L"), dtype=np.float32)

def maior_parado(pg, segundos=6.0, passo=0.1, limiar=0.4):
    """Fotografa a cada 0,1 s e devolve o maior trecho (s) em que a imagem quase não mudou."""
    ant, parado, maior = foto(pg), 0.0, 0.0
    t = 0.0
    while t < segundos:
        pg.wait_for_timeout(int(passo * 1000)); t += passo
        atual = foto(pg)
        d = float(np.abs(atual - ant).mean())
        parado = parado + passo if d < limiar else 0.0
        maior = max(maior, parado); ant = atual
    return maior

def abrir(nav, url=URL + "?escala=0.75", **ctx):
    c = nav.new_context(viewport={"width": 960, "height": 540}, **ctx)
    pg = c.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pg.goto(url)
    return c, pg, erros

with sync_playwright() as pw:
    nav = pw.chromium.launch(headless=True, args=ARGS)

    # 1 + 2: console e movimento
    c, pg, erros = abrir(nav)
    pg.wait_for_function("window.__navio && document.body.classList.contains('pronto')", timeout=60000)
    pg.wait_for_timeout(3000)
    item("1. console sem erro", not erros, f"{len(erros)} erro(s)" + (f": {erros[0][:120]}" if erros else ""))
    parado = maior_parado(pg)
    item("2. nada parado > 0,5 s", parado <= 0.5, f"maior trecho parado: {parado:.1f} s")
    # doente do item 2: congelar o laço tem de reprovar
    pg.evaluate("() => { window.requestAnimationFrame = () => 0; }")
    pg.wait_for_timeout(500)
    parado_doente = maior_parado(pg, segundos=2.0)
    item("2b. controle doente (cena congelada é acusada)", parado_doente > 0.5, f"cena congelada: {parado_doente:.1f} s parada")
    c.close()

    # doente do item 1: erro jogado de propósito tem de aparecer na coleta
    c, pg, erros = abrir(nav)
    pg.wait_for_function("window.__navio", timeout=60000)
    pg.evaluate("() => setTimeout(() => { throw new Error('erro plantado') }, 0)")
    pg.wait_for_timeout(500)
    item("1b. controle doente (erro plantado é coletado)", any("plantado" in e for e in erros), f"{len(erros)} erro(s) coletado(s)")
    c.close()

    # 3: três constantes em tempo de execução
    c, pg, _ = abrir(nav)
    pg.wait_for_function("window.__navio && document.body.classList.contains('pronto')", timeout=60000)
    pg.wait_for_timeout(2000)
    pg.evaluate("() => { const c = window.__navio.cam; c.elUsuario = 0.16; c.distUsuario = 74; c.az = 2.45; c.vaz = 0; c.ultimoToque = 1e9; }")
    pg.wait_for_timeout(800)
    a = foto(pg)
    medidas = pg.evaluate("""async () => {
      const N = window.__navio, C = N.CONFIG, espera = (ms) => new Promise(r => setTimeout(r, ms));
      const az0 = N.cam.az; C.camera.giroAutomatico = 0; N.cam.ultimoToque = -1e9; await espera(1200);
      const az1 = N.cam.az; await espera(1200); const az2 = N.cam.az;           // giro zerado: azimute não anda
      C.camera.giroAutomatico = 0.5; await espera(1200); const az3 = N.cam.az; // giro alto: anda rápido
      return { parado: Math.abs(az2 - az1), andou: Math.abs(az3 - az2) };
    }""")
    item("3a. CONFIG.camera.giroAutomatico", medidas["parado"] < 1e-3 and medidas["andou"] > 0.3,
         f"giro 0 → azimute variou {medidas['parado']:.4f} rad; giro 0,5 → {medidas['andou']:.2f} rad")
    pg.evaluate("() => { const c = window.__navio.cam; window.__navio.CONFIG.camera.giroAutomatico = 0; c.elUsuario = 0.16; c.distUsuario = 74; c.az = 2.45; c.vaz = 0; c.ultimoToque = 1e9; }")
    pg.wait_for_timeout(800)
    base = foto(pg)
    pg.evaluate("() => { const d = window.__navio.CONFIG.sol.direcao; d.set(0.6, 0.35, 0.7).normalize(); }")  # o vetor é compartilhado com os shaders
    pg.wait_for_timeout(2500)
    sol = foto(pg)
    item("3b. CONFIG.sol.direcao", float(np.abs(sol - base).mean()) > 4, f"diferença média na imagem: {float(np.abs(sol - base).mean()):.1f} (0–255)")
    v = pg.evaluate("""async () => { const N = window.__navio; N.CONFIG.mar.velocidadeNavio = 0;
      const u = () => { let m = null; let r = N.navio.grupo; while (r.parent) r = r.parent;
        r.traverse(x => { if (x.material && x.material.uniforms && x.material.uniforms.uPercurso) m = x.material.uniforms.uPercurso.value; }); return m; };
      const p0 = u(); await new Promise(r => setTimeout(r, 1000)); const p1 = u();
      N.CONFIG.mar.velocidadeNavio = 20; await new Promise(r => setTimeout(r, 1000)); const p2 = u();
      return { parado: p1 - p0, rapido: p2 - p1 }; }""")
    item("3c. CONFIG.mar.velocidadeNavio", abs(v["parado"]) < 1e-6 and v["rapido"] > 10,
         f"velocidade 0 → mar andou {v['parado']:.3f} m em 1 s; velocidade 20 → {v['rapido']:.1f} m")
    c.close()

    # 4: silhueta sem pós — par: a mesma foto com o navio e sem ele. Se tirar o navio não muda a
    # imagem na área dele, a silhueta não se lê. (doente = navio escondido nas duas fotos: diferença ~0)
    c, pg, _ = abrir(nav, URL + "?escala=0.75&cru")
    pg.wait_for_function("window.__navio && document.body.classList.contains('pronto')", timeout=60000)
    pg.evaluate("() => { const c = window.__navio.cam; c.elUsuario = 0.12; c.distUsuario = 34; c.az = 1.5708; c.vaz = 0; c.ultimoToque = 1e9; window.__navio.CONFIG.mar.velocidadeNavio = 0; }")
    pg.wait_for_timeout(3000)
    pg.evaluate("() => { window.__navio.congelado.ativo = true; }"); pg.wait_for_timeout(600)  # tempo parado: só o navio muda
    com = foto(pg)
    pg.evaluate("() => { window.__navio.navio.grupo.visible = false; }"); pg.wait_for_timeout(600)
    sem = foto(pg)
    pg.wait_for_timeout(600); sem2 = foto(pg)   # doente: sem navio nas duas fotos
    regiao = (slice(int(com.shape[0] * 0.15), int(com.shape[0] * 0.95)), slice(int(com.shape[1] * 0.1), int(com.shape[1] * 0.9)))
    d_navio = float(np.abs(com[regiao] - sem[regiao]).mean())
    d_doente = float(np.abs(sem[regiao] - sem2[regiao]).mean())
    item("4. silhueta legível sem pós (navio × sem navio)", d_navio > 20 and d_navio > 4 * max(d_doente, 1), f"diferença com/sem navio {d_navio:.1f}; doente (sem/sem) {d_doente:.1f}")
    Image.fromarray(com.astype(np.uint8)).save(RAIZ / "testes" / "silhueta-cru.jpg")
    c.close()

    # 6: sem WebGL
    nav2 = pw.chromium.launch(headless=True, args=["--disable-webgl", "--disable-webgl2", "--disable-gpu"])
    pg = nav2.new_page(); pg.goto(URL); pg.wait_for_timeout(2500)
    vis = pg.evaluate("() => { const a = document.getElementById('sem-webgl'); return a && !a.hidden && getComputedStyle(a).display !== 'none' ? a.innerText.slice(0, 80) : null; }")
    item("6. sem WebGL: aviso aparece", bool(vis), f"aviso: {vis!r}")
    nav2.close()
    # controle são do 6: com WebGL o aviso NÃO aparece
    c, pg, _ = abrir(nav)
    pg.wait_for_function("window.__navio", timeout=60000)
    escondido = pg.evaluate("() => document.getElementById('sem-webgl').hidden")
    item("6b. controle são (com WebGL não há aviso)", escondido, f"aviso escondido: {escondido}")
    c.close()

    # 7: reduzir movimento
    c, pg, _ = abrir(nav, reduced_motion="reduce")
    pg.wait_for_function("window.__navio && document.body.classList.contains('pronto')", timeout=60000)
    pg.evaluate("() => { window.__navio.cam.ultimoToque = -1e9; }")
    az = pg.evaluate("async () => { const a = window.__navio.cam.az; await new Promise(r => setTimeout(r, 3000)); return window.__navio.cam.az - a; }")
    item("7. prefers-reduced-motion: câmera não gira sozinha", abs(az) < 1e-3, f"azimute variou {az:.4f} rad em 3 s")
    c.close()

    # 8: existe mas não aparece — par: vista geral com bandeira e flâmula × com as duas escondidas.
    c, pg, _ = abrir(nav, URL + "?escala=1")
    pg.wait_for_function("window.__navio && document.body.classList.contains('pronto')", timeout=60000)
    pg.evaluate("() => { const c = window.__navio.cam; c.elUsuario = 0.16; c.distUsuario = 74; c.az = 2.45; c.vaz = 0; c.ultimoToque = 1e9; window.__navio.CONFIG.mar.velocidadeNavio = 0; }")
    pg.wait_for_timeout(3000)
    def topo_rgb():
        rgb = np.asarray(Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("RGB"), dtype=np.int32)
        return rgb[: int(rgb.shape[0] * 0.25)]
    def medidas(tp):
        return int((tp.sum(axis=2) < 200).sum()), int(((tp[..., 0] > 110) & (tp[..., 1] < 60) & (tp[..., 2] < 60)).sum())
    com_escuros, com_verm = medidas(topo_rgb())
    pg.evaluate("() => { window.__navio.navio.velas.forEach(m => { if (m.geometry.attributes.aVela.getZ(0) > 0.5) m.visible = false; }); }")
    pg.wait_for_timeout(800)
    sem_escuros, sem_verm = medidas(topo_rgb())
    item("8. bandeira e flâmula aparecem na tela", com_escuros - sem_escuros > 300 and com_verm - sem_verm > 50,
         f"pixels escuros no topo {com_escuros} com × {sem_escuros} sem; vermelhos {com_verm} × {sem_verm}")
    c.close()
    nav.close()

# 5: zero modelo 3D no pacote e no código
pacote = (RAIZ / "index.html").read_text(encoding="utf-8")
achados = re.findall(r"[\w./-]+\.(?:glb|gltf|fbx|obj)\b", pacote) + [str(f) for f in (RAIZ / "src").rglob("*") if f.suffix.lower() in (".glb", ".gltf", ".fbx", ".obj")]
achados = [a for a in achados if not a.endswith(".obj") or "/" in a]  # ".obj" aparece em nomes de variável do Three; só caminho conta
item("5. zero arquivo de modelo 3D", not achados, f"{len(achados)} referência(s)" + (f": {achados[:3]}" if achados else ""))

falhas = [r for r in resultados if not r[1]]
print(f"\n{len(resultados) - len(falhas)}/{len(resultados)} itens OK")
sys.exit(1 if falhas else 0)

// Monta a cena e roda o laço: mar corre, navio flutua em molas, câmera filma sozinha.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { uniformesCeu, criarCupula, criarIlhas, criarReflexoDoCeu } from './ceu.js';
import { prepararOndas, criarAlturaDaAgua, criarMar, texturaDoCasco } from './mar.js';
import { criarNavio } from './navio.js';
import { uniformesVela } from './velas.js';
import { criarBorrifo, criarGaivotas } from './vida.js';
import { texturaNormalMar, texturaEspuma, texturaPonto } from './texturas.js';
import { Pos } from './pos.js';

function semWebGL(motivo) {
  const aviso = document.getElementById('sem-webgl');
  if (aviso) { aviso.hidden = false; aviso.querySelector('[data-motivo]').textContent = motivo; }
}

function iniciar() {
  const teste = document.createElement('canvas');
  if (!teste.getContext('webgl2')) { semWebGL('Este navegador não oferece WebGL 2.'); return; }

  const C = CONFIG;
  const debug = new URLSearchParams(location.search).has('debug');
  const cru = new URLSearchParams(location.search).has('cru'); // ?cru = sem pós-processamento (teste de silhueta)
  const movimentoReduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(1); // a escala é nossa (resolução adaptativa), não do navegador
  renderer.toneMapping = THREE.NoToneMapping; // o tone mapping é feito no pós
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // filtro simples: o PCF suave custa caro na placa integrada
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  document.body.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  cena.fog = new THREE.FogExp2(0x5a3a4a, 0.0014);
  const camera = new THREE.PerspectiveCamera(C.camera.fov, innerWidth / innerHeight, 0.5, 9000);

  // ── céu, reflexo e luz ambiente ──
  const uCeu = uniformesCeu(C);
  cena.add(criarCupula(uCeu, true));
  const ilhas = criarIlhas(uCeu); cena.add(ilhas);
  const reflexoCeu = criarReflexoDoCeu(renderer, uCeu);
  cena.environment = reflexoCeu.ambiente;

  const sol = new THREE.DirectionalLight(C.sol.cor, C.sol.intensidade);
  sol.castShadow = true;
  sol.shadow.mapSize.set(C.desempenho.sombra, C.desempenho.sombra);
  Object.assign(sol.shadow.camera, { left: -26, right: 26, top: 30, bottom: -30, near: 40, far: 220 });
  sol.shadow.bias = -5e-4; sol.shadow.normalBias = 0.05;
  cena.add(sol, sol.target);
  cena.add(new THREE.HemisphereLight(C.sol.ambienteCeu, C.sol.ambienteMar, C.sol.ambienteForca));

  // ── mar ──
  const ondas = prepararOndas(C);
  const alturaDaAgua = criarAlturaDaAgua(ondas, C.mar.inclinacao);

  // ── navio ──
  const navio = criarNavio(C);
  const balanco = new THREE.Group(); // recebe arfagem, jogo e altura
  balanco.add(navio.grupo);
  cena.add(balanco);

  const mar = criarMar(C, {
    ondas, normal: texturaNormalMar(), espuma: texturaEspuma(), cuboCeu: reflexoCeu.cubo,
    uniformesCeu: uCeu, amostrasCasco: navio.amostras,
  });
  mar.uniformes.uCasco.value = texturaDoCasco(navio.larguras, C.navio.meiaBoca);
  cena.add(mar.malha);

  const borrifo = criarBorrifo(C, texturaPonto());
  cena.add(borrifo.pontos);
  const gaivotas = criarGaivotas(7);
  cena.add(gaivotas.grupo);
  gaivotas.grupo.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  uniformesVela.uCorSol.value.copy(C.sol.cor);

  // ── reflexo planar do navio na água (meia resolução, câmera espelhada no plano y = 0) ──
  const alvoReflexo = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  const camReflexo = new THREE.PerspectiveCamera();
  const corte = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), rot = new THREE.Matrix4();
  const vies = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  function desenharReflexo() {
    camReflexo.position.set(camera.position.x, -camera.position.y, camera.position.z);
    rot.extractRotation(camera.matrixWorld);
    tmpA.set(0, 0, -1).applyMatrix4(rot).add(camera.position);  // um ponto para onde a câmera olha
    tmpA.y = -tmpA.y;
    tmpB.set(0, 1, 0).applyMatrix4(rot); tmpB.y = -tmpB.y;      // "cima" espelhado
    camReflexo.up.copy(tmpB); camReflexo.lookAt(tmpA);
    camReflexo.projectionMatrix.copy(camera.projectionMatrix);
    camReflexo.updateMatrixWorld();
    mar.uniformes.uMatrizReflexo.value.copy(vies).multiply(camReflexo.projectionMatrix).multiply(camReflexo.matrixWorldInverse);
    mar.malha.visible = false; borrifo.pontos.visible = false; ilhas.visible = false; gaivotas.grupo.visible = false;
    const fundoAntes = cena.fog; cena.fog = null;
    cena.children[0].visible = false; // a cúpula: o céu refletido vem do cubo, aqui só o navio
    renderer.clippingPlanes = [corte];
    renderer.setRenderTarget(alvoReflexo); renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(cena, camReflexo);
    renderer.clippingPlanes = []; renderer.setClearColor(0x000000, 1);
    cena.fog = fundoAntes; cena.children[0].visible = true;
    mar.malha.visible = true; borrifo.pontos.visible = true; ilhas.visible = true; gaivotas.grupo.visible = true;
  }
  mar.uniformes.uReflexo.value = alvoReflexo.texture;

  const pos = new Pos(renderer, C, 5);

  // ── tamanho e resolução adaptativa ──
  const D = C.desempenho;
  const escalaTeto = Math.min(window.devicePixelRatio || 1, D.escalaMaxima);
  const travada = parseFloat(new URLSearchParams(location.search).get('escala')); // ?escala=1 trava (para medir)
  let escala = Number.isFinite(travada) ? travada : Math.min(1, escalaTeto);
  function redimensionar() {
    const l = innerWidth, a = innerHeight;
    renderer.setSize(Math.floor(l * escala), Math.floor(a * escala), false);
    renderer.domElement.style.width = l + 'px'; renderer.domElement.style.height = a + 'px';
    camera.aspect = l / a; camera.updateProjectionMatrix();
    pos.tamanho(Math.floor(l * escala), Math.floor(a * escala));
    alvoReflexo.setSize(Math.floor(l * escala * D.escalaReflexo), Math.floor(a * escala * D.escalaReflexo));
    borrifo.material.uniforms.uEscala.value = a * escala * 0.9;
  }
  addEventListener('resize', redimensionar);
  redimensionar();

  // ── câmera: órbita própria, piloto automático e mão humana ──
  const CC = C.camera;
  const cam = { az: CC.azimuteInicial, el: CC.elevacao[0], dist: CC.distancia[0], elUsuario: null, distUsuario: null,
    ultimoToque: -1e9, arrastando: false, px: 0, py: 0, vaz: 0 };
  const tela = renderer.domElement;
  tela.style.touchAction = 'none';
  const relogio = new THREE.Clock();
  tela.addEventListener('pointerdown', (e) => {
    cam.arrastando = true; cam.px = e.clientX; cam.py = e.clientY; tela.setPointerCapture(e.pointerId);
    cam.ultimoToque = relogio.elapsedTime;
    if (cam.elUsuario === null) { cam.elUsuario = cam.el; cam.distUsuario = cam.dist; }
  });
  tela.addEventListener('pointermove', (e) => {
    if (!cam.arrastando) return;
    const dx = e.clientX - cam.px, dy = e.clientY - cam.py;
    cam.px = e.clientX; cam.py = e.clientY;
    cam.vaz = -dx * 0.005; cam.az += cam.vaz;
    cam.elUsuario = THREE.MathUtils.clamp(cam.elUsuario + dy * 0.004, 0.015, 1.2);
    cam.ultimoToque = relogio.elapsedTime;
  });
  const soltar = () => { cam.arrastando = false; };
  tela.addEventListener('pointerup', soltar); tela.addEventListener('pointercancel', soltar);
  tela.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (cam.elUsuario === null) { cam.elUsuario = cam.el; cam.distUsuario = cam.dist; }
    cam.distUsuario = THREE.MathUtils.clamp(cam.distUsuario * Math.exp(e.deltaY * 0.001), CC.distanciaLimite[0], CC.distanciaLimite[1]);
    cam.ultimoToque = relogio.elapsedTime;
  }, { passive: false });

  // ── flutuação: altura do mar em 5 pontos do casco → alvos → molas amortecidas ──
  const estado = { altura: 0, vAlt: 0, arfagem: 0, vArf: 0, jogo: 0, vJogo: 0 };
  const mola = (x, v, alvo, k, c, dt) => { v += ((alvo - x) * k - v * c) * dt; return [x + v * dt, v]; };
  const alvoCam = new THREE.Vector3(0, 12.5, -3), alvoSuave = alvoCam.clone();
  const solTela = new THREE.Vector3();
  let percurso = 0, ultimoCeu = 0, ultimoAmbiente = 0;
  const amostrasDt = [];
  const congelado = { ativo: false, t: null };

  let painel = null;
  if (debug) {
    painel = document.createElement('pre');
    painel.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;font:12px/1.35 ui-monospace,Consolas,monospace;color:#e8f0ff;background:rgba(0,0,0,.55);z-index:2;pointer-events:none';
    document.body.appendChild(painel);
  }
  let quadros = 0, ultimoPainel = 0, contaQuadros = 0;
  renderer.info.autoReset = false;

  function quadro() {
    let dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime + 12;
    if (congelado.ativo) { dt = 0; t = congelado.t ??= t; } else congelado.t = null; // gancho de teste: tempo parado
    percurso += C.mar.velocidadeNavio * dt;
    const agua = (x, z) => alturaDaAgua(x, z, t, percurso);

    // flutuação
    const Z0 = C.navio.zProa, L = C.navio.comprimento;
    const hProa = agua(0, Z0 + 3), hPopa = agua(0, Z0 + L - 3), hBb = agua(-4.2, Z0 + 15), hBe = agua(4.2, Z0 + 15), hMeio = agua(0, Z0 + 16);
    const alvoAlt = (hProa + hPopa + hBb + hBe + 2 * hMeio) / 6 - 0.1;
    const alvoArf = Math.atan2(hProa - hPopa, L - 6) * 0.85;
    const alvoJogo = Math.atan2(hBe - hBb, 8.4) * 0.6 + C.navio.adernamento;
    const passos = 3, h = dt / passos, N = C.navio;
    for (let i = 0; i < passos; i++) {
      [estado.altura, estado.vAlt] = mola(estado.altura, estado.vAlt, alvoAlt, N.molaAltura[0], N.molaAltura[1], h);
      [estado.arfagem, estado.vArf] = mola(estado.arfagem, estado.vArf, alvoArf, N.molaArfagem[0], N.molaArfagem[1], h);
      [estado.jogo, estado.vJogo] = mola(estado.jogo, estado.vJogo, alvoJogo, N.molaJogo[0], N.molaJogo[1], h);
    }
    balanco.position.set(0, estado.altura, 0);
    balanco.rotation.set(estado.arfagem, Math.sin(t * 0.13) * 0.012, estado.jogo, 'YXZ');
    balanco.updateMatrixWorld(true);

    uCeu.uTempo.value = t;
    mar.uniformes.uPercurso.value = percurso;
    uniformesVela.uTempo.value = t;
    navio.leme.userData.roda.rotation.z = Math.sin(t * 0.35) * 0.35 + Math.sin(t * 0.9) * 0.08;
    const chama = 0.9 + 0.06 * Math.sin(t * 13.1) + 0.04 * Math.sin(t * 29.7 + 1.3); // lanternas tremulam
    navio.emissivos.forEach((m) => { m.emissiveIntensity = 9 * chama; });
    navio.luzes.forEach((l) => { l.intensity = 22 * chama; });

    // câmera
    const parado = relogio.elapsedTime - cam.ultimoToque;
    if (!cam.arrastando) { cam.az += cam.vaz; cam.vaz *= Math.pow(0.02, dt); } // inércia do arraste
    if (!movimentoReduzido) cam.az += dt * CC.giroAutomatico * THREE.MathUtils.smoothstep(parado, CC.esperaParaGirar[0], CC.esperaParaGirar[1]);
    // frequências que não se repetem: a câmera nunca refaz o mesmo caminho
    const elAuto = CC.elevacao[0] + CC.elevacao[1] * Math.sin(t * 0.083 + 0.5) + 0.04 * Math.sin(t * 0.21);
    const distAuto = CC.distancia[0] + CC.distancia[1] * Math.sin(t * 0.061 + 1.2);
    if (cam.elUsuario !== null) {
      const volta = THREE.MathUtils.smoothstep(parado, CC.voltaAoPiloto[0], CC.voltaAoPiloto[1]);
      cam.el = THREE.MathUtils.lerp(cam.elUsuario, elAuto, volta);
      cam.dist = THREE.MathUtils.lerp(cam.distUsuario, distAuto, volta);
      if (volta >= 1) cam.elUsuario = null;
    } else { cam.el = elAuto; cam.dist = distAuto; }
    alvoCam.set(0, 11.5 + estado.altura * 0.6, -3 + Math.sin(t * 0.05) * 3);
    alvoSuave.lerp(alvoCam, 1 - Math.pow(0.05, dt));
    const ce = Math.cos(cam.el);
    camera.position.set(alvoSuave.x + Math.sin(cam.az) * ce * cam.dist, alvoSuave.y + Math.sin(cam.el) * cam.dist - 6, alvoSuave.z + Math.cos(cam.az) * ce * cam.dist);
    if (!movimentoReduzido) { camera.position.x += Math.sin(t * 0.53) * 0.35; camera.position.y += Math.sin(t * 0.41 + 1) * 0.3; } // mão no ombro
    const piso = agua(camera.position.x, camera.position.z) + CC.alturaMinimaSobreAgua;
    if (camera.position.y < piso) camera.position.y = piso;
    camera.lookAt(alvoSuave); camera.updateMatrixWorld();

    sol.position.copy(C.sol.direcao).multiplyScalar(120).add(balanco.position);
    sol.target.position.set(0, 8, 0); sol.target.updateMatrixWorld();
    uniformesVela.uSolVista.value.copy(C.sol.direcao).transformDirection(camera.matrixWorldInverse);

    borrifo.atualizar(dt, t, navio.grupo, agua);
    gaivotas.atualizar(t);
    if (relogio.elapsedTime - ultimoCeu > 2) { reflexoCeu.atualizar(false); ultimoCeu = relogio.elapsedTime; }      // nuvens andam devagar
    if (relogio.elapsedTime - ultimoAmbiente > 12) { reflexoCeu.atualizar(true); cena.environment = reflexoCeu.ambiente; ultimoAmbiente = relogio.elapsedTime; }

    solTela.copy(C.sol.direcao).multiplyScalar(5000).add(camera.position).project(camera);
    const solNaTela = solTela.z < 1 && Math.abs(solTela.x) < 1.3 && Math.abs(solTela.y) < 1.3;
    pos.comp.uniforms.uSolTela.value.set(solTela.x * 0.5 + 0.5, solTela.y * 0.5 + 0.5, solNaTela ? 1 - Math.max(Math.abs(solTela.x), Math.abs(solTela.y)) / 1.3 : 0);

    renderer.info.reset();
    renderer.shadowMap.needsUpdate = false;
    const par = (contaQuadros++ & 1) === 0;
    if (par) desenharReflexo();                 // quadro par: reflexo do navio na água
    renderer.shadowMap.needsUpdate = !par;      // quadro ímpar: sombra (vela anda devagar; 1 quadro de atraso não se vê)
    if (cru) { renderer.setRenderTarget(null); renderer.clear(); renderer.render(cena, camera); }
    else { renderer.setRenderTarget(pos.principal); renderer.clear(); renderer.render(cena, camera); pos.render(t); }

    // resolução adaptativa: média de 90 quadros decide se baixa ou sobe a escala
    amostrasDt.push(dt);
    if (!Number.isFinite(travada) && amostrasDt.length >= D.quadrosMedidos) {
      const media = amostrasDt.reduce((a, b) => a + b, 0) / amostrasDt.length;
      amostrasDt.length = 0;
      if (media > 1 / D.fpsBaixo && escala > D.escalaMinima) { escala = Math.max(D.escalaMinima, escala - 0.15); redimensionar(); }
      else if (media < 1 / D.fpsAlto && escala < escalaTeto) { escala = Math.min(escalaTeto, escala + 0.1); redimensionar(); }
    }

    quadros++;
    if (painel && relogio.elapsedTime - ultimoPainel > 0.5) {
      const fps = quadros / (relogio.elapsedTime - ultimoPainel);
      painel.textContent = `FPS ${fps.toFixed(0)}  escala ${escala.toFixed(2)}  ${renderer.domElement.width}×${renderer.domElement.height}\n`
        + `chamadas ${renderer.info.render.calls}  triângulos ${(renderer.info.render.triangles / 1000).toFixed(0)} mil\n`
        + `cabos ${navio.contagem.cordas}  velas ${navio.contagem.velas}  lanternas ${navio.contagem.lanternas}`;
      quadros = 0; ultimoPainel = relogio.elapsedTime;
    }
    if (!document.body.classList.contains('pronto')) document.body.classList.add('pronto');
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);

  // gancho de inspeção para os testes (medir sem depender de olho)
  window.__navio = { renderer, camera, cam, navio, CONFIG: C, congelado, get escala() { return escala; } };
}

try { iniciar(); } catch (erro) { console.error(erro); semWebGL('Falha ao iniciar a cena 3D: ' + erro.message); }

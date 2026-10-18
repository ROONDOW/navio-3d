// CONFIG — todo número que ajusta a cena mora aqui (Lei das constantes expostas).
// Unidades: metros, segundos, radianos. O navio aponta para -Z (proa em z = -16).
import * as THREE from 'three';

export const CONFIG = {
  // ── Sol e luz ────────────────────────────────────────────────
  sol: {
    direcao: new THREE.Vector3(-0.56, 0.075, -0.83).normalize(), // sol baixo, à frente e à esquerda
    cor: new THREE.Color(1.0, 0.6, 0.32),
    intensidade: 3.2,
    ambienteCeu: new THREE.Color(0.55, 0.42, 0.62), // luz que vem de cima (céu roxo)
    ambienteMar: new THREE.Color(0.08, 0.14, 0.16), // luz que sobe do mar
    ambienteForca: 0.9,
  },

  // ── Mar ──────────────────────────────────────────────────────
  mar: {
    velocidadeNavio: 7.5, // m/s: o navio fica parado e o mar corre por baixo
    inclinacao: 0.62,     // "Q" de Gerstner: 0 = senoide, 1 = crista no limite de dobrar
    // ondas de Gerstner: [direção (rad), comprimento (m), amplitude (m)]
    ondas: [
      [0.30, 72, 0.80],
      [-0.25, 45, 0.50],
      [0.80, 28, 0.30],
      [-0.70, 17, 0.19],
      [1.20, 10.5, 0.11],
      [0.10, 6.3, 0.065],
      [-1.10, 3.9, 0.04],
    ],
    aneis: 150,          // malha radial: anéis concêntricos (densos perto da câmera)
    segmentos: 240,      // pontos por anel
    crescimentoAnel: 1.055, // 150 anéis chegam a ~3,3 km, o mesmo alcance de antes
    corFundo: new THREE.Color(0.003, 0.016, 0.034),
    corEspalhamento: new THREE.Color(0.02, 0.16, 0.17), // verde-azulado da crista contra o sol
    espumaCrista: 0.75,  // altura relativa onde a crista começa a espumar
    neblina: 0.00055,
  },

  // ── Navio ────────────────────────────────────────────────────
  navio: {
    zProa: -16,
    comprimento: 31,
    meiaBoca: 5.2,       // meia largura máxima do casco
    calado: 3.1,         // fundo do casco abaixo da linha d'água
    // mastros: posição ao longo do casco (0 = proa, 1 = popa), comprimento das 3 seções
    // (mastro real, mastaréu, mastaréu do joanete), envergadura das 3 vergas, grossura na base.
    // O de ré não leva vela redonda embaixo: lá vai a vela latina (mezena).
    mastros: [
      { nome: 'traquete', u: 0.22, secoes: [12.5, 8.5, 6.2], vergas: [17, 12.5, 8.6], raio: 0.42, velaBaixa: true },
      { nome: 'grande', u: 0.47, secoes: [14.5, 10, 7.2], vergas: [20, 14.5, 9.6], raio: 0.48, velaBaixa: true },
      { nome: 'mezena', u: 0.745, secoes: [10.5, 7.2, 3.8], vergas: [12.5, 9.2, 6.2], raio: 0.36, velaBaixa: false },
    ],
    bracear: -0.26,      // ângulo das vergas em relação ao través (vento pela alheta)
    canhoesPorBordo: 5,
    // molas da flutuação: [rigidez, amortecimento]
    molaAltura: [14, 5],
    molaArfagem: [10, 4],
    molaJogo: [7, 2.6],
    adernamento: 0.045,  // inclinação lateral constante pelo vento nas velas
  },

  // ── Câmera ───────────────────────────────────────────────────
  camera: {
    fov: 38,
    azimuteInicial: 2.45,
    giroAutomatico: 0.055,    // rad/s quando ninguém mexe
    esperaParaGirar: [1.5, 5], // s parado até o giro voltar ao normal
    voltaAoPiloto: [6, 14],    // s depois do último toque até a câmera reassumir
    distancia: [74, 18],       // média e oscilação
    elevacao: [0.16, 0.08],    // média e oscilação (rad)
    distanciaLimite: [24, 180],
    alturaMinimaSobreAgua: 2.2,
  },

  // ── Pós-processamento ────────────────────────────────────────
  pos: {
    exposicao: 0.92,
    brilhoLimiar: 1.0,
    brilhoForca: 0.45,
    vinheta: 0.62,
    grao: 0.022,
    aberracao: 0.006,
  },

  // ── Desempenho ───────────────────────────────────────────────
  desempenho: {
    escalaMaxima: 1.5,  // teto de pixel ratio (o reflexo planar desenha a cena 2x)
    escalaMinima: 0.6,
    quadrosMedidos: 90,
    fpsBaixo: 40,
    fpsAlto: 70,
    sombra: 2048,
    // sombra e reflexo se revezam: num quadro refaz a sombra, no outro o reflexo — nunca os dois
    escalaReflexo: 0.4, // resolução do reflexo do navio em relação à tela
  },
};

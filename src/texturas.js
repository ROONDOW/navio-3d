// Texturas geradas no próprio código (canvas 2D e arrays) — zero arquivo de imagem baixado.
import * as THREE from 'three';

// Gerador pseudoaleatório com semente: a mesma textura sai igual em toda abertura.
export function aleatorio(semente = 1) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tela(l, a) {
  const c = document.createElement('canvas');
  c.width = l; c.height = a;
  return [c, c.getContext('2d')];
}

function texturaDeCanvas(canvas, { cor = true, repetir = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (cor) t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// Veios: traços finos em curva, claros e escuros, por cima de cada tábua.
function veios(ctx, x, y, l, a, rnd, n, corA, corB, horizontal = true) {
  for (let i = 0; i < n; i++) {
    const py = y + rnd() * a, px = x + rnd() * l, comp = (0.2 + rnd() * 0.8) * (horizontal ? l : a);
    ctx.strokeStyle = rnd() < 0.6 ? corA : corB;
    ctx.lineWidth = 0.5 + rnd() * 1.2;
    ctx.globalAlpha = 0.05 + rnd() * 0.12;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(px - comp / 2, py);
      ctx.bezierCurveTo(px - comp / 6, py + (rnd() - 0.5) * 3, px + comp / 6, py + (rnd() - 0.5) * 3, px + comp / 2, py + (rnd() - 0.5) * 2);
    } else {
      ctx.moveTo(px, py - comp / 2);
      ctx.bezierCurveTo(px + (rnd() - 0.5) * 3, py - comp / 6, px + (rnd() - 0.5) * 3, py + comp / 6, px + (rnd() - 0.5) * 2, py + comp / 2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Tábuas de convés/parede: fileiras com tábuas de comprimento variado, juntas escuras e pregos.
export function texturaTabuas({ semente = 3, base = [30, 38, 38], fileiras = 8, tamanho = 1024, pregos = true, desgaste = 0.5 } = {}) {
  const rnd = aleatorio(semente);
  const [c, ctx] = tela(tamanho, tamanho);
  const alt = tamanho / fileiras;
  for (let f = 0; f < fileiras; f++) {
    let x = -rnd() * tamanho * 0.5;
    while (x < tamanho) {
      const comp = tamanho * (0.35 + rnd() * 0.45);
      const luz = base[2] + (rnd() - 0.5) * 10;
      ctx.fillStyle = hsl(base[0] + (rnd() - 0.5) * 8, base[1] + (rnd() - 0.5) * 10, luz);
      ctx.fillRect(x, f * alt, comp, alt);
      veios(ctx, x, f * alt, comp, alt, rnd, 40, hsl(base[0], base[1], luz * 0.55), hsl(base[0] + 5, base[1], Math.min(luz * 1.35, 90)));
      for (let k = 0; k < 3; k++) { // manchas de uso
        const mx = x + rnd() * comp, my = f * alt + rnd() * alt;
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, alt * (0.5 + rnd()));
        g.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,240,220' : '20,12,6'},${0.05 * desgaste + rnd() * 0.06 * desgaste})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x, f * alt, comp, alt);
      }
      ctx.fillStyle = 'rgba(10,6,3,0.75)';
      ctx.fillRect(x + comp - 1.5, f * alt, 2.5, alt); // junta de topo
      if (pregos) {
        ctx.fillStyle = 'rgba(20,14,10,0.8)';
        for (const px of [x + 8, x + comp - 10]) for (const py of [0.28, 0.72]) {
          ctx.beginPath(); ctx.arc(px, f * alt + alt * py, 2.2, 0, 7); ctx.fill();
        }
      }
      x += comp;
    }
    ctx.fillStyle = 'rgba(8,5,2,0.9)';
    ctx.fillRect(0, f * alt - 1.5, tamanho, 3); // junta entre fileiras
  }
  return texturaDeCanvas(c);
}

// Casco: faixas por altura (v = 0 quilha, v = 1 borda): obras vivas escuras, costado de madeira,
// friso dourado, faixa vermelha da bateria de canhões, borda escura. Tábuas e cracas por cima.
export function texturaCasco() {
  const rnd = aleatorio(11);
  const L = 2048, A = 1024;
  const [c, ctx] = tela(L, A);
  const y = (v) => (1 - v) * A;
  const faixa = (v0, v1, cor) => { ctx.fillStyle = cor; ctx.fillRect(0, y(v1), L, y(v0) - y(v1) + 1); };
  faixa(0, 0.46, '#2c251b');
  faixa(0.40, 0.46, '#3b3222');
  faixa(0.46, 0.835, '#1a1410');
  faixa(0.845, 0.975, '#6e1812');
  faixa(0.975, 1, '#1c150f');
  faixa(0.835, 0.845, '#c99b3a');
  faixa(0.97, 0.977, '#b98a2f');
  faixa(0.457, 0.463, '#8a6d3a');
  const nTabuas = 44;
  for (let i = 0; i < nTabuas; i++) {
    const py = y(i / nTabuas), alt = A / nTabuas;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, py - 1, L, 2);
    ctx.fillStyle = 'rgba(255,230,200,0.05)'; ctx.fillRect(0, py + 1, L, 1);
    let x = rnd() * 200;
    while (x < L) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x, py - alt, 2, alt);
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,230,200' : '0,0,0'},${rnd() * 0.07})`;
      const comp = 120 + rnd() * 260;
      ctx.fillRect(x, py - alt, comp, alt);
      x += comp;
    }
  }
  veios(ctx, 0, 0, L, A, rnd, 2600, 'rgba(0,0,0,1)', 'rgba(255,220,180,1)');
  for (let i = 0; i < 160; i++) { // escorridos sob a faixa vermelha
    const px = rnd() * L, py = y(0.84 + rnd() * 0.12), comp = 40 + rnd() * 220;
    const g = ctx.createLinearGradient(0, py, 0, py + comp);
    g.addColorStop(0, rnd() < 0.55 ? 'rgba(210,200,180,0.16)' : 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(px, py, 2 + rnd() * 5, comp);
  }
  for (let i = 0; i < 5000; i++) { // cracas e limo abaixo da linha d'água
    ctx.fillStyle = rnd() < 0.5 ? `rgba(70,80,50,${0.15 + rnd() * 0.25})` : `rgba(150,140,110,${0.1 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * L, y(rnd() * 0.47), 1 + rnd() * 3, 1 + rnd() * 2);
  }
  const t = texturaDeCanvas(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Lona: costuras verticais, duas faixas de rizes com ilhoses, remendos pespontados e manchas.
export function texturaLona(semente = 5, envelhecida = 0) {
  const rnd = aleatorio(semente);
  const n = 512;
  const [c, ctx] = tela(n, n);
  ctx.fillStyle = hsl(38 + envelhecida * 3, 30 - envelhecida * 6, 80 - envelhecida * 6);
  ctx.fillRect(0, 0, n, n);
  const img = ctx.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = (rnd() - 0.5) * 14;
    img.data[i] += r; img.data[i + 1] += r; img.data[i + 2] += r * 0.9;
  }
  ctx.putImageData(img, 0, 0);
  const panos = 9;
  for (let i = 1; i < panos; i++) {
    const x = i / panos * n;
    ctx.fillStyle = 'rgba(90,70,40,0.35)'; ctx.fillRect(x - 1.5, 0, 3, n);
    ctx.fillStyle = 'rgba(255,250,235,0.25)'; ctx.fillRect(x + 2, 0, 1.5, n);
  }
  for (let i = 0; i < panos; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,245,225' : '90,70,40'},${rnd() * 0.07})`;
    ctx.fillRect(i / panos * n, 0, n / panos, n);
  }
  for (const fy of [0.08, 0.3]) {
    ctx.fillStyle = 'rgba(110,85,50,0.3)'; ctx.fillRect(0, fy * n, n, 7);
    ctx.fillStyle = 'rgba(60,45,25,0.6)';
    for (let x = 12; x < n; x += 22) ctx.fillRect(x, fy * n + 2, 2, 12);
  }
  for (let i = 0; i < 4; i++) {
    const l = 30 + rnd() * 50, a = 30 + rnd() * 60, x = rnd() * (n - l), y = n * 0.3 + rnd() * n * 0.6;
    ctx.fillStyle = hsl(35 + rnd() * 10, 25, 68 + rnd() * 10, 0.85); ctx.fillRect(x, y, l, a);
    ctx.strokeStyle = 'rgba(80,60,35,0.5)'; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 2, y + 2, l - 4, a - 4); ctx.setLineDash([]);
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * n, y = rnd() * n, r = 20 + rnd() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(95,70,40,${0.05 + rnd() * 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
  }
  const pe = ctx.createLinearGradient(0, n * 0.75, 0, n);
  pe.addColorStop(0, 'rgba(70,50,30,0)'); pe.addColorStop(1, 'rgba(70,50,30,0.35)');
  ctx.fillStyle = pe; ctx.fillRect(0, 0, n, n);
  ctx.strokeStyle = 'rgba(80,60,35,0.8)'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, n, n); // tralha
  return texturaDeCanvas(c, { repetir: false });
}

// Bandeira pirata: caveira e tíbias cruzadas, desenho nosso, com a ponta rasgada pelo vento.
export function texturaBandeira() {
  const [c, ctx] = tela(512, 320);
  const rnd = aleatorio(9);
  ctx.fillStyle = '#0d0c0c'; ctx.fillRect(0, 0, 512, 320);
  for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.03})`; ctx.fillRect(rnd() * 512, rnd() * 320, 2, 2); }
  ctx.save(); ctx.translate(256, 166); ctx.fillStyle = '#e9e2cf';
  for (const ang of [0.62, -0.62]) { // tíbias
    ctx.save(); ctx.rotate(ang); ctx.fillRect(-120, -9, 240, 18);
    for (const s of [-1, 1]) for (const dy of [-10, 10]) { ctx.beginPath(); ctx.arc(s * 122, dy, 14, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(0, -30, 62, 58, 0, 0, 7); ctx.fill();          // crânio
  ctx.beginPath(); ctx.roundRect(-36, 0, 72, 44, 12); ctx.fill();               // mandíbula
  ctx.fillStyle = '#0d0c0c';
  ctx.beginPath(); ctx.ellipse(-24, -26, 17, 19, 0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(24, -26, 17, 19, -0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-9, 10); ctx.lineTo(9, 10); ctx.closePath(); ctx.fill();
  for (let d = -3; d <= 3; d++) ctx.fillRect(d * 9 - 1.5, 26, 3, 18);         // dentes
  ctx.restore();
  ctx.globalCompositeOperation = 'destination-out'; // ponta esfiapada
  for (let y = 0; y < 320; y += 6) { const r = 4 + rnd() * 26; ctx.fillRect(512 - r, y, r, 6 + rnd() * 4); }
  ctx.globalCompositeOperation = 'source-over';
  return texturaDeCanvas(c, { repetir: false });
}

// Mapa normal do mar: campo de 48 ondas senoidais com frequências inteiras (encaixa sem costura).
export function texturaNormalMar() {
  const rnd = aleatorio(77), N = 256, ondas = [];
  for (let i = 0; i < 48; i++) {
    let kx, ky;
    do {
      const ang = (rnd() - 0.5) * Math.PI * 1.4 + 0.4, r = 3 + Math.pow(rnd(), 1.6) * 38;
      kx = Math.round(Math.cos(ang) * r); ky = Math.round(Math.sin(ang) * r);
    } while (kx === 0 && ky === 0);
    ondas.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.25), rnd() * 6.283]);
  }
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (const [kx, ky, a, f] of ondas) { const g = 6.2831853 * (kx * x + ky * y) / N + f; s += a * (Math.sin(g) + 0.35 * Math.sin(2 * g + 1.3)); }
    h[y * N + x] = s;
  }
  const dados = new Uint8Array(N * N * 4), forca = 3.2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h[y * N + (x - 1 + N) % N] - h[y * N + (x + 1) % N]) * forca;
    const dy = (h[((y - 1 + N) % N) * N + x] - h[((y + 1) % N) * N + x]) * forca;
    const m = Math.hypot(dx, dy, 1), p = (y * N + x) * 4;
    dados[p] = (dx / m * 0.5 + 0.5) * 255; dados[p + 1] = (dy / m * 0.5 + 0.5) * 255; dados[p + 2] = (1 / m * 0.5 + 0.5) * 255; dados[p + 3] = 255;
  }
  const t = new THREE.DataTexture(dados, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// Espuma: Voronoi em 3 escalas. R = rede de células (filamentos), G = manchas.
export function texturaEspuma() {
  const rnd = aleatorio(99), N = 256, escalas = [[8, 0.55], [16, 0.3], [32, 0.15]];
  const pontos = escalas.map(([n]) => Array.from({ length: n * n }, () => [rnd(), rnd()]));
  const dados = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let rede = 0, mancha = 0;
    escalas.forEach(([n, peso], e) => {
      const gx = x / N * n, gy = y / N * n, cx = Math.floor(gx), cy = Math.floor(gy);
      let d1 = 9, d2 = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const px = cx + i, py = cy + j, p = pontos[e][((py % n + n) % n) * n + ((px % n + n) % n)];
        const ddx = px + p[0] - gx, ddy = py + p[1] - gy, d = ddx * ddx + ddy * ddy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      rede += peso * (1 - Math.min((Math.sqrt(d2) - Math.sqrt(d1)) * 3.2, 1));
      mancha += peso * (1 - Math.min(Math.sqrt(d1) * 1.4, 1));
    });
    const p = (y * N + x) * 4;
    dados[p] = Math.min(255, rede * 300); dados[p + 1] = Math.min(255, mancha * 255); dados[p + 3] = 255;
  }
  const t = new THREE.DataTexture(dados, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// Grade de escotilha: ripas cruzadas sobre fundo escuro (o porão).
export function texturaGrade() {
  const [c, ctx] = tela(256, 256);
  ctx.fillStyle = '#0c0805'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#7a5a3c';
  for (let i = 0; i < 8; i++) { ctx.fillRect(i * 32 + 4, 0, 10, 256); ctx.fillRect(0, i * 32 + 4, 256, 10); }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 32 + 12, 256, 2);
  return texturaDeCanvas(c);
}

// Ponto suave para partículas.
export function texturaPonto() {
  const [c, ctx] = tela(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return texturaDeCanvas(c, { cor: false, repetir: false });
}

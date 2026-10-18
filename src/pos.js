// Pós-processamento próprio: a cena é desenhada num alvo HDR (meia precisão, MSAA 4x); depois
// limiar de brilho → borrão gaussiano em N níveis → composição com aberração cromática, clarão do
// sol, exposição, ACES, gradação (sombra fria, luz quente), curva em S, vinheta e grão.
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class Pos {
  constructor(renderer, config, niveis = 5) {
    this.r = renderer; this.c = config.pos; this.niveis = niveis;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.cena = new THREE.Scene(); this.cena.add(this.quad);
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.principal = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.A = []; this.B = [];
    for (let i = 0; i < niveis; i++) { this.A.push(new THREE.WebGLRenderTarget(4, 4, opt)); this.B.push(new THREE.WebGLRenderTarget(4, 4, opt)); }
    this.limiar = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uLimiar: { value: this.c.brilhoLimiar } }, vertexShader: VERT,
      fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform float uLimiar; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb;
          if (!(c.r >= 0.0 && c.r < 1e4 && c.g >= 0.0 && c.g < 1e4 && c.b >= 0.0 && c.b < 1e4)) c = vec3(0.0); // NaN/inf viram preto
          c = min(c, vec3(40.0)); float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(uLimiar * 0.6, uLimiar * 1.6, l), 1.0); }`,
    });
    // gaussiano de 9 amostras feito com 5 leituras bilineares (pesos e offsets de Rákos)
    this.borrao = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VERT,
      fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
          c += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.3162162; c += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.3162162;
          c += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.0702703; c += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.0702703;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const u = { tCena: { value: null }, uTempo: { value: 0 }, uExpo: { value: this.c.exposicao }, uRes: { value: new THREE.Vector2() },
      uSolTela: { value: new THREE.Vector3(0.5, 0.5, 0) }, uForca: { value: this.c.brilhoForca }, uVinheta: { value: this.c.vinheta },
      uGrao: { value: this.c.grao }, uAberr: { value: this.c.aberracao } };
    for (let i = 0; i < niveis; i++) u['tB' + i] = { value: null };
    const pesos = [0.30, 0.28, 0.24, 0.22, 0.24];
    const somaBrilho = Array.from({ length: niveis }, (_, i) => `texture2D(tB${i}, uv).rgb * ${pesos[i].toFixed(2)}`).join(' + ');
    this.comp = new THREE.ShaderMaterial({
      uniforms: u, vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCena; ${Array.from({ length: niveis }, (_, i) => `uniform sampler2D tB${i};`).join(' ')}
        uniform float uTempo, uExpo, uForca, uVinheta, uGrao, uAberr; uniform vec2 uRes; uniform vec3 uSolTela; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv, dc = uv - 0.5;
          float ca = dot(dc, dc) * uAberr;
          vec3 cor = vec3(texture2D(tCena, uv - dc * ca).r, texture2D(tCena, uv).g, texture2D(tCena, uv + dc * ca).b);
          vec3 brilho = ${somaBrilho};
          if (!(cor.r >= 0.0 && cor.r < 1e4 && cor.g >= 0.0 && cor.g < 1e4 && cor.b >= 0.0 && cor.b < 1e4)) cor = vec3(0.0);
          cor += brilho * uForca;
          if (uSolTela.z > 0.0) {   // véu do sol: dois halos em volta da posição do sol na tela
            vec2 sd = (uv - uSolTela.xy) * vec2(uRes.x / uRes.y, 1.0);
            cor += vec3(1.0, 0.55, 0.25) * (exp(-length(sd) * 6.0) * 0.22 + exp(-length(sd) * 2.0) * 0.06) * uSolTela.z;
          }
          cor = aces(cor * uExpo);
          float l = dot(cor, vec3(0.2126, 0.7152, 0.0722));
          cor = mix(cor, cor * vec3(0.86, 0.95, 1.12) + vec3(0.0, 0.006, 0.02), (1.0 - smoothstep(0.0, 0.45, l)) * 0.6); // sombra fria
          cor = mix(cor, cor * vec3(1.06, 0.99, 0.9), smoothstep(0.45, 1.0, l) * 0.5);                                  // luz quente
          cor = clamp(mix(vec3(l), cor, 1.08), 0.0, 1.0);
          cor = cor * cor * (3.0 - 2.0 * cor) * 0.25 + cor * 0.75;                                                       // curva em S
          cor *= mix(uVinheta, 1.0, smoothstep(1.05, 0.25, length(dc * vec2(1.0, 0.85)) * 1.25));
          cor = pow(cor, vec3(1.0 / 2.2));
          cor += (hash(uv * uRes + fract(uTempo) * 91.0) - 0.5) * uGrao;   // grão também esconde faixas de gradiente
          gl_FragColor = vec4(cor, 1.0);
        }`,
    });
  }
  tamanho(l, a) {
    this.principal.setSize(l, a);
    let w = Math.max(1, l >> 1), h = Math.max(1, a >> 1);
    for (let i = 0; i < this.niveis; i++) { this.A[i].setSize(w, h); this.B[i].setSize(w, h); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
    this.comp.uniforms.uRes.value.set(l, a);
  }
  passo(mat, alvo) { this.quad.material = mat; this.r.setRenderTarget(alvo); this.r.render(this.cena, this.cam); }
  render(tempo) {
    this.limiar.uniforms.tSrc.value = this.principal.texture; this.passo(this.limiar, this.B[0]);
    let fonte = this.B[0];
    for (let i = 0; i < this.niveis; i++) {
      const w = this.A[i].width, h = this.A[i].height;
      this.borrao.uniforms.tSrc.value = fonte.texture; this.borrao.uniforms.uDir.value.set(1 / w, 0); this.passo(this.borrao, this.A[i]);
      this.borrao.uniforms.tSrc.value = this.A[i].texture; this.borrao.uniforms.uDir.value.set(0, 1 / h); this.passo(this.borrao, this.B[i]);
      fonte = this.B[i];
    }
    const u = this.comp.uniforms;
    u.tCena.value = this.principal.texture; u.uTempo.value = tempo;
    for (let i = 0; i < this.niveis; i++) u['tB' + i].value = this.B[i].texture;
    this.passo(this.comp, null);
  }
}

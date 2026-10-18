// Trechos de GLSL compartilhados: ruído, atmosfera e nuvens.
// A atmosfera é a mesma função no céu, no reflexo do mar e na névoa — por isso o horizonte casa.

export const RUIDO = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float ruido(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p, int oitavas){
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++){ if (i >= oitavas) break; v += a * ruido(p); p = m * p; a *= 0.5; }
  return v;
}
`;

// Céu de pôr do sol em 4 faixas (horizonte, baixo, meio, zênite), cada uma puxada para o laranja
// do lado do sol e para o roxo do lado oposto, mais 3 lóbulos de brilho em volta do sol.
export const ATMOSFERA = /* glsl */ `
uniform vec3 uSolDir;
vec3 atmosfera(vec3 d){
  float y = max(d.y, 0.0);
  vec3 dd = normalize(vec3(d.x, y, d.z) + vec3(0.0, 1e-4, 0.0));
  float aoSol = max(dot(dd, uSolDir), 0.0);
  vec2 hd = d.xz / max(length(d.xz), 1e-4);
  float lado = clamp(dot(hd, normalize(uSolDir.xz)) * 0.5 + 0.5, 0.0, 1.0); // 1 = lado do sol
  vec3 horizonte = mix(vec3(0.34, 0.22, 0.34), vec3(1.55, 0.60, 0.22), pow(lado, 1.6));
  vec3 baixo     = mix(vec3(0.24, 0.17, 0.34), vec3(1.05, 0.36, 0.26), pow(lado, 2.2));
  vec3 meio      = mix(vec3(0.12, 0.10, 0.26), vec3(0.42, 0.18, 0.30), pow(lado, 3.0));
  vec3 zenite    = vec3(0.035, 0.05, 0.14);
  vec3 c = mix(horizonte, baixo, smoothstep(0.0, 0.07, y));
  c = mix(c, meio, smoothstep(0.05, 0.30, y));
  c = mix(c, zenite, smoothstep(0.22, 0.85, y));
  c += vec3(1.0, 0.42, 0.14) * pow(aoSol, 5.0) * 0.55;   // halo largo
  c += vec3(1.0, 0.55, 0.25) * pow(aoSol, 48.0) * 1.6;   // halo médio
  c += vec3(1.0, 0.70, 0.40) * pow(aoSol, 700.0) * 6.0;  // coroa
  return c;
}
`;

// Nuvens projetadas num teto plano: fbm com distorção de domínio (q), borda iluminada pelo sol
// comparando o ruído com ele mesmo deslocado na direção do sol, e uma camada alta de cirros.
export const NUVENS = /* glsl */ `
uniform float uTempo;
vec4 nuvens(vec3 d){
  if (d.y < 0.0) return vec4(0.0);
  vec2 uv = d.xz / (d.y + 0.09) * vec2(0.55, 0.9) + vec2(uTempo * 0.006, uTempo * 0.002);
  vec2 q = vec2(fbm(uv * 0.5, 3), fbm(uv * 0.5 + 5.2, 3));
  float n = fbm(uv * 0.8 + q * 1.6, 5);
  float cobertura = smoothstep(0.50, 0.70, n);
  float n2 = fbm(uv * 0.8 + q * 1.6 + normalize(uSolDir.xz) * 0.12, 5);
  float luz = clamp((n - n2) * 7.0 + 0.45, 0.0, 1.0);
  float aoSol = max(dot(d, uSolDir), 0.0);
  vec2 hd = d.xz / max(length(d.xz), 1e-4);
  float lado = clamp(dot(hd, normalize(uSolDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 escuro = mix(vec3(0.10, 0.07, 0.16), vec3(0.30, 0.12, 0.18), lado);
  vec3 claro = mix(vec3(0.95, 0.42, 0.40), vec3(1.9, 0.85, 0.40), pow(lado, 3.0));
  claro = mix(claro, vec3(0.55, 0.30, 0.42), smoothstep(0.1, 0.6, d.y) * 0.6);
  vec3 cor = mix(escuro, claro, luz * (0.6 + 0.4 * lado));
  float borda = cobertura * (1.0 - cobertura) * 4.0;
  cor += vec3(2.2, 1.1, 0.5) * borda * pow(aoSol, 10.0) * 1.5;   // contorno dourado contra o sol
  vec2 cu = uv * vec2(0.25, 2.6) + vec2(uTempo * 0.004, 0.0);
  float cirro = smoothstep(0.55, 0.85, fbm(cu + 11.0, 5)) * smoothstep(0.03, 0.2, d.y);
  vec3 corCirro = mix(vec3(0.7, 0.35, 0.45), vec3(1.6, 0.8, 0.45), pow(lado, 2.0));
  float some = smoothstep(0.0, 0.10, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y) * 0.7);
  float a = cobertura * some * 0.97;
  float total = clamp(a + cirro * 0.45 * (1.0 - a), 0.0, 1.0);
  cor = mix(corCirro, cor, a / max(total, 1e-4));
  return vec4(cor, total);
}
`;

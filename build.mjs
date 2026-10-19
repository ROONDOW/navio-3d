// Empacota src/ (com o Three.js) num único index.html que abre direto por file://.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const minify = !process.argv.includes('--legivel');
const r = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', write: false, minify,
  target: 'es2020', legalComments: 'eof', logLevel: 'warning', // mantém o aviso de licença MIT do Three.js no index.html
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/pagina.html', 'utf8').replace('/*__BUNDLE__*/', () => js);
writeFileSync('index.html', html);
const nosso = ['config', 'glsl', 'ceu', 'mar', 'navio', 'velas', 'vida', 'texturas', 'pos', 'main']
  .reduce((s, f) => s + statSync(`src/${f}.js`).size, 0);
console.log(`index.html: ${(statSync('index.html').size / 1024).toFixed(0)} KB (código nosso em src/: ${(nosso / 1024).toFixed(0)} KB)`);

// régua do PRD: código nosso MINIFICADO, sem o Three (o original do Opus tem 73.866 bytes nessa conta)
const so = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', write: false, minify: true,
  external: ['three', 'three/*'], target: 'es2020', logLevel: 'error' });
writeFileSync('testes/peso.json', JSON.stringify({ indexBytes: statSync('index.html').size, nossoMinBytes: so.outputFiles[0].contents.length, fonteBytes: nosso }));
console.log(`código nosso minificado (sem o Three): ${(so.outputFiles[0].contents.length / 1024).toFixed(1)} KiB`);

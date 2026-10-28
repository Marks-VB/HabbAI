// Empacota o servidor (TypeScript) em um único arquivo ESM em dist/server e grava dist/build.json (commit e "cópia
// modificada", ver scripts/build-info.mjs).
import { rmSync } from 'node:fs';
import { build } from 'esbuild';
import { writeBuildInfo } from './build-info.mjs';

// Sourcemap do servidor: ligado por padrão, porque empilha o erro do Node direto no TypeScript em `npm start` e nos
// testes. `HABBLAUD_SOURCEMAP=0` desliga; a imagem Docker apaga os .map no estágio de runtime (ver Dockerfile).
const sourcemap = process.env.HABBLAUD_SOURCEMAP !== '0';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  // O Habblaud pede Node >= 22.12 (package.json, "engines") e a imagem Docker usa node:24; o alvo mais alto que o
  // esbuild conhece é `node22`, que já cobre a sintaxe usada pelo servidor — o 24 executa o mesmo arquivo.
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap,
  logLevel: 'info',
});

// Sem sourcemap, o .map de um build anterior ficaria em dist/ apontando para um código que não existe mais.
if (!sourcemap) rmSync('dist/server/index.js.map', { force: true });

const info = writeBuildInfo('dist/build.json');
console.log(`  dist/build.json  ${info.commit === 'unknown' ? 'unknown' : info.commit.slice(0, 12)}${info.dirty ? ' (dirty)' : ''}`);

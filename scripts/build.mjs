import { spawnSync } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const shared = { bundle: true, target: 'es2020', logLevel: 'warning' };
const core = { index: 'src/index.ts', auto: 'src/auto.ts' };
const react = { react: 'src/react.ts' };
const client = { js: '"use client";' };

await rm('dist', { recursive: true, force: true });

await Promise.all([
  build({ ...shared, entryPoints: core, format: 'esm', outdir: 'dist' }),
  build({ ...shared, entryPoints: core, format: 'cjs', outdir: 'dist', outExtension: { '.js': '.cjs' } }),
  build({ ...shared, entryPoints: react, format: 'esm', outdir: 'dist', external: ['react'], banner: client }),
  build({ ...shared, entryPoints: react, format: 'cjs', outdir: 'dist', outExtension: { '.js': '.cjs' }, external: ['react'], banner: client }),
  build({ ...shared, entryPoints: ['src/global.ts'], format: 'iife', minify: true, outfile: 'dist/snofetti.global.js' }),
]);

const types = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
if (types.status !== 0) process.exit(types.status ?? 1);

const file = 'dist/snofetti.global.js';
const raw = (await stat(file)).size, zipped = gzipSync(readFileSync(file)).length;
console.log(`${file}: ${(raw / 1024).toFixed(1)} kB, ${(zipped / 1024).toFixed(1)} kB gzipped`);

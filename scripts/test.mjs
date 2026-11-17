import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

const out = '.tmp/test';
const entries = readdirSync('test').filter((name) => name.endsWith('.test.ts')).map((name) => `test/${name}`);

await rm(out, { recursive: true, force: true });
await build({ entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: out, outExtension: { '.js': '.mjs' }, logLevel: 'warning' });

const files = readdirSync(out).filter((name) => name.endsWith('.mjs')).map((name) => `${out}/${name}`);
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(run.status ?? 1);

// 无头运行游戏规则代码：用 esbuild 把 src/ 里的 ES 模块打成一个临时 .mjs，
// 并把 vendor/matter.min.js (与游戏同一份) 挂到 globalThis.window.Matter。
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..', '..');

export async function loadHeadless(entryName) {
  const require = createRequire(import.meta.url);
  globalThis.window = globalThis.window || {};
  globalThis.window.Matter = require(path.join(root, 'vendor/matter.min.js'));
  const out = path.join(os.tmpdir(), `animescrew-${process.pid}-${entryName}.mjs`);
  await build({
    entryPoints: [path.join(here, `${entryName}.js`)],
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
  });
  const mod = await import(pathToFileURL(out).href);
  await fs.rm(out, { force: true });
  return mod;
}

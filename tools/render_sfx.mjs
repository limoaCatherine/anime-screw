// 抖音小游戏没有 WebAudio 实时合成，这里把网页版的合成音效离线渲染成小 mp3：
//   Chromium (playwright) + OfflineAudioContext + 游戏同一份 AudioSystem.synth() 代码 (音高抖动固定为 1，随机数固定种子)
//   → 44.1kHz WAV → ffmpeg 单声道 22.05kHz mp3 → assets/sfx/<key>.mp3
// 用法：node tools/render_sfx.mjs
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets/sfx');
const SR = 44100;

function wav(samples, sr) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-'));
  const bundle = path.join(tmp, 'sfx.js');
  await build({ entryPoints: [path.join(root, 'tools/lib/entry-sfx.js')], bundle: true, format: 'iife', outfile: bundle, logLevel: 'error' });
  await fs.mkdir(outDir, { recursive: true });
  for (const f of await fs.readdir(outDir)) if (f.endsWith('.mp3')) await fs.rm(path.join(outDir, f));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: bundle });
  const list = await page.evaluate(() => window.__sfxList());
  let total = 0;
  const report = [];
  for (const v of list) {
    const r = await page.evaluate(([k, sr]) => window.__renderSfx(k, sr), [v.key, SR]);
    const w = path.join(tmp, `${v.key}.wav`);
    await fs.writeFile(w, wav(r.data, SR));
    const mp3 = path.join(outDir, `${v.key}.mp3`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', w, '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', '48k', mp3]);
    const size = (await fs.stat(mp3)).size;
    total += size;
    report.push(`${v.key.padEnd(14)} ${v.dur.toFixed(2)}s peak ${r.peak.toFixed(2)} ${(size / 1024).toFixed(1)} KB`);
    if (r.peak < 0.0005) throw new Error(`音效 ${v.key} 渲染出来是静音`);
  }
  await browser.close();
  await fs.rm(tmp, { recursive: true, force: true });
  console.log(report.join('\n'));
  console.log(`共 ${list.length} 个音效，${(total / 1024).toFixed(1)} KB -> assets/sfx/`);
}

main().catch((e) => { console.error(e); process.exit(1); });

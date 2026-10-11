// LoopTrack (抖音版 BGM 无缝循环) 的确定性仿真测试：假时钟 + 模拟 InnerAudioContext
// (起播延迟 20~200ms、currentTime 每 250ms 才刷新一次、volume 可写 / 只读两种端)，
// 连放多圈，逐 5ms 检查：任何时刻都有一路在出声 (没有空白)，接力点处音乐位置的跳变 < 150ms。
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fakePlatform = {
  name: 'fake-platform',
  setup(b) {
    b.onResolve({ filter: /platform\/index\.js$/ }, () => ({ path: 'fake', namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'export const platform = { createAudio: (...a) => globalThis.__FAKE_PLATFORM__.createAudio(...a), now: () => globalThis.__FAKE_PLATFORM__.now() };', loader: 'js' }));
  },
};
const res = await build({ entryPoints: [path.join(root, 'src/systems/LoopTrack.js')], bundle: true, format: 'esm', write: false, plugins: [fakePlatform], logLevel: 'error' });
const code = res.outputFiles[0].text;

function makeSim({ latency, readOnlyVolume, coarse = 0.25, seed = 1 }) {
  let now = 0;   // 秒
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const voices = [];
  class FakeAudio {
    constructor() { this.src = ''; this.loop = false; this._vol = 1; this._playing = false; this.pos = 0; this.startAt = Infinity; this.ls = {}; this.duration = 0; voices.push(this); }
    get volume() { return this._vol; }
    set volume(v) { if (!readOnlyVolume) this._vol = v; }
    get paused() { return !this._playing; }
    truePos() { return this._playing && now >= this.startAt ? this.pos + (now - this.startAt) : this.pos; }
    get currentTime() { const p = this.truePos(); return Math.floor(p / coarse) * coarse; }
    set currentTime(v) { this.pos = v; if (this._playing && now >= this.startAt) this.startAt = now; }
    sounding() { return this._playing && now >= this.startAt && this.truePos() < this.duration; }
    play() { if (!this._playing) { this._playing = true; this.startAt = now + latency[0] + rnd() * (latency[1] - latency[0]); } return Promise.resolve(); }
    pause() { if (this._playing) { this.pos = this.truePos(); this._playing = false; } }
    stop() { this._playing = false; this.pos = 0; }
    addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }
    step() { if (this._playing && now >= this.startAt && this.truePos() >= this.duration) { this.pos = this.duration; this._playing = false; (this.ls.ended || []).forEach((f) => f()); } }
    destroy() { this._playing = false; }
  }
  globalThis.__FAKE_PLATFORM__ = { createAudio: () => new FakeAudio(), now: () => now * 1000 };
  return { FakeAudio, voices, setNow: (t) => { now = t; }, getNow: () => now };
}

import { writeFileSync } from 'node:fs';
import os from 'node:os';
const tmp = path.join(os.tmpdir(), `looptrack_${process.pid}.mjs`); writeFileSync(tmp, code);
const { LoopTrack } = await import(`file://${tmp}`);
const info = { pre: 0.5, len: 5.0, post: 1.0 };
const scenarios = [
  { name: '常规端 (起播 20~80ms，volume 可写)', latency: [0.02, 0.08], readOnlyVolume: false },
  { name: '慢端 (起播 80~200ms)', latency: [0.08, 0.2], readOnlyVolume: false },
  { name: 'volume 只读的端 (靠停旧的一路切换)', latency: [0.02, 0.12], readOnlyVolume: true },
  { name: 'currentTime 刷新很粗 (500ms)', latency: [0.03, 0.1], readOnlyVolume: false, coarse: 0.5 },
];
let fails = 0;
for (const sc of scenarios) {
  const sim = makeSim(sc);
  const tr = new LoopTrack('sub_bgm/bgm/bgm_test.mp3', info);
  for (const v of sim.voices) v.duration = info.pre + info.len + info.post;
  tr.volume = 0.8;
  tr.play();
  const T = 6 * info.len; const dt = 0.005; let nextFrame = 0;
  let gapMs = 0; let maxGap = 0; let maxJump = 0; let last = null; let started = false; let silentRun = 0;
  for (let t = 0; t < T; t += dt) {
    sim.setNow(t);
    for (const v of sim.voices) v.step();
    if (t >= nextFrame) { tr.tick(); nextFrame += 1 / 60; }
    const snd = sim.voices.filter((v) => v.sounding());
    const gain = snd.reduce((a, v) => a + (sc.readOnlyVolume ? 1 : v.volume), 0);
    if (snd.length) started = true;
    if (started) {
      if (gain < 0.8 * 0.5) { silentRun += dt; maxGap = Math.max(maxGap, silentRun); gapMs += dt * 1000; } else silentRun = 0;
      const dom = snd.sort((a, b) => b.volume - a.volume)[0];
      if (dom) {
        const c = (((dom.truePos() - info.pre) % info.len) + info.len) % info.len;
        if (last != null) { let d = c - last - dt; d = ((d + info.len / 2) % info.len + info.len) % info.len - info.len / 2; maxJump = Math.max(maxJump, Math.abs(d)); }
        last = c;
      }
    }
  }
  const ok = maxGap < 0.02 && maxJump < 0.15 && tr.loops >= 4;
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${sc.name}: 放了 ${tr.loops} 圈接力，最长无声 ${(maxGap * 1000).toFixed(0)}ms，接力处音乐位置最大跳变 ${(maxJump * 1000).toFixed(0)}ms，失败接力 ${tr.failedHandoffs || 0}`);
}
console.log(fails ? `LoopTrack 仿真：${fails} 项失败` : 'LoopTrack 仿真：全部通过 (循环点没有空白)');
process.exit(fails ? 1 : 0);

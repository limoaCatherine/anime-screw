// tools/render_sfx.mjs 在 Chromium 里用的入口：用游戏同一份 AudioSystem 合成代码离线渲染每个音效变体。
import { AudioSystem, sfxVariants } from '../../src/systems/AudioSystem.js';
import { AudioConfig } from '../../src/config/AudioConfig.js';

function mulberry32(a) {
  return function rnd() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

window.__sfxList = () => sfxVariants().map((v) => ({ key: v.key, dur: v.dur }));

window.__renderSfx = async (key, sampleRate = 44100) => {
  const v = sfxVariants().find((x) => x.key === key);
  const seed = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const realRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    const ctx = new OfflineAudioContext(1, Math.ceil(v.dur * sampleRate), sampleRate);
    const a = new AudioSystem({ on() {}, emit() {} }, { get: (k, d) => d, set() {} });
    a.attach(ctx, ctx.destination);
    a.out.gain.value = AudioConfig.sfxVolume * 4;     // 与实时合成时 master=1 的音量一致
    a.synth(v.name, v.o, 1);
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    const fade = Math.min(d.length, Math.floor(sampleRate * 0.02));   // 结尾 20ms 淡出，防止截断爆音
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
    let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    return { data: Array.from(d), peak };
  } finally {
    Math.random = realRandom;
  }
};

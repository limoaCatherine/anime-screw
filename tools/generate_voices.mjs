// 用 VOICEVOX 引擎合成角色语音 -> assets/audio/voice/<id>.mp3  (v1.1：按情绪合成，更像真人)
// 台词 / 情绪 / 重音词：src/config/VoiceConfig.js (单一数据源)。
// 每句的处理：
//   1. 按情绪 emo 选风格 (角色有多个风格时，如猫使ビィ：おちつき / 人見知り / つよつよ)
//   2. 语速 1.12~1.25 倍、抑扬 intonationScale 1.15~1.5、句首/句尾静音缩短、句中停顿上限 0.18 s
//   3. emph 里的词 (片假名) 所在的语调短语整体抬高音高、元音略拉长 = 重音
//   4. tools/voice_post.py：裁静音、(可选) 句前一口吸气、小房间混响
//   5. ffmpeg 两遍 loudnorm 统一到 -20 LUFS / -1.5 dBTP，转 mp3
// 前提：VOICEVOX 引擎已启动 (默认 http://127.0.0.1:50021)，ffmpeg、python3 + numpy 可用。
//   node tools/generate_voices.mjs [--engine http://127.0.0.1:50021] [--only riri_hello,xm_win]
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadHeadless, root } from './lib/headless.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const ENGINE = opt('--engine', 'http://127.0.0.1:50021');
const ONLY = opt('--only', '') ? opt('--only').split(',') : null;

// 情绪 → 语速 / 音高 / 抑扬 / 句首句尾静音
export const EMOTION = {
  happy:   { speed: 1.20, pitch: 0.03, inton: 1.40, pre: 0.03, post: 0.06 },
  excited: { speed: 1.24, pitch: 0.05, inton: 1.50, pre: 0.02, post: 0.05 },
  tease:   { speed: 1.22, pitch: 0.03, inton: 1.45, pre: 0.03, post: 0.06 },
  calm:    { speed: 1.15, pitch: 0.00, inton: 1.20, pre: 0.04, post: 0.08 },
  gentle:  { speed: 1.15, pitch: 0.01, inton: 1.28, pre: 0.04, post: 0.08 },
  urgent:  { speed: 1.25, pitch: 0.04, inton: 1.40, pre: 0.02, post: 0.05 },
  sad:     { speed: 1.12, pitch: -0.02, inton: 1.15, pre: 0.05, post: 0.10 },
  shy:     { speed: 1.16, pitch: 0.02, inton: 1.25, pre: 0.05, post: 0.08 },
};
const CHAR_SPEED = { aheng: -0.02, suzhi: 0, xm: 0.01, riri: 0 };   // 角色性格：阿蘅稍慢、小满稍快

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${res.status} ${url}: ${await res.text()}`);
  return res;
}

const kata = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

async function synth(line, ch) {
  const e = { ...EMOTION[line.emo || 'calm'], ...(line.tune || {}) };
  const styleId = (ch.voice.styles && ch.voice.styles[line.emo]) || ch.voice.styleId;
  const q = await (await post(`${ENGINE}/audio_query?${new URLSearchParams({ text: line.tts, speaker: styleId })}`)).json();
  q.speedScale = e.speed + (CHAR_SPEED[line.who] || 0);
  q.pitchScale = e.pitch;
  q.intonationScale = e.inton;
  q.prePhonemeLength = e.pre;
  q.postPhonemeLength = e.post;
  q.outputSamplingRate = 44100; q.outputStereo = false;
  const emph = (line.emph || []).map(kata);
  let hits = 0;
  for (const ap of q.accent_phrases) {
    if (ap.pause_mora) ap.pause_mora.vowel_length = Math.min(ap.pause_mora.vowel_length, 0.18);
    const txt = ap.moras.map((m) => m.text).join('');
    if (emph.some((w) => txt.includes(w) || w.includes(txt))) {
      hits++;
      for (const m of ap.moras) {
        if (m.pitch > 0) m.pitch += 0.13;
        if (m.vowel_length) m.vowel_length *= 1.08;
      }
    }
  }
  // 感叹句：最后一个短语再往上提一点，句尾不往下掉
  if (/[！!]$/.test(line.tts) && q.accent_phrases.length) {
    const last = q.accent_phrases[q.accent_phrases.length - 1];
    for (const m of last.moras) if (m.pitch > 0) m.pitch += 0.06;
  }
  const wav = Buffer.from(await (await post(`${ENGINE}/synthesis?speaker=${styleId}`, q)).arrayBuffer());
  return { wav, styleId, hits, speed: q.speedScale };
}

function measureI(file) {
  const err = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -i "${file}" -af ebur128=peak=true -f null - 2>&1`], { encoding: 'utf8' });
  const m = err.match(/Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/);
  return m ? parseFloat(m[1]) : -20;
}

/** 响度：测积分响度 → 增益 + 限幅 (-1.5 dBFS)，再测一遍微调，稳定落在 -20 LUFS ±0.5 */
function loudnorm(input, out) {
  let gain = -20 - measureI(input);
  for (let pass = 0; pass < 3; pass++) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', `highpass=f=70,volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:attack=2:release=40:level=false`, '-ar', '44100', '-ac', '1', '-b:a', '112k', out]);
    const got = measureI(out);
    if (Math.abs(got + 20) <= 0.4) break;
    gain += -20 - got;
  }
}

const { VOICE_LINES, CHARACTERS } = await loadHeadless('entry-voice');
const ver = await fetch(`${ENGINE}/version`).then((r) => r.text()).catch(() => null);
if (!ver) { console.error(`连不上 VOICEVOX 引擎 (${ENGINE})`); process.exit(1); }
console.log(`VOICEVOX engine ${ver}`);
const keep = new Set(VOICE_LINES.map((l) => path.basename(l.file)));
for (const line of VOICE_LINES) {
  if (ONLY && !ONLY.includes(line.id)) continue;
  const ch = CHARACTERS[line.who];
  const out = path.join(root, line.file);
  const { wav, styleId, hits, speed } = await synth(line, ch);
  const tmp = path.join(os.tmpdir(), `vv_${line.id}.wav`);
  const tmp2 = path.join(os.tmpdir(), `vv_${line.id}_post.wav`);
  await fs.writeFile(tmp, wav);
  const seed = [...line.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  execFileSync('python3', [path.join(root, 'tools/voice_post.py'), tmp, tmp2, ...(line.breath ? ['--breath'] : []), '--seed', String(seed)]);
  loudnorm(tmp2, out);
  await fs.rm(tmp, { force: true }); await fs.rm(tmp2, { force: true });
  console.log(`ok  ${line.id.padEnd(14)} ${ch.voice.speaker}#${styleId} ${line.emo.padEnd(7)} x${speed.toFixed(2)} 重音${hits} ${line.breath ? '吸气 ' : ''}${line.text}`);
}
// 清掉不再使用的旧语音文件
if (!ONLY) {
  for (const f of await fs.readdir(path.join(root, 'assets/audio/voice'))) {
    if (f.endsWith('.mp3') && !keep.has(f)) { await fs.rm(path.join(root, 'assets/audio/voice', f)); console.log(`删除旧文件 ${f}`); }
  }
}

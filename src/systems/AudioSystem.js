// 音效系统：全部音效用 WebAudio 实时合成 (不需要音频文件)，追求"拧螺丝"的解压手感 (策划案第 9 章)。
// 自己订阅玩法/表现事件，场景不用关心音效：
//   screw:out    拧出：三下棘轮"咔哒"(2~4kHz 带通噪声) + 一声"啵"
//   tap:refused  拧不动："咔"
//   fx:land      落进盒子：五声音阶 C D E G A，1.2 秒内连续进盒逐级升高，第 5 下起高八度，最多 10 级；
//                落进临时孔：空心木头声 + 一点回声，连击归零
//   fx:boxClose  盒子装满：盖子"啪"一声 + 以当前连击音为根音的三音琶音
//   board:impact 板子落地：按材质 (木/金属/亚克力/玻璃) 出声；同一时刻多块合成一声更厚的
//   fx:reveal    揭开画：粉红噪声扫频 + 闪光
// 同一音效 60ms 内只响一次；同类每帧最多 2 个声部；每次随机 ±4% 音高。
// 音量 = 总音量 × 音效音量；关掉"音效"开关时不出声。
// 平台差异：网页 / 桌面版实时合成 (sfxMode 'synth')；抖音小游戏没有 WebAudio 合成，
// 改放 tools/render_sfx.mjs 用同一套合成代码离线渲染出的小 mp3 (sfxMode 'sampled'，InnerAudioContext 池)。
import { AudioConfig } from '../config/AudioConfig.js';
import { platform } from '../platform/index.js';

const PENTA = [0, 2, 4, 7, 9];
const C5 = 523.25;
const comboFreq = (n) => {
  const k = Math.max(0, Math.min(AudioConfig.sfx.comboMax - 1, n));
  return C5 * Math.pow(2, (PENTA[k % 5] + 12 * Math.floor(k / 5)) / 12);
};
const MATERIAL_SOUND = { oak: 'wood', walnut: 'wood', copper: 'metal', steel: 'metal', acrylic: 'plastic', glass: 'glass' };
const IMPACT_MAX_WEIGHT = 1.6;

/** 预渲染音效的文件名 (同一音效按影响音色的参数分档) */
export function sfxKey(name, o = {}) {
  switch (name) {
    case 'box': case 'boxFull': return `${name}_${Math.max(0, Math.min(AudioConfig.sfx.comboMax - 1, o.note | 0))}`;
    case 'impact': return `impact_${o.kind || 'wood'}`;
    case 'creak': return o.mat === 'oak' || o.mat === 'walnut' ? 'creak_wood' : 'creak_other';
    case 'smash': return o.mat === 'glass' ? 'smash_glass' : 'smash_other';
    case 'frost': return o.last ? 'frost_last' : 'frost';
    case 'tick': return o.urgent ? 'tick_urgent' : 'tick';
    default: return name;
  }
}

/** 需要预渲染的全部变体：{ key, name, o, dur } */
export function sfxVariants() {
  const list = [];
  const add = (name, o = {}, dur = 1.2) => list.push({ key: sfxKey(name, o), name, o, dur });
  for (let n = 0; n < AudioConfig.sfx.comboMax; n++) { add('box', { note: n }, 0.8); add('boxFull', { note: n }, 1.0); }
  for (const kind of ['wood', 'metal', 'plastic', 'glass']) add('impact', { kind, weight: IMPACT_MAX_WEIGHT }, 1.0);
  add('creak', { mat: 'oak' }, 0.4); add('creak', { mat: 'steel' }, 0.4);
  add('smash', { mat: 'glass' }, 0.7); add('smash', { mat: 'oak' }, 0.5);
  add('frost', { last: true }, 0.6); add('frost', {}, 0.3);
  add('tick', { urgent: true }, 0.15); add('tick', {}, 0.15);
  const single = { click: 0.12, page: 0.3, unscrew: 0.35, blocked: 0.12, full: 0.4, hole: 0.6, chain: 0.45, unlock: 0.7,
    boom: 0.85, fail: 0.85, revive: 0.65, undo: 0.35, rope: 0.5, shuffle: 0.35, item: 0.4, reveal: 1.6, win: 0.95 };
  for (const [k, d] of Object.entries(single)) add(k, {}, d);
  return list;
}

/** 抖音：InnerAudioContext 小池子 (LRU)，同一文件优先复用 */
class Sampler {
  constructor(size = 10) { this.size = size; this.pool = []; this.tick = 0; }
  play(src, volume) {
    let slot = this.pool.find((s) => s.src === src && (s.el.paused || s.el.ended));
    if (!slot) {
      if (this.pool.length < this.size) {
        slot = { el: platform.createAudio(), src: null, used: 0 };
        this.pool.push(slot);
      } else {
        slot = this.pool.reduce((a, b) => (a.used <= b.used ? a : b));
      }
    }
    slot.used = ++this.tick;
    try {
      if (slot.src !== src) { slot.src = src; slot.el.src = src; } else if (slot.el.stop) slot.el.stop();
      slot.el.volume = Math.max(0, Math.min(1, volume));
      const pr = slot.el.play();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (_) { /* ignore */ }
  }
}

export class AudioSystem {
  constructor(events, save) {
    this.events = events;
    this.save = save;
    this.ctx = null;
    this.out = null;
    this.master = save.get('master', AudioConfig.masterVolume);
    this.volume = AudioConfig.sfxVolume;
    this.enabled = save.get('sfxOn', true);
    this.last = {};
    this.frameCount = {};
    this.combo = -1;
    this.lastBoxTime = -10;
    this.comboNote = 0;
    this.impactBuf = null;
    this.played = [];      // 调试/测试：最近播放的音效名
    this.mode = platform.sfxMode;     // 'synth' | 'sampled'
    this.sampler = null;
    this.unlocked = false;

    events.on('input:down', () => this.unlock());
    events.on('input:key', () => this.unlock());
    events.on('input:up', () => this.unlock());        // 手机上 touchend/pointerup 才算用户手势
    events.on('screw:out', (e) => { if (!e.dumped) this.play('unscrew'); });
    events.on('tap:refused', (e) => this.play(e.reason === 'full' || e.reason === 'hammerFull' ? 'full' : 'blocked'));
    events.on('fx:land', (e) => this.onLand(e));
    events.on('fx:boxClose', () => this.play('boxFull', { note: this.comboNote }));
    events.on('board:impact', (e) => this.queueImpact(e.board));
    events.on('board:break', (e) => this.play('smash', { mat: e.board.mat }));
    events.on('board:pins', (e) => { if (e.pins === 1) this.play('creak', { mat: e.board.mat }); });
    events.on('chain:break', () => this.play('chain'));
    events.on('frost:crack', (e) => this.play('frost', { last: e.left <= 0 }));
    events.on('lock:open', () => this.play('unlock'));
    events.on('bomb:tick', (e) => { if (e.left <= 3) this.play('tick', { urgent: e.left <= 1 }); });
    events.on('puzzle:fail', (e) => this.play(e.reason === 'bomb' ? 'boom' : 'fail'));
    events.on('puzzle:revive', () => this.play('revive'));
    events.on('puzzle:undo', () => this.play('undo'));
    events.on('rope:cut', () => this.play('rope'));
    events.on('fx:reveal', () => this.play('reveal'));
    events.on('fx:winJingle', () => this.play('win'));
    events.on('holes:add', () => this.play('item'));
    events.on('slot:add', () => this.play('item'));
    events.on('boxes:shuffle', () => this.play('shuffle'));
    events.on('item:use', () => this.play('item'));
    events.on('ui:click', () => this.play('click'));
    events.on('ui:page', () => this.play('page'));
    events.on('puzzle:start', () => { this.combo = -1; this.lastBoxTime = -10; });
  }

  unlock() {
    if (this.mode === 'sampled') {
      if (!this.unlocked && platform.hasAudio()) { this.unlocked = true; this.sampler = new Sampler(10); }
      return;
    }
    try {
      if (!this.ctx) {
        const ctx = platform.createWebAudioContext();
        if (!ctx) return;
        this.attach(ctx, ctx.destination);
        this.applyVolume();
      }
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (err) {
      console.warn('[AudioSystem] 无法初始化音频:', err);
    }
  }

  /** 搭合成图：out → 压缩器 → dest，外加临时孔用的短回声。tools/render_sfx.mjs 用 OfflineAudioContext 调同一个方法 */
  attach(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.out.connect(comp);
    comp.connect(dest);
    this.echo = ctx.createDelay(0.5);
    this.echo.delayTime.value = 0.085;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo); lp.connect(this.out);
    this.noiseBuf = this.makeNoise(1.5, false);
    this.pinkBuf = this.makeNoise(2.0, true);
  }

  /** 规则用的时钟 (秒) */
  clock() { return this.ctx ? this.ctx.currentTime : platform.now() / 1000; }

  makeNoise(sec, pink) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2;
    }
    return buf;
  }

  setMaster(v) { this.master = Math.max(0, Math.min(1, v)); this.save.set('master', this.master); this.applyVolume(); this.events.emit('audio:master', this.master); }
  setEnabled(on) { this.enabled = on; this.save.set('sfxOn', on); this.applyVolume(); }
  applyVolume() {
    if (this.out) this.out.gain.setTargetAtTime(this.enabled ? this.volume * this.master * 4 : 0, this.ctx.currentTime, 0.02);
  }

  get ready() {
    if (this.mode === 'sampled') return !!(this.sampler && this.enabled && this.master > 0);
    return !!(this.ctx && this.enabled && this.master > 0);
  }

  update() { this.frameCount = {}; this.flushImpact(); }

  // ------------------------------------------------------------ 合成积木
  tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.004, dest = null }) {
    const ctx = this.ctx; const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur * 0.85);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.1, vol = 0.2, freq = 2000, q = 1, delay = 0, type = 'bandpass', freqEnd = null, pink = false, attack = 0.002, dest = null }) {
    const ctx = this.ctx; const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.pinkBuf : this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.out);
    src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.05);
  }

  /** 金属"叮"：基频 + 非谐泛音 */
  metal(f, { vol = 0.12, delay = 0, dur = 0.5 } = {}) {
    this.tone({ freq: f, dur, vol, delay, attack: 0.001 });
    this.tone({ freq: f * 2.76, dur: dur * 0.5, vol: vol * 0.35, delay, attack: 0.001 });
    this.tone({ freq: f * 5.4, dur: dur * 0.25, vol: vol * 0.15, delay, attack: 0.001 });
  }

  // ------------------------------------------------------------ 规则
  onLand(e) {
    if (!this.unlocked) return;
    const now = this.clock();
    if (e.kind === 'box') {
      this.combo = now - this.lastBoxTime <= AudioConfig.sfx.comboWindow ? this.combo + 1 : 0;
      this.lastBoxTime = now;
      this.comboNote = Math.min(AudioConfig.sfx.comboMax - 1, this.combo);
      this.play('box', { note: this.comboNote });
      this.events.emit('combo', { n: this.combo + 1 });
    } else {
      this.combo = -1;
      this.play('hole');
    }
  }

  queueImpact(board) {
    const kind = MATERIAL_SOUND[board.mat] || 'wood';
    if (!this.impactBuf) this.impactBuf = { t: 0, kinds: {}, area: 0, n: 0 };
    this.impactBuf.kinds[kind] = true;
    this.impactBuf.area += board.area;
    this.impactBuf.n++;
  }

  flushImpact() {
    const b = this.impactBuf;
    if (!b) return;
    if (++b.t < 4) return;           // 收集约 4 帧，同时落地的多块板合成一声
    this.impactBuf = null;
    const weight = Math.min(1.6, 0.7 + b.area / 60000 + (b.n - 1) * 0.25);
    for (const k of Object.keys(b.kinds)) this.play('impact', { kind: k, weight, force: true });
  }

  play(name, o = {}) {
    if (!this.ready) return;
    const now = this.clock();
    const key = name === 'impact' ? `impact_${o.kind}` : name;
    if (!o.force && this.last[key] != null && now - this.last[key] < AudioConfig.sfx.rateLimit) return;
    if ((this.frameCount[name] || 0) >= AudioConfig.sfx.maxPerFrame) return;
    this.last[key] = now;
    this.frameCount[name] = (this.frameCount[name] || 0) + 1;
    this.played.push(name); if (this.played.length > 40) this.played.shift();
    if (this.mode === 'sampled') {
      // 预渲染文件已含音效音量 (sfxVolume × 4)；这里只乘总音量，落地声按重量再缩放
      const w = name === 'impact' ? Math.min(1, (o.weight || 1) / IMPACT_MAX_WEIGHT) : 1;
      this.sampler.play(`assets/sfx/${sfxKey(name, o)}.mp3`, this.master * w);
      return;
    }
    this.synth(name, o, 1 + (Math.random() * 2 - 1) * AudioConfig.sfx.pitchJitter);
  }

  /** 合成一个音效 (j = 音高抖动系数；离线渲染时传 1) */
  synth(name, o = {}, j = 1) {
    switch (name) {
      case 'click':
        this.tone({ freq: 1100 * j, freqEnd: 1500 * j, dur: 0.06, vol: 0.12, attack: 0.002 });
        break;
      case 'page':
        this.noise({ dur: 0.18, vol: 0.08, freq: 3000, q: 0.6, freqEnd: 1500, pink: true });
        break;
      case 'unscrew': {
        // 三下棘轮 (2~4kHz 带通噪声) + "啵"
        for (let k = 0; k < 3; k++) {
          this.noise({ dur: 0.028, vol: 0.32, freq: (2200 + k * 650) * j, q: 6, delay: k * 0.048 });
          this.tone({ freq: (3100 + k * 300) * j, dur: 0.02, vol: 0.04, delay: k * 0.048, attack: 0.001 });
        }
        this.tone({ freq: 320 * j, freqEnd: 760 * j, dur: 0.085, vol: 0.28, delay: 0.16, attack: 0.002 });
        this.tone({ freq: 1500 * j, freqEnd: 1900 * j, dur: 0.04, vol: 0.05, delay: 0.18, attack: 0.001 });
        break;
      }
      case 'blocked':
        this.noise({ dur: 0.035, vol: 0.32, freq: 950 * j, q: 4 });
        this.tone({ freq: 190 * j, freqEnd: 150 * j, type: 'square', dur: 0.04, vol: 0.05 });
        break;
      case 'full':
        this.noise({ dur: 0.035, vol: 0.28, freq: 800 * j, q: 4 });
        this.tone({ freq: 330, freqEnd: 300, type: 'triangle', dur: 0.14, vol: 0.09, delay: 0.03 });
        this.tone({ freq: 311, freqEnd: 290, type: 'triangle', dur: 0.18, vol: 0.08, delay: 0.13 });
        break;
      case 'box': {
        const f = comboFreq(o.note) * j;
        this.noise({ dur: 0.02, vol: 0.18, freq: 4200, q: 3 });              // 落进铁盒的"嗒"
        this.metal(f, { vol: 0.14, dur: 0.45 });
        this.tone({ freq: f * 2, dur: 0.2, vol: 0.035, delay: 0.01 });
        break;
      }
      case 'hole': {
        const send = this.echo;
        this.tone({ freq: 210 * j, freqEnd: 160 * j, dur: 0.12, vol: 0.22, attack: 0.002 });
        this.noise({ dur: 0.05, vol: 0.16, freq: 700 * j, q: 2, type: 'lowpass' });
        this.tone({ freq: 210 * j, freqEnd: 160 * j, dur: 0.1, vol: 0.12, attack: 0.002, dest: send });
        break;
      }
      case 'boxFull': {
        // 盖子"啪" + 三音琶音 (根音 = 当前连击音)
        this.noise({ dur: 0.05, vol: 0.3, freq: 2600, q: 1.5 });
        this.tone({ freq: 130, freqEnd: 80, dur: 0.12, vol: 0.2, attack: 0.002 });
        const root = comboFreq(o.note);
        [1, 1.25, 1.5].forEach((r, i) => this.metal(root * r, { vol: 0.09, delay: 0.09 + i * 0.075, dur: 0.5 }));
        break;
      }
      case 'creak':
        this.tone({ freq: (o.mat === 'oak' || o.mat === 'walnut' ? 140 : 380) * j, freqEnd: 110 * j, type: 'sawtooth', dur: 0.22, vol: 0.02 });
        break;
      case 'impact': {
        const w = o.weight || 1;
        if (o.kind === 'wood') {
          this.tone({ freq: 95 * j, freqEnd: 55, dur: 0.3, vol: 0.32 * w, attack: 0.002 });
          this.noise({ dur: 0.14, vol: 0.22 * w, freq: 600, q: 0.8, type: 'lowpass' });
          this.noise({ dur: 0.05, vol: 0.12 * w, freq: 1800 * j, q: 2, delay: 0.06 });
        } else if (o.kind === 'metal') {
          this.metal(420 * j, { vol: 0.12 * w, dur: 0.8 });
          this.metal(633 * j, { vol: 0.07 * w, dur: 0.6, delay: 0.005 });
          this.tone({ freq: 80, freqEnd: 50, dur: 0.2, vol: 0.2 * w });
        } else if (o.kind === 'plastic') {
          this.noise({ dur: 0.06, vol: 0.28 * w, freq: 1600 * j, q: 2.5 });
          this.tone({ freq: 240 * j, freqEnd: 170, dur: 0.12, vol: 0.12 * w });
        } else {
          for (let k = 0; k < 6; k++) this.metal((2400 + Math.random() * 2600), { vol: 0.03 * w, dur: 0.25, delay: k * 0.03 + Math.random() * 0.02 });
          this.noise({ dur: 0.25, vol: 0.12 * w, freq: 5000, q: 0.7, type: 'highpass' });
        }
        break;
      }
      case 'smash':
        this.noise({ dur: 0.35, vol: 0.32, freq: 900, q: 0.6 });
        this.tone({ freq: 120, freqEnd: 45, dur: 0.35, vol: 0.3 });
        if (o.mat === 'glass') for (let k = 0; k < 8; k++) this.metal(2000 + Math.random() * 3000, { vol: 0.03, dur: 0.3, delay: 0.05 + k * 0.035 });
        break;
      case 'chain':
        for (let k = 0; k < 4; k++) this.metal((1700 + Math.random() * 900) * j, { vol: 0.05, dur: 0.18, delay: k * 0.05 });
        break;
      case 'frost':
        this.noise({ dur: 0.12, vol: 0.14, freq: 5200 * j, q: 1.2, type: 'highpass' });
        this.tone({ freq: 2600 * j, freqEnd: 3400 * j, dur: 0.08, vol: 0.05 });
        if (o.last) this.metal(1760 * j, { vol: 0.07, dur: 0.4, delay: 0.06 });
        break;
      case 'unlock':
        this.noise({ dur: 0.03, vol: 0.2, freq: 3000, q: 3 });
        this.noise({ dur: 0.03, vol: 0.2, freq: 2400, q: 3, delay: 0.08 });
        [0, 4, 7, 12].forEach((s, i) => this.metal(C5 * Math.pow(2, s / 12), { vol: 0.07, dur: 0.4, delay: 0.14 + i * 0.06 }));
        break;
      case 'tick':
        this.tone({ freq: o.urgent ? 1760 : 1320, dur: 0.05, vol: 0.12, attack: 0.001 });
        break;
      case 'boom':
        this.noise({ dur: 0.7, vol: 0.4, freq: 400, q: 0.5, type: 'lowpass', pink: true });
        this.tone({ freq: 90, freqEnd: 35, dur: 0.6, vol: 0.35 });
        break;
      case 'fail':
        [7, 4, 2, 0].forEach((s, i) => this.tone({ freq: C5 * 0.5 * Math.pow(2, s / 12), dur: 0.3, vol: 0.1, delay: i * 0.14, type: 'triangle' }));
        break;
      case 'revive':
        [0, 4, 7].forEach((s, i) => this.metal(C5 * Math.pow(2, s / 12), { vol: 0.07, dur: 0.4, delay: i * 0.07 }));
        break;
      case 'undo':
        this.noise({ dur: 0.22, vol: 0.12, freq: 3200, q: 0.8, freqEnd: 900, pink: true });
        this.tone({ freq: 900, freqEnd: 500, dur: 0.15, vol: 0.06 });
        break;
      case 'rope':
        this.noise({ dur: 0.05, vol: 0.3, freq: 1400, q: 3 });
        this.noise({ dur: 0.35, vol: 0.12, freq: 600, q: 0.6, freqEnd: 200, pink: true, delay: 0.03 });
        break;
      case 'shuffle':
        for (let k = 0; k < 3; k++) this.noise({ dur: 0.09, vol: 0.12, freq: 1800 + k * 400, q: 1, delay: k * 0.07, pink: true });
        break;
      case 'item':
        this.tone({ freq: 880 * j, freqEnd: 1760 * j, dur: 0.22, vol: 0.09 });
        for (let k = 0; k < 4; k++) this.tone({ freq: 2600 + Math.random() * 1600, dur: 0.08, vol: 0.03, delay: 0.08 + k * 0.04 });
        break;
      case 'reveal':
        // 粉红噪声由低到高扫过去，像揭开一层纸
        this.noise({ dur: 1.3, vol: 0.22, freq: 300, freqEnd: 6500, q: 1.4, pink: true, attack: 0.25 });
        for (let k = 0; k < 10; k++) this.tone({ freq: 2200 + Math.random() * 2400, dur: 0.12, vol: 0.025, delay: 0.5 + k * 0.08 });
        break;
      case 'win':
        [0, 4, 7, 12].forEach((s, i) => this.metal(C5 * Math.pow(2, s / 12), { vol: 0.08, dur: 0.6, delay: i * 0.09 }));
        break;
      default:
        break;
    }
  }
}

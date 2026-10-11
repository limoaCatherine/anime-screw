// 背景音乐系统：4 首循环曲 + 揭画短曲 (tools/compose_bgm.py 程序化作曲，文件已统一到 -22 LUFS)。
// - 全局服务 (Game 持有)，跨场景连续播放；换曲 (菜单 ⇄ 各章) 时交叉淡化
// - HTMLAudioElement 播放 (file:// 双击运行与 Electron 内都可用)；ogg 首尾无缝，mp3 兜底
// - 抖音版只能用 mp3 (iOS 不支持 ogg)：循环曲由 LoopTrack 两路接力播放，避开 mp3 编码器延迟/补帧造成的循环空白
// - 台词播放时平滑压低 (×0.55，150ms 下去 / 400ms 回来)；揭画短曲播放时主曲压到 ×0.25
// - 音量 = 总音量 × 音乐音量 × 闪避 × 淡入淡出；窗口隐藏时暂停
// - 浏览器禁止自动播放时，第一次点击/按键时开始
// - 播放器由平台层创建 (网页 HTMLAudioElement；抖音 InnerAudioContext 包装)。抖音版音乐在分包里，
//   分包加载完成前 available=false，只记住要放哪首
import { AudioConfig } from '../config/AudioConfig.js';
import { platform } from '../platform/index.js';
import { LoopTrack } from './LoopTrack.js';

const CFG = AudioConfig.bgm;

export class BgmSystem {
  constructor(events, save, audio) {
    this.events = events;
    this.save = save;
    this.audio = audio;
    this.enabled = save.get('bgmOn', true);
    this.volume = AudioConfig.bgmVolume;
    this.hidden = platform.isHidden();
    this.available = !platform.isMini;       // 抖音 / 微信：等音乐分包加载完 (BootScene) 再放
    this.players = {};        // name -> { el, level, target }
    this.current = null;
    this.duck = 1;
    this.voiceActive = false;
    this.voiceTime = 0;
    this.sting = null;
    this.unlocked = false;
    this.ext = null;

    events.on('input:down', () => this.unlock());
    events.on('input:key', () => this.unlock());
    events.on('input:up', () => this.unlock());
    events.on('app:hidden', () => { this.hidden = true; this.sync(); });
    events.on('app:visible', () => { this.hidden = false; this.sync(); });
    events.on('voice:start', () => { this.voiceActive = true; this.voiceTime = 0; });
    events.on('voice:end', () => { this.voiceActive = false; });
  }

  pickExt() {
    if (this.ext) return this.ext;
    if (platform.audioExt) { this.ext = platform.audioExt; return this.ext; }
    try {
      const a = platform.createAudio();
      this.ext = a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    } catch (_) { this.ext = 'mp3'; }
    return this.ext;
  }

  player(name) {
    if (this.players[name]) return this.players[name];
    if (!this.available || !platform.hasAudio()) return null;
    const t = CFG.tracks[name];
    const src = platform.assetPath(`${CFG.dir}${t.file}.${this.pickExt()}`);
    const loopInfo = platform.bgmLoops && platform.bgmLoops[t.file];
    let el;
    if (loopInfo) {
      el = new LoopTrack(src, loopInfo);   // 抖音 mp3：两路接力，循环点无空白
    } else {
      el = platform.createAudio();
      el.loop = true;
      el.preload = 'auto';
      el.src = src;
    }
    el.volume = 0;
    el.addEventListener('error', () => console.warn('[BgmSystem] 背景音乐加载失败:', el.src));
    const p = { name, el, level: 0, target: 0 };
    this.players[name] = p;
    return p;
  }

  /** 切到某首 (同一首不会重新开始) */
  play(name) {
    if (!CFG.tracks[name]) return;
    if (this.current === name) { this.sync(); return; }
    this.current = name;
    for (const p of Object.values(this.players)) p.target = 0;
    const p = this.player(name);
    if (p) p.target = 1;
    this.sync();
  }

  /** 抖音：音乐分包加载完成后调用 */
  setAvailable(on) {
    this.available = on;
    if (on && this.current) { const c = this.current; this.current = null; this.play(c); }
  }

  /** 揭画短曲：播一次，期间主曲压低 */
  playSting() {
    if (!this.shouldPlay || !this.available || !platform.hasAudio()) return;
    try {
      if (this.sting && this.sting.destroy) this.sting.destroy();
      const el = platform.createAudio(platform.assetPath(`${CFG.dir}${CFG.sting.file}.${this.pickExt()}`));
      el.volume = this.outVolume;
      el.play().catch(() => {});
      this.sting = el;
      el.addEventListener('ended', () => { if (this.sting === el) this.sting = null; });
    } catch (_) { /* ignore */ }
  }

  get shouldPlay() { return this.enabled && !this.hidden && this.audio.master > 0; }
  get outVolume() { return Math.max(0, Math.min(1, this.volume * this.audio.master)); }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.sync();
  }

  sync() {
    for (const p of Object.values(this.players)) {
      const want = this.shouldPlay && (p.target > 0 || p.level > 0.001);
      if (want && p.el.paused) {
        const pr = p.el.play();
        if (pr && pr.catch) pr.catch(() => { this.unlocked = false; });
      } else if (!want && !p.el.paused) {
        p.el.pause();
      }
    }
    if (this.sting && !this.shouldPlay) { this.sting.pause(); this.sting = null; }
  }

  setEnabled(on) {
    this.enabled = on;
    this.save.set('bgmOn', on);
    this.sync();
  }

  update(dt) {
    if (this.voiceActive) {
      this.voiceTime += dt;
      if (this.voiceTime > CFG.maxDuckTime) this.voiceActive = false;
    }
    let duckTarget = this.voiceActive ? CFG.duck : 1;
    if (this.sting && !this.sting.paused) duckTarget = Math.min(duckTarget, CFG.stingDuck);
    const tau = duckTarget < this.duck ? CFG.duckAttack / 3 : CFG.duckRelease / 3;  // 时间常数 ≈ 时长/3
    this.duck += (duckTarget - this.duck) * (1 - Math.exp(-dt / tau));
    const base = this.outVolume;
    let anyPaused = false;
    for (const p of Object.values(this.players)) {
      const step = dt / CFG.crossfade;
      p.level = p.target > p.level ? Math.min(p.target, p.level + step) : Math.max(p.target, p.level - step);
      const v = Math.max(0, Math.min(1, base * this.duck * p.level));
      if (Math.abs(p.el.volume - v) > 0.0005) p.el.volume = v;
      if (p.el.tick) p.el.tick();
      if (p.level <= 0.001 && p.target === 0 && !p.el.paused) p.el.pause();
      if (p.target > 0 && p.el.paused) anyPaused = true;
    }
    if (this.sting) this.sting.volume = base;
    if (anyPaused && this.unlocked && this.shouldPlay) {
      this._retry = (this._retry || 0) + dt;
      if (this._retry > 1) { this._retry = 0; this.sync(); }
    }
  }

  state() {
    const p = this.current ? this.players[this.current] : null;
    return {
      current: this.current,
      playing: !!(p && !p.el.paused),
      time: p ? p.el.currentTime : 0,
      volume: p ? p.el.volume : 0,
      duck: this.duck,
      src: p ? p.el.src : null,
    };
  }
}

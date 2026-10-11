// 语音系统：角色台词 (VOICEVOX 预生成 mp3) + 字幕事件。规则 (策划案 9.3)：
// - 同一时间只放一句；两句之间至少间隔 0.6 秒
// - 优先级高的打断正在播的低优先级；优先级不够或在冷却中的请求直接丢掉，不排队
// - 每关最多 2 句：开场 / 连击 / 提醒 / 复活 这类低优先级 (<4) 的整关只占 1 句；通关 / 失败 / 整幅画 每种至多 1 句
//   (关卡开始时 resetLevel 清零)
// - say() 传的是"场合" (group)：同一场合有几种说法时轮着用，最近 noRepeatWithin 句里说过的不再选
// - 播放时发 voice:start / voice:end，BgmSystem 据此压低音乐
// - 音量 = 总音量 × 语音音量；关掉"语音"后字幕照常显示
// - 播放器由平台层创建；小游戏 (platform.isMini) 不预加载 36 个 InnerAudioContext，播放时现建、播完销毁
import { platform } from '../platform/index.js';
import { VOICE_BY_ID, VOICE_GROUPS, VOICE_LINES, VoiceConfig, CHARACTERS } from '../config/VoiceConfig.js';

export class VoiceSystem {
  constructor(events, save, audio) {
    this.events = events;
    this.save = save;
    this.audio = audio;
    this.volume = VoiceConfig.volume;
    this.enabled = save.get('voiceOn', true);
    this.clips = {};
    this.current = null;     // { line, el, priority }
    this.cooldown = 0;
    this.perChar = {};
    this.levelCount = 0;     // 本关已经说了几句
    this.levelGroups = {};   // 本关说过的场合
    this.playCount = {};     // 每句说过几次 (轮换用)
    this.history = [];       // 调试/测试
    this.dropped = 0;
    events.on('audio:master', () => { if (this.current && this.current.el) this.current.el.volume = this.outVolume; });
  }

  get outVolume() { return Math.max(0, Math.min(1, this.volume * this.audio.master)); }

  preload(onProgress = () => {}, timeoutMs = 3500) {
    let done = 0;
    const total = VOICE_LINES.length;
    if (platform.isMini) {
      for (const line of VOICE_LINES) this.clips[line.id] = { el: null, state: 'lazy', src: platform.assetPath(line.file) };
      onProgress(1);
      return Promise.resolve();
    }
    return Promise.all(VOICE_LINES.map((line) => new Promise((resolve) => {
      let settled = false;
      const finish = (state) => {
        if (settled) return;
        settled = true;
        this.clips[line.id].state = state;
        onProgress(++done / total);
        resolve();
      };
      try {
        const el = platform.createAudio();
        el.preload = 'auto';
        this.clips[line.id] = { el, state: 'loading' };
        el.addEventListener('canplaythrough', () => finish('ready'), { once: true });
        el.addEventListener('loadeddata', () => finish('ready'), { once: true });
        el.addEventListener('error', () => finish('failed'), { once: true });
        el.src = platform.assetPath(line.file);
        el.load();
        setTimeout(() => finish('unknown'), timeoutMs);
      } catch (_) {
        this.clips[line.id] = { el: null, state: 'failed' };
        finish('failed');
      }
    })));
  }

  setEnabled(on) {
    this.enabled = on;
    this.save.set('voiceOn', on);
    if (!on) this.stop();
  }

  resetLevel() {
    this.stop();
    this.perChar = {};
    this.levelCount = 0;
    this.levelGroups = {};
    this.cooldown = 0;
  }

  isPlaying() {
    const c = this.current;
    if (!c) return false;
    if (c.el) return !c.el.paused && !c.el.ended;
    return c.until > platform.now();
  }

  /**
   * 请求说一句。返回是否真的说了。
   * @param {string} id   台词 id (VoiceConfig)
   * @param {object} [o]  { x, y } 字幕气泡位置提示
   */
  /** 场合 → 选一句：没在最近几句里出现过、说过次数最少的那句 */
  pick(id) {
    const group = VOICE_GROUPS[id] || (VOICE_BY_ID[id] ? VOICE_GROUPS[VOICE_BY_ID[id].group] || [VOICE_BY_ID[id]] : null);
    if (!group || !group.length) return null;
    const recent = this.history.slice(-VoiceConfig.noRepeatWithin);
    const fresh = group.filter((l) => !recent.includes(l.id));
    const pool = fresh.length ? fresh : group;
    return pool.reduce((a, b) => ((this.playCount[b.id] || 0) < (this.playCount[a.id] || 0) ? b : a));
  }

  /** 这关还能不能说这一类台词 */
  allowed(line) {
    if (this.levelGroups[line.group]) return false;                  // 同一场合一关只说一次
    if (line.priority < 4) return this.levelCount === 0;             // 低优先级：整关只占 1 句，而且得是第一句
    return line.priority >= 5 || this.levelCount < VoiceConfig.perLevel || !this.levelGroups.__high;
  }

  say(id, o = {}) {
    const line = this.pick(id);
    if (!line) return false;
    if (!this.allowed(line)) { this.dropped++; return false; }
    const n = this.perChar[line.who] || 0;
    const playing = this.isPlaying();
    if (playing && line.priority <= this.current.line.priority) { this.dropped++; return false; }
    if (!playing && this.cooldown > 0) { this.dropped++; return false; }
    this.perChar[line.who] = n + 1;
    this.levelCount++;
    this.levelGroups[line.group] = true;
    if (line.priority >= 4) this.levelGroups.__high = true;
    this.playCount[line.id] = (this.playCount[line.id] || 0) + 1;
    this.play(line, o);
    return true;
  }

  play(line, o) {
    this.stop();
    this.cooldown = VoiceConfig.cooldown;
    this.history.push(line.id);
    const clip = this.clips[line.id];
    if (clip && clip.state === 'lazy' && this.enabled && this.audio.master > 0 && platform.hasAudio()) {
      if (this.lazyEl && this.lazyEl.destroy) this.lazyEl.destroy();
      this.lazyEl = platform.createAudio(clip.src);
      clip.el = this.lazyEl;
    }
    const dur = clip && clip.el && Number.isFinite(clip.el.duration) ? clip.el.duration : null;
    this.events.emit('voice:line', { line, char: CHARACTERS[line.who], duration: dur, ...o });
    const silent = !this.enabled || this.audio.master <= 0;
    if (silent || !clip || !clip.el || clip.state === 'failed') {
      // 没声音也占住时长，保证字幕/冷却节奏一致
      this.current = { line, el: null, until: platform.now() + 1600 };
      return;
    }
    const el = clip.el;
    this.current = { line, el };
    el.onended = () => this.finish(el);
    try {
      el.currentTime = 0;
      el.volume = this.outVolume;
      const pr = el.play();
      this.events.emit('voice:start', { id: line.id });
      if (pr && pr.catch) pr.catch(() => this.finish(el));
    } catch (_) {
      this.finish(el);
    }
  }

  finish(el) {
    if (this.current && this.current.el === el) {
      const id = this.current.line.id;
      this.current = null;
      this.cooldown = VoiceConfig.cooldown;
      this.events.emit('voice:end', { id });
    }
  }

  stop() {
    const c = this.current;
    if (!c) return;
    if (c.el) { try { c.el.pause(); } catch (_) { /* ignore */ } }
    this.current = null;
    if (c.el) this.events.emit('voice:end', { id: c.line.id });
  }

  update(dt) {
    if (this.cooldown > 0 && !this.isPlaying()) this.cooldown -= dt;
    if (this.current && !this.current.el && this.current.until <= platform.now()) this.current = null;
  }
}

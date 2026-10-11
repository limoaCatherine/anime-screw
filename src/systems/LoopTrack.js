// 无缝循环播放器 (抖音版 BGM 用)。
// mp3 文件头有编码器延迟、文件尾有补帧静音，InnerAudioContext 的 loop=true 从头重放时循环点会出现一小段空白。
// 抖音构建 (tools/douyin_bgm.py) 把每首循环曲写成 [尾部 pre 秒] + [一圈 len 秒] + [头部 post 秒]，
// 这里用两个音频实例接力，不用 loop：
//   - 当前一路播到 pre+len 附近 (按墙钟外推 currentTime，InnerAudioContext 的 currentTime 刷新较粗)，
//     另一路 seek 到「当前位置 − len」(落在 pre 垫片里，内容与当前一路完全相同) 起播；
//   - 新一路真正出声后 (currentTime 开始走) 做 FADE 秒交叉淡化，然后停掉旧的一路。
//   两路播放的是同一段音乐，起播延迟只会让时间轴挪几十毫秒，不会出现空白；
//   解码器是否裁掉编码器延迟对两路是同样的偏移，互相抵消。
// 对外接口模仿 HTMLAudioElement 的子集 (paused / volume / play / pause / currentTime / src / addEventListener / destroy)，
// BgmSystem 不用区分。
import { platform } from '../platform/index.js';

const LEAD = 0.35;     // 提前多少秒准备接力 (垫片 post=1s，足够覆盖起播延迟 + 淡化)
const FADE = 0.12;     // 交叉淡化时长
const LATENCY = 0.06;  // 预估起播延迟，seek 时补上

export class LoopTrack {
  constructor(src, info) {
    this.src = src;
    this.pre = info.pre; this.len = info.len; this.post = info.post;
    this.voices = [this._make(), this._make()];
    this.cur = 0;               // 正在播的那一路
    this._vol = 1;
    this._playing = false;
    this.handoff = null;        // { t0, started } 接力进行中
    this.loops = 0;
    this.listeners = { error: [] };
    this.preload = 'auto';
    this.loop = true;           // 只是标记，实际靠接力
  }

  _make() {
    const el = platform.createAudio();
    el.loop = false;
    el.src = this.src;
    el.volume = 0;
    const v = { el, gain: 0, lastCT: 0, lastAt: 0 };
    el.addEventListener('error', (e) => this.listeners.error.forEach((f) => f(e)));
    el.addEventListener('ended', () => { if (this.voices[this.cur] === v && this._playing && !this.handoff) this._restart(v); });
    return v;
  }

  /** 墙钟外推的播放位置 */
  _pos(v) {
    const now = platform.now() / 1000;
    const ct = v.el.currentTime || 0;
    if (ct !== v.lastCT) { v.lastCT = ct; v.lastAt = now; return ct; }
    return v.el.paused ? ct : ct + Math.min(0.5, now - v.lastAt);
  }

  _start(v, at) {
    v.lastCT = -1; v.lastAt = platform.now() / 1000;
    const p = v.el.play();
    if (p && p.catch) p.catch(() => {});
    try { v.el.currentTime = Math.max(0, at); } catch (_) { /* seek 失败：从文件头放，头部就是上一圈的结尾，听感仍连续 */ }
  }

  /** 兜底：当前一路意外放完了 (比如切后台太久)，直接从循环起点再来 */
  _restart(v) {
    this._noRetryUntil = -1;
    this._start(v, this.pre);
    v.gain = 1; this._apply();
  }

  get paused() { return !this._playing; }
  get volume() { return this._vol; }
  set volume(x) { this._vol = Math.max(0, Math.min(1, x)); this._apply(); }
  get currentTime() {
    const t = this._pos(this.voices[this.cur]) - this.pre;
    return ((t % this.len) + this.len) % this.len;
  }

  _apply() {
    for (const v of this.voices) {
      const want = this._vol * v.gain;
      try { if (Math.abs(v.el.volume - want) > 0.0005) v.el.volume = want; } catch (_) { /* 某些端 volume 只读：靠停掉旧的一路完成切换 */ }
    }
  }

  play() {
    if (this._playing) return Promise.resolve();
    this._playing = true;
    const v = this.voices[this.cur];
    if (!this.started) { this.started = true; v.gain = 1; this._apply(); this._start(v, this.pre); return Promise.resolve(); }
    v.gain = 1; this._apply();
    const p = v.el.play();
    return p && p.then ? p : Promise.resolve();
  }

  pause() {
    if (!this._playing) return;
    this._playing = false;
    if (this.handoff) this._finishHandoff();
    for (const v of this.voices) if (!v.el.paused) v.el.pause();
  }

  /** 每帧调用 (BgmSystem.update) */
  tick() {
    if (!this._playing) return;
    const a = this.voices[this.cur];
    const b = this.voices[1 - this.cur];
    if (!this.handoff) {
      const t = this._pos(a);
      if (t >= this.pre + this.len - LEAD && this._noRetryUntil !== this.loops) {
        // 另一路 seek 到同一段内容 (pre 垫片里) 起播
        const target = t - this.len + LATENCY;
        b.gain = 0; this._apply();
        this._start(b, target);
        this.handoff = { t0: platform.now() / 1000, started: false, target };
      }
      return;
    }
    const h = this.handoff;
    const now = platform.now() / 1000;
    if (!h.started) {
      // 新一路真正开始出声 (currentTime 走过了 seek 目标) 才开始淡化；旧的一路在此之前保持满音量
      if (!b.el.paused && (b.el.currentTime || 0) > h.target + 0.015) { h.started = true; h.fadeAt = now; return; }
      if (now - h.t0 > 0.6) {
        // 新一路没起来：放弃这次接力，旧的一路继续 (post 垫片 1 秒)，放完由 ended 兜底从循环起点重来
        try { b.el.stop ? b.el.stop() : b.el.pause(); } catch (_) { /* ignore */ }
        b.gain = 0; this._apply();
        this.handoff = null; this.failedHandoffs = (this.failedHandoffs || 0) + 1;
        this._noRetryUntil = this.loops;   // 这一圈不再尝试
      }
      return;
    }
    const k = Math.min(1, (now - h.fadeAt) / FADE);
    b.gain = Math.sin(k * Math.PI / 2); a.gain = Math.cos(k * Math.PI / 2);
    this._apply();
    if (k >= 1) this._finishHandoff();
  }

  _finishHandoff() {
    const a = this.voices[this.cur];
    const b = this.voices[1 - this.cur];
    try { a.el.stop ? a.el.stop() : a.el.pause(); } catch (_) { /* ignore */ }
    a.gain = 0; b.gain = 1; this._apply();
    this.cur = 1 - this.cur;
    this.handoff = null;
    this.loops++;
  }

  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { const l = this.listeners[type]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  canPlayType() { return 'probably'; }
  destroy() { for (const v of this.voices) { try { v.el.destroy ? v.el.destroy() : v.el.pause(); } catch (_) { /* ignore */ } } }
}

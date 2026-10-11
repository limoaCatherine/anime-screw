// 小游戏 (抖音 tt / 微信 wx) 共用：InnerAudioContext 包成 HTMLAudioElement 的子集，供 Voice/Bgm/Audio/LoopTrack 使用。
// currentTime 只读，用 seek() 定位；play() 后到 onPlay 之前 paused 仍为 true，所以自己记播放状态。
export class MiniAudio {
  /** api = tt / wx：两家的 InnerAudioContext 接口一致 (src/loop/volume/play/pause/stop/seek/destroy/onCanplay/onEnded/onError) */
  constructor(api, src) {
    this._ctx = api.createInnerAudioContext();
    this._src = '';
    this._vol = 1;
    this._loop = false;
    this.ended = false;
    this._playing = false;      // 自己记播放状态：play() 之后到 onPlay 之间 ctx.paused 仍为 true
    this.preload = 'auto';
    this.onended = null;
    this._ls = {};
    this._ctx.onCanplay(() => { this._emit('canplaythrough'); this._emit('loadeddata'); });
    this._ctx.onEnded(() => { this.ended = true; if (!this._loop) this._playing = false; this._emit('ended'); if (typeof this.onended === 'function') this.onended(); });
    this._ctx.onError((e) => { this._playing = false; this._emit('error', e); });
    if (src) this.src = src;
  }
  _emit(type, e) {
    const list = this._ls[type];
    if (!list) return;
    this._ls[type] = list.filter((l) => !l.once);
    for (const l of list) { try { l.fn(e || { type }); } catch (err) { console.warn(err); } }
  }
  addEventListener(type, fn, opt) { (this._ls[type] = this._ls[type] || []).push({ fn, once: !!(opt && opt.once) }); }
  removeEventListener(type, fn) { if (this._ls[type]) this._ls[type] = this._ls[type].filter((l) => l.fn !== fn); }
  get src() { return this._src; }
  set src(v) { this._src = v; this.ended = false; this._ctx.src = v; }
  get loop() { return this._loop; }
  set loop(v) { this._loop = !!v; this._ctx.loop = !!v; }
  get volume() { return this._vol; }
  set volume(v) { this._vol = v; try { this._ctx.volume = v; } catch (_) { /* 部分版本只读 */ } }
  get paused() { return !this._playing; }
  get duration() { const d = this._ctx.duration; return d > 0 ? d : NaN; }
  get currentTime() { return this._ctx.currentTime || 0; }
  set currentTime(v) { try { this._ctx.seek(v); } catch (_) { /* ignore */ } }
  canPlayType(t) { return /mpeg|mp3/.test(t) ? 'probably' : ''; }
  load() { /* InnerAudioContext 设置 src 后自行加载 */ }
  play() { this.ended = false; this._playing = true; try { this._ctx.play(); return Promise.resolve(); } catch (e) { this._playing = false; return Promise.reject(e); } }
  pause() { this._playing = false; try { this._ctx.pause(); } catch (_) { /* ignore */ } }
  stop() { this._playing = false; try { this._ctx.stop(); } catch (_) { /* ignore */ } }
  destroy() { this._playing = false; try { this._ctx.destroy(); } catch (_) { /* ignore */ } }
}


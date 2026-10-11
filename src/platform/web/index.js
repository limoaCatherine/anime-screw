// 网页 / Electron 平台实现：DOM Canvas、Pointer Events、visibilitychange、HTMLAudioElement、WebAudio 实时合成音效。
export const platform = {
  name: 'web',
  isDouyin: false,
  isMini: false,
  sfxMode: 'synth',          // 音效：WebAudio 实时合成
  audioExt: null,
  bgmLoops: null,     // 网页版用 ogg + loop=true (Vorbis 首尾无编码静音)，不需要 LoopTrack

  getMainCanvas() { return document.getElementById('game'); },

  createCanvas(w = 1, h = 1) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  },

  createImage() { return new Image(); },

  now() { return performance.now(); },

  raf(fn) { return requestAnimationFrame(fn); },

  assetPath(p) { return p; },

  /** 等比缩放到窗口 (9:16)，按设备像素比提高清晰度。返回 { scale, offX, offY } (画布像素) */
  layout(canvas, W, H) {
    const vw = window.innerWidth || W;
    const vh = window.innerHeight || H;
    const s = Math.min(vw / W, vh / H);
    const cssW = Math.floor(W * s);
    const cssH = Math.floor(H * s);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    return { scale: canvas.width / W, offX: 0, offY: 0 };
  },

  onResize(cb) {
    window.addEventListener('resize', cb);
    window.addEventListener('orientationchange', cb);
  },

  /** cb(hidden:boolean, info) */
  onVisibility(cb) {
    document.addEventListener('visibilitychange', () => cb(document.hidden, {}));
  },

  isHidden() { return typeof document !== 'undefined' && !!document.hidden; },

  /**
   * 输入：h.down/move/up(id, x, y) 坐标为画布像素；h.key(e)
   */
  bindInput(canvas, h) {
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height, e.pointerType];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      h.down(e.pointerId, ...pos(e));
    });
    canvas.addEventListener('pointermove', (e) => h.move(e.pointerId, ...pos(e)));
    window.addEventListener('pointerup', (e) => h.up(e.pointerId, ...pos(e)));
    window.addEventListener('pointercancel', (e) => h.up(e.pointerId, ...pos(e)));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
      h.key(e);
    });
  },

  /** HTMLAudioElement (语音 / 音乐) */
  hasAudio() { return typeof Audio !== 'undefined'; },
  createAudio(src) { return src ? new Audio(src) : new Audio(); },
  createWebAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    return AC ? new AC() : null;
  },

  /** 分包：网页版没有分包，直接成功 */
  loadSubpackage() { return Promise.resolve(true); },

  expose(game) { window.__ANIME_SCREW__ = game; },

  // ---- 抖音专属能力，网页版不提供 ----
  recorder: null,
  sidebar: null,
  shareVideo: null,
};

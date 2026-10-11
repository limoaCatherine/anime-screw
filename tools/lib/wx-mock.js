// 微信小游戏运行时模拟 (tools/test_wechat.mjs 注入到 Chromium 页面里)。
// - 只提供微信开放文档 (developers.weixin.qq.com/minigame/dev/api/) 里核对过的 wx.* 接口；游戏访问任何其他 wx.xxx 都记为违规
//   (抖音专有的 tt.checkScene / navigateToScene / getGameRecorderManager 等在这里不存在；tt 本身是 undefined)
// - 游戏代码在一个屏蔽了 window / document / Image / Audio / localStorage / performance 等浏览器全局的函数作用域里运行，
//   只能拿到 wx、GameGlobal、require、setTimeout、requestAnimationFrame 这些微信运行时也有的东西
// - 分包：loadSubpackage 之前访问 sub_* 路径下的资源记为违规
(function install() {
  const H = (window.__WX = { log: [], errors: [], touches: {}, shows: [], hides: [], storage: {}, loadedSubs: new Set(), audio: [], images: [], shares: [], shareMenu: [], shareListeners: [], ads: [], adCloses: [] });
  const cfg = window.__WX_CONFIG;             // { files: {path: true}, sys, gameJson, launch }
  const SUBS = (cfg.gameJson.subPackages || []).map((s) => ({ name: s.name, root: s.root.replace(/\/?$/, '/') }));
  const err = (m) => { H.errors.push(m); console.error(`[wx-mock] ${m}`); };
  const checkPath = (p, what) => {
    const clean = String(p).replace(/^\.?\//, '');
    if (!cfg.files[clean]) err(`${what} 文件不存在: ${p}`);
    const sub = SUBS.find((s) => clean.startsWith(s.root));
    if (sub && !H.loadedSubs.has(sub.name)) err(`${what} 在分包 ${sub.name} 加载前访问: ${p}`);
    return clean;
  };
  let canvasCount = 0;
  const later = (fn, ms = 0) => setTimeout(fn, ms);
  const listeners = (o, names) => { for (const n of names) { const key = `_${n}`; o[key] = []; o[`on${n}`] = (cb) => o[key].push(cb); o[`off${n}`] = (cb) => { o[key] = cb ? o[key].filter((x) => x !== cb) : []; }; } };
  const fire = (o, n, arg) => { for (const cb of o[`_${n}`].slice()) cb(arg); };

  const api = {
    getWindowInfo: () => ({ ...cfg.win }),
    getSystemInfoSync: () => ({ ...cfg.win, ...cfg.sys }),
    getMenuButtonBoundingClientRect: () => ({ ...cfg.menu }),
    getLaunchOptionsSync: () => ({ ...cfg.launch }),
    createCanvas() {
      const c = document.createElement('canvas');
      if (canvasCount++ === 0) {
        c.id = 'wx-screen';
        c.style.cssText = `position:fixed;left:0;top:0;width:${cfg.win.windowWidth}px;height:${cfg.win.windowHeight}px`;
        document.body.appendChild(c);
        H.screen = c;
      }
      return c;
    },
    createImage() {
      const img = new window.Image();
      const desc = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src');
      Object.defineProperty(img, 'src', { get() { return desc.get.call(img); }, set(v) { const p = checkPath(v, '图片'); H.images.push(p); desc.set.call(img, p); } });
      return img;
    },
    onTouchStart: (cb) => { H.touches.start = cb; },
    onTouchMove: (cb) => { H.touches.move = cb; },
    onTouchEnd: (cb) => { H.touches.end = cb; },
    onTouchCancel: (cb) => { H.touches.cancel = cb; },
    onShow: (cb) => H.shows.push(cb),
    onHide: (cb) => H.hides.push(cb),
    getStorageSync: (k) => (k in H.storage ? H.storage[k] : ''),
    setStorageSync: (k, v) => { if (typeof k !== 'string') err('setStorageSync key 不是字符串'); H.storage[k] = v; },
    createInnerAudioContext() {
      const a = { src: '', loop: false, volume: 1, autoplay: false, paused: true, duration: 0, obeyMuteSwitch: true };
      listeners(a, ['Canplay', 'Play', 'Pause', 'Stop', 'Ended', 'Error', 'Waiting', 'TimeUpdate', 'Seeking', 'Seeked']);
      let src = '';
      Object.defineProperty(a, 'src', { get: () => src, set: (v) => { src = checkPath(v, '音频'); later(() => { a.duration = 1.2; fire(a, 'Canplay'); }, 5); } });
      // 循环 BGM (LoopTrack 两路接力，不用 loop)：按真实时间推进 currentTime，不在 400ms 时假结束
      const isLoopBgm = () => /\/bgm\/bgm_(?!reveal)/.test(src);
      let t0 = 0; let pos0 = 0;
      Object.defineProperty(a, 'currentTime', { get: () => (a.paused ? pos0 : pos0 + (Date.now() - t0) / 1000), set: () => err('InnerAudioContext.currentTime 是只读的，要用 seek()') });
      a.play = () => { if (!src) err('InnerAudioContext.play() 没有 src'); if (a.paused) { t0 = Date.now(); } a.paused = false; H.audio.push({ src, t: Date.now(), volume: a.volume }); later(() => fire(a, 'Play')); if (!a.loop && !isLoopBgm()) later(() => { if (!a.paused) { a.paused = true; fire(a, 'Ended'); } }, 400); };
      a.pause = () => { if (!a.paused) pos0 = a.currentTime; a.paused = true; fire(a, 'Pause'); };
      a.stop = () => { a.paused = true; pos0 = 0; fire(a, 'Stop'); };
      a.seek = (t) => { pos0 = t; t0 = Date.now(); H.seeks = (H.seeks || 0) + 1; };
      a.destroy = () => { a.paused = true; a.destroyed = true; };
      H.audioCount = (H.audioCount || 0) + 1;
      return a;
    },
    loadSubpackage({ name, success, fail, complete }) {
      const s = SUBS.find((x) => x.name === name || x.root === name || x.root === `${name}/`);
      const task = { _p: [], onProgressUpdate(cb) { this._p.push(cb); } };
      later(() => {
        if (!s) { err(`loadSubpackage 未知分包 ${name}`); if (fail) fail({ errMsg: 'loadSubpackage: fail' }); if (complete) complete(); return; }
        for (const cb of task._p) cb({ progress: 100, totalBytesWritten: 1, totalBytesExpectedToWrite: 1 });
        H.loadedSubs.add(s.name);
        try { window.__wxRequire(`${s.root}game.js`); } catch (e) { err(`分包入口出错 ${e}`); }
        if (success) success({ errMsg: 'loadSubpackage: ok' });
        if (complete) complete();
      }, 60);
      return task;
    },
    createRewardedVideoAd({ adUnitId, multiton, disableFallbackSharePage }) {
      void multiton; void disableFallbackSharePage;
      if (!adUnitId) err('createRewardedVideoAd 缺少 adUnitId');
      const ad = {};
      listeners(ad, ['Load', 'Error', 'Close']);
      ad.load = () => Promise.resolve();
      ad.show = () => { H.ads.push({ adUnitId, t: Date.now() }); later(() => { H.adCloses.push(cfg.adEnded !== false); fire(ad, 'Close', { isEnded: cfg.adEnded !== false }); }, 300); return Promise.resolve(); };
      ad.destroy = () => {};
      return ad;
    },
    // 转发：wx.shareAppMessage 没有 success/fail 回调 (官方文档参数只有 title/imageUrl/query/imageUrlId/toCurrentGroup/path)
    shareAppMessage(o) {
      const allowed = ['title', 'imageUrl', 'query', 'imageUrlId', 'toCurrentGroup', 'path'];
      for (const k of Object.keys(o || {})) if (!allowed.includes(k)) err(`shareAppMessage 有未核对的参数 ${k}`);
      if (o.imageUrl) checkPath(o.imageUrl, '转发图片');
      if (o.query && !/^([^=&]+=[^=&]*)(&[^=&]+=[^=&]*)*$/.test(o.query)) err(`shareAppMessage query 格式不对 ${o.query}`);
      H.shares.push(JSON.parse(JSON.stringify(o)));
    },
    showShareMenu(o = {}) {
      for (const m of o.menus || []) if (!['shareAppMessage', 'shareTimeline'].includes(m)) err(`showShareMenu menus 不合法 ${m}`);
      H.shareMenu.push(o.menus || []);
    },
    onShareAppMessage(cb) { if (typeof cb !== 'function') err('onShareAppMessage 需要函数'); H.shareListeners.push(cb); },
  };
  window.__wxApi = api;
  window.__wx = new Proxy(api, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (!(k in t)) { err(`访问了模拟器里没有 (未核对) 的接口 wx.${k}`); return undefined; }
      H.log.push(k);
      return t[k];
    },
    has(t, k) { return k in t; },
  });

  // ---- 极简 CommonJS：game.js / game-config.js / js/main.js / 分包 game.js
  const SHADOW = ['window', 'document', 'self', 'localStorage', 'sessionStorage', 'Image', 'Audio', 'AudioContext', 'webkitAudioContext', 'OfflineAudioContext',
    'navigator', 'location', 'performance', 'HTMLCanvasElement', 'HTMLImageElement', 'fetch', 'XMLHttpRequest', 'alert'];
  const GG = (window.__GG = {});
  const cache = {};
  const norm = (p) => { const out = []; for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); } return out.join('/'); };
  const makeRequire = (base) => (p) => window.__wxRequire(norm(`${base}/${p}`));
  window.__wxRequire = (p) => {
    const full = norm(p);
    if (cache[full]) return cache[full].exports;
    const code = window.__WX_SOURCES[full];
    if (code == null) throw new Error(`require 找不到 ${full}`);
    const module = { exports: {} };
    cache[full] = module;
    const dir = full.includes('/') ? full.slice(0, full.lastIndexOf('/')) : '';
    // eslint-disable-next-line no-new-func
    const fn = new Function('module', 'exports', 'require', 'wx', 'tt', 'GameGlobal', 'globalThis', ...SHADOW, code);
    fn(module, module.exports, makeRequire(dir), window.__wx, undefined, GG, GG, ...SHADOW.map(() => undefined));
    return module.exports;
  };
}());

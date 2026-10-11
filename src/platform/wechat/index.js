/* global wx, GameGlobal */
// 微信小游戏平台实现。所有 wx.* 接口名均按微信开放文档 (developers.weixin.qq.com/minigame/dev/api/) 核对，见 docs/微信上架说明.md 附录。
// 运行环境没有 window / document / Image / Audio / localStorage，只有 wx.* 与 GameGlobal。
// - 画布：wx.createCanvas() 第一次调用得到上屏画布，之后得到离屏画布；图片：wx.createImage()
// - 触摸：wx.onTouchStart / onTouchMove / onTouchEnd / onTouchCancel (Touch: identifier, clientX/clientY)
// - 屏幕：wx.getWindowInfo() (2.25.3+，低版本退回 wx.getSystemInfoSync)；右上角胶囊：wx.getMenuButtonBoundingClientRect()
// - 生命周期：wx.onShow / wx.onHide；启动参数 wx.getLaunchOptionsSync()
// - 音频：wx.createInnerAudioContext (iOS 不支持 ogg，全部 mp3)；音效用预渲染的小 mp3 (tools/render_sfx.mjs)
// - 分包：wx.loadSubpackage({ name })
// - 激励视频：wx.createRewardedVideoAd({ adUnitId })，onClose(res.isEnded)
// - 转发：wx.showShareMenu + wx.onShareAppMessage (右上角菜单)；wx.shareAppMessage (游戏内「给朋友看看这幅画」)
// 抖音专有的侧边栏复访、录屏分享在微信版里不提供 (platform.sidebar / platform.recorder 为 null，相关按钮自动不出现)。
import { MiniAudio } from '../mini/audio.js';

const G = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
const CFG = G.__WX_CONFIG__ || {};
const has = (name) => typeof wx !== 'undefined' && typeof wx[name] === 'function';
const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

// 上屏画布必须是第一次 createCanvas，模块加载时立刻创建
const mainCanvas = wx.createCanvas();
const windowInfo = () => (has('getWindowInfo') ? safe(() => wx.getWindowInfo(), null) : null) || (has('getSystemInfoSync') ? safe(() => wx.getSystemInfoSync(), {}) : {}) || {};
const sys = windowInfo();

// ---------------------------------------------------------------- 生命周期
const life = { hidden: false, lastShow: null, listeners: [] };
life.lastShow = has('getLaunchOptionsSync') ? safe(() => wx.getLaunchOptionsSync(), null) : null;
if (has('onShow')) {
  wx.onShow((res) => {
    life.hidden = false;
    life.lastShow = res || {};
    for (const cb of life.listeners) cb(false, res || {});
  });
}
if (has('onHide')) {
  wx.onHide(() => {
    life.hidden = true;
    for (const cb of life.listeners) cb(true, {});
  });
}

// ---------------------------------------------------------------- 转发 (右上角菜单「转发」)
const SHARE_IMAGE = 'assets/share.jpg';          // 5:4，主包里 (官方：显示图片长宽比 5:4)
const shareCard = (extra) => {
  const o = { title: CFG.shareTitle || '拧下螺丝，把画一块块拆出来', imageUrl: SHARE_IMAGE, query: '' };
  if (CFG.shareImageUrlId) o.imageUrlId = CFG.shareImageUrlId;   // MP 后台审核通过的转发图片编号 (可选)
  return Object.assign(o, extra || {});
};
if (has('showShareMenu')) safe(() => wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] }));
if (has('onShareAppMessage')) wx.onShareAppMessage(() => shareCard());

// ---------------------------------------------------------------- 资源路径：语音 / 音乐 / 插画在分包里 (与抖音版相同的目录布局)
const SUB_MAP = [
  ['assets/audio/voice/', 'sub_voice/voice/'],
  ['assets/audio/bgm/', 'sub_bgm/bgm/'],
  ['assets/images/cg/', 'sub_cg/cg/'],
];

let inputBound = false;

export const platform = {
  name: 'wechat',
  isDouyin: false,
  isWechat: true,
  isMini: true,
  sfxMode: 'sampled',          // 音效：预渲染 mp3 (InnerAudioContext 池)
  audioExt: 'mp3',
  config: CFG,
  bgmLoops: G.__WX_BGM_LOOPS__ || null,   // 循环曲垫片信息 (构建生成的 bgm-loops.js)，LoopTrack 用
  systemInfo: sys,

  getMainCanvas() { return mainCanvas; },

  createCanvas(w = 1, h = 1) {
    const c = wx.createCanvas();
    c.width = w; c.height = h;
    return c;
  },

  createImage() { return wx.createImage(); },

  now() { return Date.now(); },

  raf(fn) { return requestAnimationFrame(fn); },

  assetPath(p) {
    for (const [a, b] of SUB_MAP) if (p.startsWith(a)) return b + p.slice(a.length);
    return p;
  },

  /** 上屏画布铺满屏幕；9:16 逻辑画面放进安全区 (并避开右上角胶囊按钮)，居中，四周留边 */
  layout(canvas, W, H) {
    const s = windowInfo() || sys;
    const ww = s.windowWidth || s.screenWidth || W;
    const wh = s.windowHeight || s.screenHeight || H;
    const dpr = Math.min(s.pixelRatio || 2, 2);
    canvas.width = Math.max(1, Math.round(ww * dpr));
    canvas.height = Math.max(1, Math.round(wh * dpr));
    const sa = s.safeArea && s.safeArea.height > 0 ? s.safeArea : { left: 0, right: ww, top: 0, bottom: wh };
    let top = sa.top || 0;
    const menu = has('getMenuButtonBoundingClientRect') ? safe(() => wx.getMenuButtonBoundingClientRect(), null) : null;
    if (menu && menu.bottom > 0 && menu.bottom < wh * 0.2) top = Math.max(top, menu.bottom + 4);
    const bottom = Math.min(wh, sa.bottom || wh);
    const left = sa.left || 0; const right = Math.min(ww, sa.right || ww);
    const scale = Math.min(((right - left) * dpr) / W, ((bottom - top) * dpr) / H);
    const offX = Math.round(left * dpr + ((right - left) * dpr - W * scale) / 2);
    const offY = Math.round(top * dpr + ((bottom - top) * dpr - H * scale) / 2);
    this._touchScale = dpr;
    return { scale, offX, offY, letterbox: true };
  },

  onResize() { /* 竖屏固定 (game.json deviceOrientation: portrait) */ },

  onVisibility(cb) { life.listeners.push(cb); },

  isHidden() { return life.hidden; },

  bindInput(canvas, h) {
    if (inputBound) return;
    inputBound = true;
    const k = () => this._touchScale || 1;
    const xy = (t) => [(t.clientX != null ? t.clientX : t.pageX) * k(), (t.clientY != null ? t.clientY : t.pageY) * k(), 'touch'];
    const each = (e, fn) => { for (const t of (e && e.changedTouches) || []) fn(t); };
    wx.onTouchStart((e) => each(e, (t) => h.down(t.identifier, ...xy(t))));
    wx.onTouchMove((e) => each(e, (t) => h.move(t.identifier, ...xy(t))));
    wx.onTouchEnd((e) => each(e, (t) => h.up(t.identifier, ...xy(t))));
    wx.onTouchCancel((e) => each(e, (t) => h.up(t.identifier, ...xy(t))));
  },

  hasAudio() { return has('createInnerAudioContext'); },
  createAudio(src) { return new MiniAudio(wx, src); },
  createWebAudioContext() { return null; },

  /** 分包加载；基础库没有 loadSubpackage 时退回 require (低版本整包) */
  loadSubpackage(name, onProgress) {
    return new Promise((resolve) => {
      if (!has('loadSubpackage')) {
        try { require(`${name}/game.js`); } catch (_) { /* ignore */ }
        resolve(true);
        return;
      }
      const task = wx.loadSubpackage({ name, success: () => resolve(true), fail: (e) => { console.warn('[subpackage]', name, e); resolve(false); } });
      if (task && task.onProgressUpdate && onProgress) task.onProgressUpdate((r) => onProgress((r.progress || 0) / 100));
    });
  },

  expose(game) { G.__ANIME_SCREW__ = game; },

  /** 激励视频：wx.createRewardedVideoAd；onClose(res.isEnded) 为看完 */
  createRewardedAd(adUnitId) { return has('createRewardedVideoAd') ? wx.createRewardedVideoAd({ adUnitId }) : null; },

  /** 游戏内主动转发 (给朋友看看这幅画)：wx.shareAppMessage */
  shareMessage({ title, query }) {
    if (!has('shareAppMessage')) return false;
    wx.shareAppMessage(shareCard({ title, query: query || '' }));
    return true;
  },

  recorder: null,       // 抖音专有 (录屏分享)，微信版不提供
  sidebar: null,        // 抖音专有 (侧边栏复访)，微信版不提供
  shareVideo: null,
};

/* global tt, GameGlobal */
// 抖音小游戏平台实现。所有 tt.* 接口名均按抖音开放平台官方文档核对 (见 docs/抖音上架说明.md 附录)。
// 运行环境没有 window / document / Image / Audio / localStorage，只有 tt.* 与 GameGlobal。
// - 画布：tt.createCanvas() 第一次调用得到上屏画布，之后得到离屏画布
// - 图片：tt.createImage()
// - 触摸：tt.onTouchStart / onTouchMove / onTouchEnd / onTouchCancel (Touch: identifier, screenX/screenY)
// - 生命周期：tt.onShow / tt.onHide (onShow 在 game.js 运行时同步注册，侧边栏复访要求)
// - 音频：tt.createInnerAudioContext；音效用预渲染的小 mp3 (tools/render_sfx.mjs)
// - 分包：tt.loadSubpackage({ name })
// - 录屏：tt.getGameRecorderManager()；分享：tt.shareAppMessage({ channel: 'video', extra: { videoPath } })
// - 侧边栏：tt.checkScene / tt.navigateToScene ({ scene: 'sidebar' })；onShow 回调 launch_from='homepage' && location='sidebar_card'

import { MiniAudio } from '../mini/audio.js';

const G = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
const CFG = G.__DY_CONFIG__ || {};
const has = (name) => typeof tt !== 'undefined' && typeof tt[name] === 'function';
const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

// 上屏画布必须是第一次 createCanvas，模块加载时立刻创建
const mainCanvas = tt.createCanvas();
const sys = safe(() => tt.getSystemInfoSync(), {}) || {};

// ---------------------------------------------------------------- 生命周期 / 启动场景
const SIDEBAR_SCENE = '021036';
const isSidebarLaunch = (o) => !!o && ((o.launch_from === 'homepage' && o.location === 'sidebar_card') || o.scene === SIDEBAR_SCENE);
const life = { hidden: false, lastShow: null, fromSidebar: false, listeners: [] };
{
  const launch = has('getLaunchOptionsSync') ? safe(() => tt.getLaunchOptionsSync(), null) : null;
  life.lastShow = launch;
  life.fromSidebar = isSidebarLaunch(launch);
}
if (has('onShow')) {
  tt.onShow((res) => {
    life.hidden = false;
    life.lastShow = res || {};
    life.fromSidebar = isSidebarLaunch(res);      // 以最新一次 onShow 为准 (热启动)
    for (const cb of life.listeners) cb(false, res || {});
  });
}
if (has('onHide')) {
  tt.onHide(() => {
    life.hidden = true;
    for (const cb of life.listeners) cb(true, {});
  });
}

// ---------------------------------------------------------------- 资源路径：语音 / 音乐 / 插画在分包里
const SUB_MAP = [
  ['assets/audio/voice/', 'sub_voice/voice/'],
  ['assets/audio/bgm/', 'sub_bgm/bgm/'],
  ['assets/images/cg/', 'sub_cg/cg/'],
];

// ---------------------------------------------------------------- 录屏 + 分享
function makeRecorder() {
  if (!has('getGameRecorderManager')) return null;
  const rm = safe(() => tt.getGameRecorderManager(), null);
  if (!rm) return null;
  const st = { recording: false, startAt: 0, video: null, wantKeep: false };
  rm.onStart(() => { st.recording = true; st.startAt = Date.now(); });
  rm.onStop((res) => {
    const len = (Date.now() - st.startAt) / 1000;
    st.recording = false;
    if (st.wantKeep && res && res.videoPath && len >= 3.2) st.video = { path: res.videoPath, len };
  });
  if (rm.onError) rm.onError((e) => { st.recording = false; console.warn('[recorder]', e); });
  return {
    /** 每关开始录 (最长 300 秒，官方上限) */
    start() {
      st.video = null; st.wantKeep = false;
      try { if (st.recording) rm.stop(); rm.start({ duration: 300 }); } catch (e) { console.warn('[recorder] start', e); }
    },
    /** keep=true：通关，留下视频给分享按钮；false：失败/退出，丢弃 */
    stop(keep) {
      st.wantKeep = !!keep;
      if (!keep) st.video = null;
      try { if (st.recording) rm.stop(); } catch (e) { console.warn('[recorder] stop', e); }
    },
    get video() { return st.video; },
    get recording() { return st.recording; },
  };
}

function shareVideo({ title, desc, videoPath, topics }) {
  return new Promise((resolve) => {
    if (!has('shareAppMessage')) { resolve(false); return; }
    const o = {
      channel: 'video',
      title, desc,
      query: '',
      extra: { videoPath, videoTopics: topics || [] },
      success: () => resolve(true),
      fail: (e) => { console.warn('[share video]', e); resolve(false); },
    };
    if (CFG.shareTemplateId) o.templateId = CFG.shareTemplateId;
    tt.shareAppMessage(o);
  });
}

// ---------------------------------------------------------------- 侧边栏复访
const sidebar = {
  /** cb(isExist) */
  check(cb) {
    if (!has('checkScene')) { cb(false); return; }
    tt.checkScene({ scene: 'sidebar', success: (res) => cb(!!(res && res.isExist)), fail: () => cb(false) });
  },
  navigate() {
    return new Promise((resolve) => {
      if (!has('navigateToScene')) { resolve(false); return; }
      tt.navigateToScene({ scene: 'sidebar', success: () => resolve(true), fail: (e) => { console.warn('[sidebar]', e); resolve(false); } });
    });
  },
  /** 最近一次 onShow (或冷启动参数) 是否来自首页侧边栏 */
  get fromSidebar() { return life.fromSidebar; },
};

let inputBound = false;

export const platform = {
  name: 'douyin',
  isDouyin: true,
  isMini: true,                // 小游戏环境 (抖音/微信)：分包、InnerAudioContext、无 DOM
  sfxMode: 'sampled',          // 音效：预渲染 mp3 (InnerAudioContext 池)
  audioExt: 'mp3',
  config: CFG,
  bgmLoops: G.__DY_BGM_LOOPS__ || null,   // 循环曲垫片信息 (构建生成的 bgm-loops.js)，LoopTrack 用
  systemInfo: sys,

  getMainCanvas() { return mainCanvas; },

  createCanvas(w = 1, h = 1) {
    const c = tt.createCanvas();
    c.width = w; c.height = h;
    return c;
  },

  createImage() { return tt.createImage(); },

  // 计时用 Date.now()：tt.getPerformance().now() 官方文档写单位是微秒，各端实现不一，避免换算出错
  now() { return Date.now(); },

  raf(fn) { return requestAnimationFrame(fn); },

  assetPath(p) {
    for (const [a, b] of SUB_MAP) if (p.startsWith(a)) return b + p.slice(a.length);
    return p;
  },

  /** 上屏画布铺满屏幕；9:16 逻辑画面放进安全区 (并避开右上角胶囊按钮)，居中，四周留边 */
  layout(canvas, W, H) {
    const s = safe(() => tt.getSystemInfoSync(), sys) || sys;
    const ww = s.windowWidth || s.screenWidth || W;
    const wh = s.windowHeight || s.screenHeight || H;
    const dpr = Math.min(s.pixelRatio || 2, 2);
    canvas.width = Math.max(1, Math.round(ww * dpr));
    canvas.height = Math.max(1, Math.round(wh * dpr));
    const sa = s.safeArea && s.safeArea.height > 0 ? s.safeArea : { left: 0, right: ww, top: 0, bottom: wh };
    let top = sa.top || 0;
    const menu = has('getMenuButtonLayout') ? safe(() => tt.getMenuButtonLayout(), null) : null;
    if (menu && menu.bottom > 0 && menu.bottom < wh * 0.2) top = Math.max(top, menu.bottom + 4);
    const bottom = Math.min(wh, sa.bottom || wh);
    const left = sa.left || 0; const right = Math.min(ww, sa.right || ww);
    const scale = Math.min(((right - left) * dpr) / W, ((bottom - top) * dpr) / H);
    const offX = Math.round(left * dpr + ((right - left) * dpr - W * scale) / 2);
    const offY = Math.round(top * dpr + ((bottom - top) * dpr - H * scale) / 2);
    this._touchScale = dpr;
    return { scale, offX, offY, letterbox: true };
  },

  onResize() { /* 竖屏固定，不需要 */ },

  onVisibility(cb) { life.listeners.push(cb); },

  isHidden() { return life.hidden; },

  bindInput(canvas, h) {
    if (inputBound) return;
    inputBound = true;
    const k = () => this._touchScale || 1;
    const xy = (t) => [(t.clientX != null ? t.clientX : t.screenX) * k(), (t.clientY != null ? t.clientY : t.screenY) * k(), 'touch'];
    const each = (e, fn) => { for (const t of (e && e.changedTouches) || []) fn(t); };
    tt.onTouchStart((e) => each(e, (t) => h.down(t.identifier, ...xy(t))));
    tt.onTouchMove((e) => each(e, (t) => h.move(t.identifier, ...xy(t))));
    tt.onTouchEnd((e) => each(e, (t) => h.up(t.identifier, ...xy(t))));
    tt.onTouchCancel((e) => each(e, (t) => h.up(t.identifier, ...xy(t))));
  },

  hasAudio() { return has('createInnerAudioContext'); },
  createAudio(src) { return new MiniAudio(tt, src); },
  createWebAudioContext() { return null; },

  /** 分包加载；基础库没有 loadSubpackage 时退回 require (低版本整包) */
  loadSubpackage(name, onProgress) {
    return new Promise((resolve) => {
      if (!has('loadSubpackage')) {
        try { require(`${name}/game.js`); } catch (_) { /* ignore */ }
        resolve(true);
        return;
      }
      const task = tt.loadSubpackage({ name, success: () => resolve(true), fail: (e) => { console.warn('[subpackage]', name, e); resolve(false); } });
      if (task && task.onProgressUpdate && onProgress) task.onProgressUpdate((r) => onProgress((r.progress || 0) / 100));
    });
  },

  expose(game) { G.__ANIME_SCREW__ = game; },

  /** 激励视频：tt.createRewardedVideoAd；onClose(res) 里 count>0 或 isEnded 为看完 (AdService 判断) */
  createRewardedAd(adUnitId) { return has('createRewardedVideoAd') ? tt.createRewardedVideoAd({ adUnitId }) : null; },

  /** 分享卡片 (给朋友看看这幅画) */
  shareMessage({ title, query, fail }) {
    if (!has('shareAppMessage')) return false;
    const o = { title, query, fail };
    if (CFG.shareTemplateId) o.templateId = CFG.shareTemplateId;
    tt.shareAppMessage(o);
    return true;
  },

  recorder: makeRecorder(),
  sidebar,
  shareVideo,
};

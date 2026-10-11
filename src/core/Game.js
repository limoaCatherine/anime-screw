// 游戏主类：持有 Canvas、事件总线、全局服务 (存档/音效/音乐/语音/广告) 与场景管理器，驱动主循环。
// 另外管一个全局弹窗栈 (设置、确认框、制作人员…) 和广告占位层，它们盖在任何场景之上。
import { GameConfig } from '../config/GameConfig.js';
import { platform } from '../platform/index.js';
import { EventBus } from './EventBus.js';
import { SceneManager } from './SceneManager.js';
import { AssetLoader } from './AssetLoader.js';
import { InputSystem } from '../systems/InputSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { VoiceSystem } from '../systems/VoiceSystem.js';
import { BgmSystem } from '../systems/BgmSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AdService } from '../systems/AdService.js';
import { AdOverlay } from '../ui/Panels.js';
import { drawText, roundRectPath } from '../ui/draw.js';
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { LevelSelectScene } from '../scenes/LevelSelectScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { GalleryScene } from '../scenes/GalleryScene.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = GameConfig.width;
    this.height = GameConfig.height;
    this.config = GameConfig;
    this.time = 0;
    this.pixelScale = 1;
    this.view = { scale: 1, offX: 0, offY: 0, letterbox: false };
    this.platform = platform;

    this.events = new EventBus();
    this.assets = new AssetLoader();
    this.save = new SaveSystem(GameConfig.storageKey);
    this.audio = new AudioSystem(this.events, this.save);
    this.voice = new VoiceSystem(this.events, this.save, this.audio);
    this.bgm = new BgmSystem(this.events, this.save, this.audio);
    this.ads = new AdService(this.events);
    this.input = new InputSystem(this);
    this.modals = [];
    this.adOverlay = new AdOverlay(this);
    this.toasts = [];

    this.scenes = new SceneManager(this);
    for (const S of [BootScene, MenuScene, LevelSelectScene, GameScene, GalleryScene]) this.scenes.register(new S(this));

    this.resize = this.resize.bind(this);
    platform.onResize(this.resize);
    // 切到后台 (网页 visibilitychange / 抖音 tt.onHide)：暂停主循环与语音；回到前台 (tt.onShow) 继续
    this.hidden = false;
    platform.onVisibility((hidden, info) => {
      this.hidden = hidden;
      if (hidden) this.voice.stop();
      else this.last = platform.now();
      this.events.emit(hidden ? 'app:hidden' : 'app:visible', info);
    });
    this.resize();
  }

  /** 等比缩放 (9:16)，按设备像素比提高清晰度；平台层决定画布尺寸与留边 */
  resize() {
    this.view = platform.layout(this.canvas, this.width, this.height);
    this.pixelScale = this.view.scale;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  pushModal(m) { this.modals.push(m); return m; }
  get topModal() { return this.modals[this.modals.length - 1] || null; }

  toast(text, time = 1.8) { this.toasts.push({ text, t: 0, time }); }

  /** 弹窗 / 广告层优先吃掉输入 */
  captureInput(method, p) {
    const map = { onPointerDown: 'down', onPointerMove: 'move', onPointerUp: 'up' };
    const fn = map[method];
    if (this.adOverlay.active) { if (fn) this.adOverlay[fn](p); return true; }
    const m = this.topModal;
    if (m) { if (fn) m[fn](p); return method !== 'onKeyDown' || true; }
    return false;
  }

  start() {
    this.scenes.change('boot', {}, { transition: false });
    this.last = platform.now();
    const loop = () => {
      const now = platform.now();
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (!this.hidden) this.tick(dt);
      platform.raf(loop);
    };
    platform.raf(loop);
  }

  tick(dt) {
    this.time += dt;
    this.ads.update(dt);
    this.scenes.update(dt);
    for (const m of this.modals) m.update && m.update(dt);
    this.modals = this.modals.filter((m) => !m.closed);
    this.voice.update(dt);
    this.bgm.update(dt);
    this.audio.update(dt);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.time);
    const ctx = this.ctx;
    const v = this.view;
    if (v.letterbox) {
      // 抖音：画布铺满全屏，逻辑画面四周的留边涂成墙色，并裁掉画面外的绘制
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = GameConfig.letterboxColor || '#2b211b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(v.scale, 0, 0, v.scale, v.offX, v.offY);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, this.width, this.height); ctx.clip();
    } else {
      ctx.setTransform(v.scale, 0, 0, v.scale, v.offX, v.offY);
      ctx.clearRect(0, 0, this.width, this.height);
    }
    this.scenes.render(ctx);
    for (const m of this.modals) m.render(ctx, dt);
    if (this.adOverlay.active) this.adOverlay.render(ctx, dt);
    this.renderToasts(ctx);
    if (v.letterbox) ctx.restore();
  }

  /** 画布像素 → 逻辑坐标 */
  toLogical(px, py) {
    const v = this.view;
    return { x: (px - v.offX) / v.scale, y: (py - v.offY) / v.scale };
  }

  renderToasts(ctx) {
    this.toasts.forEach((t, i) => {
      const a = Math.min(1, t.t / 0.15, (t.time - t.t) / 0.3);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `bold 17px ${GameConfig.fontFamily}`;
      const w = ctx.measureText(t.text).width + 40;
      const y = 720 - i * 50 - (1 - a) * 10;
      roundRectPath(ctx, this.width / 2 - w / 2, y - 21, w, 42, 21);
      ctx.fillStyle = 'rgba(40,26,18,0.88)'; ctx.fill();
      drawText(ctx, t.text, this.width / 2, y + 1, { size: 17, color: '#fff4e2' });
      ctx.restore();
    });
  }
}

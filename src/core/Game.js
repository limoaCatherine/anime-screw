// 游戏主类：持有 Canvas、事件总线、全局服务 (存档/音效/音乐/语音/广告) 与场景管理器，驱动主循环。
// 另外管一个全局弹窗栈 (设置、确认框、制作人员…) 和广告占位层，它们盖在任何场景之上。
import { GameConfig } from '../config/GameConfig.js';
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
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    document.addEventListener('visibilitychange', () => this.events.emit(document.hidden ? 'app:hidden' : 'app:visible'));
    this.resize();
  }

  /** 等比缩放到窗口 (9:16)，按设备像素比提高清晰度 */
  resize() {
    const vw = window.innerWidth || this.width;
    const vh = window.innerHeight || this.height;
    const scale = Math.min(vw / this.width, vh / this.height);
    const cssW = Math.floor(this.width * scale);
    const cssH = Math.floor(this.height * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.pixelScale = this.canvas.width / this.width;
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
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.tick(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
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
    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.scenes.render(ctx);
    for (const m of this.modals) m.render(ctx, dt);
    if (this.adOverlay.active) this.adOverlay.render(ctx, dt);
    this.renderToasts(ctx);
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

// 启动场景：加载图片与语音，显示进度，然后进入主界面。
import { Scene } from '../core/Scene.js';
import { GameConfig } from '../config/GameConfig.js';
import { CHAPTERS } from '../config/LevelConfig.js';
import { drawText, roundRectPath, drawWall } from '../ui/draw.js';

export class BootScene extends Scene {
  constructor(game) { super(game, 'boot'); this.progress = 0; }

  enter() {
    const images = [];
    for (let i = 1; i <= 11; i++) {
      const key = `girl_${String(i).padStart(2, '0')}`;
      images.push({ key, src: `assets/images/chars/${key}.png`, color: '#d9b38c', label: String(i) });
    }
    for (const ch of CHAPTERS) images.push({ key: ch.cg, src: `assets/images/cg/${ch.cg}.jpg`, color: '#8a6a48', label: '画' });
    let pi = 0; let pv = 0;
    const update = () => { this.progress = pi * 0.7 + pv * 0.3; };
    Promise.all([
      this.game.assets.loadImages(images, (p) => { pi = p; update(); }),
      this.game.voice.preload((p) => { pv = p; update(); }),
    ]).then(() => {
      this.done = true;
      setTimeout(() => this.game.scenes.change('menu'), 150);
    });
  }

  render(ctx) {
    const W = GameConfig.width; const H = GameConfig.height;
    drawWall(ctx, '#6f5a48');
    drawText(ctx, GameConfig.title, W / 2, H * 0.4, { size: 54, serif: true, color: '#fbf0dc', shadow: 'rgba(0,0,0,0.5)' });
    drawText(ctx, '正在把画搬进来…', W / 2, H * 0.4 + 60, { size: 16, color: 'rgba(251,240,220,0.75)', weight: 'normal' });
    roundRectPath(ctx, W / 2 - 140, H * 0.58, 280, 12, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    roundRectPath(ctx, W / 2 - 140, H * 0.58, 280 * Math.max(0.03, this.progress), 12, 6);
    ctx.fillStyle = GameConfig.colors.copper; ctx.fill();
  }
}

// 主界面：标题、当前这幅画的拆封进度、开拆 / 选关 / 画册 / 设置。
import { Scene } from '../core/Scene.js';
import { GameConfig } from '../config/GameConfig.js';
import { LEVELS, CHAPTERS } from '../config/LevelConfig.js';
import { CHARACTERS } from '../config/VoiceConfig.js';
import { Button } from '../ui/Button.js';
import { Icons } from '../ui/Icons.js';
import { SettingsPanel } from '../ui/Panels.js';
import { drawText, drawWall, drawPortrait, roundRectPath } from '../ui/draw.js';
import { drawCG, drawFrame } from '../render/CGView.js';

const W = GameConfig.width;

export class MenuScene extends Scene {
  constructor(game) { super(game, 'menu'); }

  enter() {
    const g = this.game;
    g.bgm.play('gallery');
    const save = g.save;
    const cur = Math.min(save.data.unlocked, LEVELS.length - 1);
    this.level = LEVELS[cur];
    this.chapter = Math.floor(cur / 10);
    const allDone = Object.keys(save.data.cleared).length >= LEVELS.length;
    const mk = (o) => { const b = new Button(o); b.events = g.events; return b; };
    this.buttons = [
      mk({ x: W / 2, y: 742, w: 300, h: 70, style: 'primary', label: allDone ? '再拆一遍' : '开拆', sub: `第 ${cur + 1} 关 · ${this.level.sub}`, fontSize: 30,
        onClick: () => g.scenes.change('game', { level: cur }) }),
      mk({ x: W / 2 - 78, y: 830, w: 144, h: 54, style: 'secondary', label: '选关', fontSize: 22, onClick: () => g.scenes.change('select') }),
      mk({ x: W / 2 + 78, y: 830, w: 144, h: 54, style: 'secondary', label: '画册', fontSize: 22, onClick: () => g.scenes.change('gallery') }),
      mk({ x: W - 40, y: 40, w: 52, h: 52, style: 'icon', icon: Icons.gear, onClick: () => g.pushModal(new SettingsPanel(g)) }),
    ];
  }

  render(ctx) {
    const g = this.game;
    const ch = CHAPTERS[this.chapter];
    drawWall(ctx, ch.theme.wall);
    // 标题
    drawText(ctx, GameConfig.title, W / 2, 92, { size: 56, serif: true, color: '#fbf0dc', shadow: 'rgba(0,0,0,0.55)' });
    drawText(ctx, '把画上的板子，一块块拆下来', W / 2, 146, { size: 16, color: 'rgba(251,240,220,0.8)', weight: 'normal' });
    // 当前这幅画
    const fx = 120; const fy = 196; const fw = 300; const fh = fw * (891 / 726);
    drawFrame(ctx, fx, fy, fw, fh, ch.theme.frame, 12);
    drawCG(ctx, g, fx, fy, fw, fh, { chapter: this.chapter, owned: (i) => g.save.hasFragment(this.chapter * 10 + i), time: this.time, labels: false });
    const n = g.save.fragmentsOf(this.chapter);
    roundRectPath(ctx, W / 2 - 92, fy + fh + 20, 184, 30, 15);
    ctx.fillStyle = 'rgba(30,20,14,0.55)'; ctx.fill();
    drawText(ctx, `《${ch.title}》 ${n} / 10`, W / 2, fy + fh + 35, { size: 15, color: '#fbe9cc' });
    // 铆铆
    const riri = CHARACTERS.riri;
    const bob = Math.sin(this.time * 2) * 3;
    ctx.beginPath(); ctx.arc(70, 600 + bob, 44, 0, Math.PI * 2); ctx.fillStyle = riri.color; ctx.fill();
    drawPortrait(ctx, g.assets.getImage(riri.key), 70, 600 + bob, 41);
    drawText(ctx, riri.name, 70, 656, { size: 13, color: '#fbe9cc', stroke: 'rgba(30,20,14,0.8)', strokeWidth: 3 });
    for (const b of this.buttons) b.render(ctx, 1 / 60);
    drawText(ctx, `v${GameConfig.version}  ·  上海盖姆艾尔网络科技有限公司`, W / 2, 935, { size: 11, color: 'rgba(251,240,220,0.45)', weight: 'normal' });
  }
}

// 画册：每页一幅画，拆出来的碎片是彩色的；拆齐 10 块能看到这幅画的故事。
import { Scene } from '../core/Scene.js';
import { GameConfig } from '../config/GameConfig.js';
import { CHAPTERS } from '../config/LevelConfig.js';
import { CHARACTERS } from '../config/VoiceConfig.js';
import { Button } from '../ui/Button.js';
import { Icons } from '../ui/Icons.js';
import { drawText, drawWall, drawParagraph, drawPortrait, roundRectPath } from '../ui/draw.js';
import { drawCG, drawFrame } from '../render/CGView.js';
import { shareChapter } from '../systems/ShareService.js';

const W = GameConfig.width;

export class GalleryScene extends Scene {
  constructor(game) { super(game, 'gallery'); }

  enter(data = {}) {
    const g = this.game;
    g.bgm.play('gallery');
    this.page = data.chapter != null ? data.chapter : Math.min(2, Math.floor(g.save.data.unlocked / 10));
    this.zoom = false;
    this.slide = 0;
    const mk = (o) => { const b = new Button(o); b.events = g.events; return b; };
    this.back = mk({ x: 40, y: 38, w: 52, h: 52, style: 'icon', icon: Icons.back, onClick: () => g.scenes.change(data.from || 'menu') });
    this.prev = mk({ x: 34, y: 360, w: 44, h: 64, style: 'icon', icon: Icons.left, onClick: () => this.go(-1) });
    this.next = mk({ x: W - 34, y: 360, w: 44, h: 64, style: 'icon', icon: Icons.right, onClick: () => this.go(1) });
    this.share = mk({ x: W / 2, y: 892, w: 300, h: 58, style: 'primary', label: '给朋友看看这幅画', fontSize: 21, icon: Icons.share, onClick: () => shareChapter(g, this.page) });
    this.buttons = [this.back, this.prev, this.next, this.share];
  }

  go(d) {
    const p = this.page + d;
    if (p < 0 || p >= CHAPTERS.length) return;
    this.page = p;
    this.slide = d;
    this.game.events.emit('ui:page');
  }

  onPointerDown(p) {
    if (this.zoom) { this.zoom = false; return true; }
    if (super.onPointerDown(p)) return true;
    if (p.x > 90 && p.x < W - 90 && p.y > 90 && p.y < 560) { this.zoom = true; return true; }
    this.swipe = p.x;
    return false;
  }

  onPointerUp(p) {
    if (super.onPointerUp(p)) return true;
    if (this.swipe != null && Math.abs(p.x - this.swipe) > 60) this.go(p.x < this.swipe ? 1 : -1);
    this.swipe = null;
    return false;
  }

  update(dt) {
    super.update(dt);
    this.slide *= Math.exp(-dt * 10);
    this.prev.visible = this.page > 0;
    this.next.visible = this.page < CHAPTERS.length - 1;
    this.share.visible = this.game.save.fragmentsOf(this.page) > 0;
  }

  render(ctx) {
    const g = this.game;
    const c = this.page;
    const ch = CHAPTERS[c];
    const n = g.save.fragmentsOf(c);
    drawWall(ctx, ch.theme.wall);
    drawText(ctx, '画册', W / 2, 38, { size: 24, serif: true, color: '#fbf0dc' });
    ctx.save();
    ctx.translate(this.slide * 60, 0);
    const fw = 340; const fh = fw * (891 / 726); const fx = (W - fw) / 2; const fy = 92;
    drawFrame(ctx, fx, fy, fw, fh, ch.theme.frame, 12);
    drawCG(ctx, g, fx, fy, fw, fh, { chapter: c, owned: (i) => g.save.hasFragment(c * 10 + i), labels: true });
    drawText(ctx, ch.title, W / 2, fy + fh + 44, { size: 30, serif: true, color: '#fbf0dc' });
    drawText(ctx, n >= 10 ? '整幅拆齐了' : `已拆 ${n} / 10 块`, W / 2, fy + fh + 78, { size: 15, color: n >= 10 ? '#a8e0b4' : '#f1c48f' });
    const who = CHARACTERS[ch.char];
    const y = fy + fh + 112;
    roundRectPath(ctx, 40, y, W - 80, 168, 16);
    ctx.fillStyle = 'rgba(251,244,230,0.92)'; ctx.fill();
    ctx.beginPath(); ctx.arc(80, y + 38, 26, 0, Math.PI * 2); ctx.fillStyle = who.color; ctx.fill();
    drawPortrait(ctx, g.assets.getImage(who.key), 80, y + 38, 24);
    drawText(ctx, who.name, 116, y + 30, { size: 18, align: 'left' });
    drawText(ctx, who.role, 116, y + 52, { size: 13, align: 'left', color: GameConfig.colors.inkLight, weight: 'normal' });
    if (n >= 10) drawParagraph(ctx, ch.story, W / 2, y + 88, W - 120, { size: 14, color: GameConfig.colors.ink, lineHeight: 1.6 });
    else drawParagraph(ctx, '拆齐 10 块，就能看到这幅画背后的事。', W / 2, y + 104, W - 120, { size: 15, color: GameConfig.colors.inkLight });
    ctx.restore();
    // 页码点
    for (let i = 0; i < CHAPTERS.length; i++) {
      ctx.beginPath(); ctx.arc(W / 2 + (i - 1) * 18, 850, i === c ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === c ? '#fbe9cc' : 'rgba(251,233,204,0.35)'; ctx.fill();
    }
    for (const b of this.buttons) b.render(ctx, 1 / 60);
    if (this.zoom) {
      ctx.fillStyle = 'rgba(12,8,6,0.94)';
      ctx.fillRect(0, 0, W, GameConfig.height);
      const zw = W - 20; const zh = zw * (891 / 726);
      drawCG(ctx, g, 10, (GameConfig.height - zh) / 2, zw, zh, { chapter: c, owned: (i) => g.save.hasFragment(c * 10 + i), labels: true });
      drawText(ctx, '点一下回去', W / 2, GameConfig.height - 40, { size: 13, color: 'rgba(255,255,255,0.5)', weight: 'normal' });
    }
  }
}

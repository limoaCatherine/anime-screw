// 选关地图：三幅画从上到下排开，每幅画下面一条钉子小路 (10 关)。拖动滚动，点钉子进关。
import { Scene } from '../core/Scene.js';
import { platform } from '../platform/index.js';
import { GameConfig } from '../config/GameConfig.js';
import { LEVELS, CHAPTERS } from '../config/LevelConfig.js';
import { CHARACTERS } from '../config/VoiceConfig.js';
import { Button } from '../ui/Button.js';
import { Icons } from '../ui/Icons.js';
import { drawText, drawWall, roundRectPath, drawPortrait, shade } from '../ui/draw.js';
import { drawCG, drawFrame } from '../render/CGView.js';
import { drawScrew } from '../render/ScrewArt.js';

const W = GameConfig.width; const H = GameConfig.height;
const TOP = 76;
const CH_H = 800;
const CH_COLORS = ['amber', 'green', 'violet'];
const ZIG = [-70, 50, 140, 60, -60, -140];   // 小路左右来回拐

export class LevelSelectScene extends Scene {
  constructor(game) { super(game, 'select'); }

  enter(data = {}) {
    const g = this.game;
    g.bgm.play('gallery');
    this.nodes = LEVELS.map((L, i) => {
      const c = Math.floor(i / 10); const k = i % 10;
      const y0 = TOP + c * CH_H + 260;
      return { i, x: W / 2 + ZIG[(k + c * 2) % ZIG.length], y: y0 + k * 52, chapter: c };
    });
    this.nextIndex = LEVELS.findIndex((L, i) => g.save.isUnlocked(i) && !g.save.isCleared(i));
    this.maxScroll = TOP + CHAPTERS.length * CH_H - H + 40;
    const focus = data.focus != null ? data.focus : g.save.data.unlocked;
    const n = this.nodes[Math.min(focus, LEVELS.length - 1)];
    this.scroll = Math.max(0, Math.min(this.maxScroll, n.y - H * 0.55));
    this.vel = 0;
    this.drag = null;
    const back = new Button({ x: 40, y: 38, w: 52, h: 52, style: 'icon', icon: Icons.back, onClick: () => g.scenes.change('menu') });
    back.events = g.events;
    this.buttons = [back];
  }

  onPointerDown(p) {
    if (super.onPointerDown(p)) return true;
    this.drag = { y: p.y, start: p.y, x: p.x, scroll: this.scroll, t: platform.now(), moved: 0, lastY: p.y };
    this.vel = 0;
    return true;
  }

  onPointerMove(p) {
    super.onPointerMove(p);
    if (!this.drag) return;
    const d = this.drag;
    this.scroll = Math.max(-60, Math.min(this.maxScroll + 60, d.scroll - (p.y - d.start)));
    d.moved = Math.max(d.moved, Math.abs(p.y - d.start));
    const now = platform.now();
    this.vel = (d.lastY - p.y) / Math.max(1, now - d.t) * 1000;
    d.lastY = p.y; d.t = now;
  }

  onPointerUp(p) {
    if (super.onPointerUp(p)) return true;
    const d = this.drag;
    this.drag = null;
    if (!d) return false;
    if (d.moved < 10) {
      this.vel = 0;
      const wy = p.y + this.scroll;
      for (const n of this.nodes) {
        if (Math.hypot(n.x - p.x, n.y - wy) < 30) {
          if (this.game.save.isUnlocked(n.i)) this.game.scenes.change('game', { level: n.i });
          else this.game.toast('前面那关还没拆完');
          return true;
        }
      }
    }
    return true;
  }

  update(dt) {
    super.update(dt);
    if (!this.drag) {
      this.scroll += this.vel * dt;
      this.vel *= Math.exp(-dt * 4);
      if (this.scroll < 0) { this.scroll += (0 - this.scroll) * Math.min(1, dt * 10); this.vel = 0; }
      if (this.scroll > this.maxScroll) { this.scroll += (this.maxScroll - this.scroll) * Math.min(1, dt * 10); this.vel = 0; }
    }
  }

  render(ctx) {
    const g = this.game;
    const save = g.save;
    drawWall(ctx, '#6a5646');
    ctx.save();
    ctx.translate(0, -this.scroll);
    CHAPTERS.forEach((ch, c) => {
      const y0 = TOP + c * CH_H;
      if (y0 + CH_H < this.scroll || y0 > this.scroll + H) return;
      // 章节底色
      roundRectPath(ctx, 14, y0 + 6, W - 28, CH_H - 20, 22);
      ctx.fillStyle = 'rgba(20,12,8,0.22)'; ctx.fill();
      // 画 + 标题
      const fw = 150; const fh = fw * (891 / 726);
      drawFrame(ctx, 40, y0 + 34, fw, fh, ch.theme.frame, 8);
      drawCG(ctx, g, 40, y0 + 34, fw, fh, { chapter: c, owned: (i) => save.hasFragment(c * 10 + i), paper: false });
      drawText(ctx, `第${'一二三'[c]}幅`, 220, y0 + 56, { size: 14, color: 'rgba(251,233,204,0.7)', align: 'left', weight: 'normal' });
      drawText(ctx, ch.title, 220, y0 + 90, { size: 32, serif: true, color: '#fbf0dc', align: 'left' });
      const n = save.fragmentsOf(c);
      drawText(ctx, `已拆 ${n} / 10`, 220, y0 + 126, { size: 15, color: '#f1c48f', align: 'left' });
      const who = CHARACTERS[ch.char];
      ctx.beginPath(); ctx.arc(244, y0 + 174, 24, 0, Math.PI * 2); ctx.fillStyle = who.color; ctx.fill();
      drawPortrait(ctx, g.assets.getImage(who.key), 244, y0 + 174, 22);
      drawText(ctx, `${who.name} · ${who.role}`, 278, y0 + 174, { size: 14, color: '#fbe9cc', align: 'left', weight: 'normal' });
      // 小路
      const ns = this.nodes.filter((nd) => nd.chapter === c);
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(251,233,204,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ns.forEach((nd, k) => (k ? ctx.lineTo(nd.x, nd.y) : ctx.moveTo(nd.x, nd.y)));
      ctx.stroke();
      ctx.restore();
      for (const nd of ns) {
        const L = LEVELS[nd.i];
        const unlocked = save.isUnlocked(nd.i);
        const cleared = save.isCleared(nd.i);
        const current = nd.i === this.nextIndex;
        const pulse = current ? 1 + Math.sin(this.time * 4) * 0.06 : 1;
        if (current) {
          ctx.beginPath(); ctx.arc(nd.x, nd.y, 30 + Math.sin(this.time * 4) * 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,220,150,0.25)'; ctx.fill();
        }
        drawScrew(ctx, nd.x, nd.y, { color: unlocked ? CH_COLORS[c] : null, hidden: !unlocked, blank: true, scale: 1.45 * pulse, rot: nd.i * 0.5 });
        if (!unlocked) { ctx.save(); ctx.translate(nd.x, nd.y + 1); Icons.lock(ctx, 22, '#f3ece2'); ctx.restore(); }
        if (unlocked) drawText(ctx, String(L.no), nd.x, nd.y + 1, { size: 17, color: '#fff', stroke: shade(GameConfig.screwColors[CH_COLORS[c]].hex, 0.5), strokeWidth: 4 });
        const right = nd.x < W / 2;
        const tx = nd.x + (right ? 36 : -36);
        drawText(ctx, L.sub, tx, nd.y - 2, { size: 15, color: unlocked ? '#fbe9cc' : 'rgba(251,233,204,0.4)', align: right ? 'left' : 'right', weight: cleared ? 'normal' : 'bold' });
        if (cleared) drawText(ctx, '已拆', tx, nd.y + 17, { size: 11, color: '#9fd6a8', align: right ? 'left' : 'right', weight: 'normal' });
        else if (current) drawText(ctx, '下一块', tx, nd.y + 17, { size: 11, color: '#ffd38a', align: right ? 'left' : 'right', weight: 'normal' });
      }
    });
    ctx.restore();
    // 顶栏
    const tg = ctx.createLinearGradient(0, 0, 0, 80);
    tg.addColorStop(0, 'rgba(40,28,20,0.95)'); tg.addColorStop(1, 'rgba(40,28,20,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 80);
    drawText(ctx, '选关', W / 2, 38, { size: 24, serif: true, color: '#fbf0dc' });
    for (const b of this.buttons) b.render(ctx, 1 / 60);
  }
}

// 画布按钮：按下缩放、悬停高亮；样式 primary (铜色) / secondary (纸色) / ghost / icon / item。
import { GameConfig } from '../config/GameConfig.js';
import { platform } from '../platform/index.js';
import { roundRectPath, drawText, shade } from './draw.js';

export class Button {
  constructor(o) {
    Object.assign(this, { style: 'primary', label: '', sub: '', fontSize: 24, visible: true, enabled: true, color: null, badge: null }, o);
    this.hover = false;
    this.pressed = false;
    this.scale = 1;
    this.flash = 0;
    this.events = null;   // 场景注入，用于点击音效
  }

  contains(p) {
    const pad = this.style === 'icon' ? 6 : 2;
    return p.x >= this.x - this.w / 2 - pad && p.x <= this.x + this.w / 2 + pad && p.y >= this.y - this.h / 2 - pad && p.y <= this.y + this.h / 2 + pad;
  }

  handleDown(p) {
    if (!this.visible) return false;
    if (this.contains(p)) { this.pressed = true; return true; }
    return false;
  }

  handleMove(p) { if (this.visible) this.hover = p.type !== 'touch' && this.contains(p); }

  handleUp(p) {
    if (!this.pressed) return false;
    this.pressed = false;
    if (this.contains(p)) {
      if (this.events) this.events.emit('ui:click');
      if (this.enabled) { this.onClick && this.onClick(); } else if (this.onDisabled) this.onDisabled();
      return true;
    }
    return false;
  }

  render(ctx, dt = 1 / 60) {
    if (!this.visible) return;
    const target = this.pressed ? 0.92 : this.hover ? 1.04 : 1;
    this.scale += (target - this.scale) * Math.min(1, dt * 18);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
    const { w, h } = this;
    const C = GameConfig.colors;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    if (!this.enabled && this.style !== 'item') ctx.globalAlpha *= 0.5;

    if (this.style === 'icon') {
      ctx.save();
      ctx.shadowColor = 'rgba(30,18,10,0.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.3);
      ctx.fillStyle = 'rgba(251,244,230,0.94)';
      ctx.fill();
      ctx.restore();
      if (this.icon) this.icon(ctx, Math.min(w, h), this);
      if (this.label) drawText(ctx, this.label, 0, 0, { size: this.fontSize, color: C.ink });
      ctx.restore();
      return;
    }

    if (this.style === 'item') {
      // 道具按钮：圆形铜框 + 图标 + 名字 + 数量角标
      const r = Math.min(w, h) / 2 - 10;
      ctx.save();
      ctx.shadowColor = 'rgba(30,18,10,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.beginPath(); ctx.arc(0, -8, r, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(0, -8 - r, 0, -8 + r);
      g.addColorStop(0, this.enabled ? '#fff7e8' : '#cfc6b8'); g.addColorStop(1, this.enabled ? '#ead6b4' : '#a89e90');
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, -8, r, 0, Math.PI * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = this.active ? '#e2683a' : (this.enabled ? C.copper : '#8b8178'); ctx.stroke();
      if (this.active) {
        ctx.beginPath(); ctx.arc(0, -8, r + 5 + Math.sin(platform.now() / 120) * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(226,104,58,0.7)'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.save(); ctx.translate(0, -8);
      if (!this.enabled) ctx.globalAlpha *= 0.45;
      if (this.icon) this.icon(ctx, r * 2);
      ctx.restore();
      drawText(ctx, this.label, 0, h / 2 - 9, { size: 13, color: this.enabled ? '#fff4e0' : '#cbbfae', stroke: 'rgba(40,24,14,0.7)', strokeWidth: 3 });
      if (this.locked) {
        ctx.fillStyle = 'rgba(40,28,20,0.55)';
        ctx.beginPath(); ctx.arc(0, -8, r, 0, Math.PI * 2); ctx.fill();
        drawText(ctx, this.locked, 0, -8, { size: 12, color: '#fff' });
      } else if (this.badge != null) {
        const bx = r * 0.78; const by = -8 - r * 0.78;
        ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2);
        ctx.fillStyle = this.badge === '+' ? '#3f8f5b' : '#d9673b'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        drawText(ctx, String(this.badge), bx, by + 1, { size: this.badge === '+' ? 16 : 13, color: '#fff' });
      }
      ctx.restore();
      return;
    }

    const primary = this.style === 'primary';
    const ghost = this.style === 'ghost';
    const base = this.color || (primary ? C.copper : '#efe2c8');
    const dark = primary ? shade(base, 0.62) : shade(base, 0.7);
    if (!ghost) {
      roundRectPath(ctx, -w / 2, -h / 2 + 4, w, h, Math.min(16, h / 2));
      ctx.fillStyle = dark; ctx.fill();
    }
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    if (ghost) { g.addColorStop(0, 'rgba(251,244,230,0.12)'); g.addColorStop(1, 'rgba(251,244,230,0.06)'); }
    else { g.addColorStop(0, shade(base, 1.15)); g.addColorStop(1, base); }
    roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(16, h / 2));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = ghost ? 1.5 : 1;
    ctx.strokeStyle = ghost ? 'rgba(251,244,230,0.6)' : 'rgba(255,255,255,0.35)';
    ctx.stroke();
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; ctx.fill(); }
    const tc = primary || ghost ? '#fffaf0' : C.ink;
    const ty = this.sub ? -8 : 1;
    drawText(ctx, this.label, this.icon ? 14 : 0, ty, { size: this.fontSize, color: tc, maxWidth: w - 20, stroke: primary ? shade(base, 0.55) : null, strokeWidth: 3 });
    if (this.sub) drawText(ctx, this.sub, 0, 14, { size: 13, color: primary || ghost ? 'rgba(255,248,235,0.85)' : C.inkLight, weight: 'normal', maxWidth: w - 16 });
    if (this.icon) { ctx.save(); ctx.translate(-w / 2 + 26, 0); this.icon(ctx, 26); ctx.restore(); }
    ctx.restore();
  }
}

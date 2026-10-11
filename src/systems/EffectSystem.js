// 表现特效：粒子 (火花 / 木屑 / 碎片 / 彩纸 / 冰碴)、扩散圈、飘字、屏幕轻微震动、闪光。
// 纯表现，不影响规则；由 GameScene 调用。
import { drawText } from '../ui/draw.js';

export class EffectSystem {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.shakeAmp = 0;
    this.shakeT = 0;
    this.flashA = 0;
    this.flashColor = '#fff';
  }

  clear() { this.parts = []; this.rings = []; this.texts = []; this.shakeAmp = 0; this.flashA = 0; }

  burst(x, y, { n = 10, colors = ['#fff'], speed = 160, size = 3, life = 0.6, gravity = 500, kind = 'dot', spread = Math.PI * 2, dir = -Math.PI / 2, drag = 1.5 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), t: 0,
        size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], kind, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, gravity, drag,
      });
    }
  }

  ring(x, y, { color = 'rgba(255,255,255,0.9)', r0 = 8, r1 = 34, life = 0.35, width = 3 } = {}) {
    this.rings.push({ x, y, color, r0, r1, life, t: 0, width });
  }

  text(x, y, str, { color = '#fff', size = 22, life = 0.9, stroke = 'rgba(40,24,14,0.75)', rise = 40 } = {}) {
    this.texts.push({ x, y, str, color, size, life, t: 0, stroke, rise });
  }

  shake(amp = 3) { this.shakeAmp = Math.max(this.shakeAmp, amp); }

  flash(color = '#fff', a = 0.5) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }

  get offset() {
    if (this.shakeAmp < 0.05) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * 2 * this.shakeAmp, y: (Math.random() - 0.5) * 2 * this.shakeAmp };
  }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.life);
    this.shakeAmp *= Math.exp(-dt * 14);
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
  }

  render(ctx) {
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const p of this.parts) {
      const k = p.t / p.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        ctx.fillRect(-p.size * 1.6, -0.6, p.size * 3.2, 1.2);
      } else if (p.kind === 'chip') {
        ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size, -p.size * 0.3); ctx.lineTo(p.size * 0.2, p.size * 0.8); ctx.closePath(); ctx.fill();
      } else if (p.kind === 'paper') {
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      } else if (p.kind === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const r = i % 2 ? p.size * 0.4 : p.size; const a = (i / 8) * Math.PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const t of this.texts) {
      const k = t.t / t.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.translate(t.x, t.y - t.rise * Math.sqrt(k));
      ctx.scale(pop, pop);
      drawText(ctx, t.str, 0, 0, { size: t.size, color: t.color, stroke: t.stroke, strokeWidth: 4 });
      ctx.restore();
    }
  }

  renderFlash(ctx, w, h) {
    if (this.flashA <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.flashA;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

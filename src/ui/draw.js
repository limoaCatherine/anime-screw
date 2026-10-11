// 通用绘制工具：圆角矩形、文字 (自动换行)、面板、纸张/木纹背景、缓动函数。
import { GameConfig } from '../config/GameConfig.js';

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function font(size, weight = 'bold', serif = false) {
  return `${weight} ${Math.round(size)}px ${serif ? GameConfig.serifFamily : GameConfig.fontFamily}`;
}

export function drawText(ctx, str, x, y, {
  size = 22, color = GameConfig.colors.ink, align = 'center', baseline = 'middle', weight = 'bold',
  stroke = null, strokeWidth = 4, shadow = null, serif = false, alpha = 1, maxWidth = 0,
} = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  let s = size;
  ctx.font = font(s, weight, serif);
  if (maxWidth) {
    while (s > 9 && ctx.measureText(str).width > maxWidth) { s -= 1; ctx.font = font(s, weight, serif); }
  }
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; }
  if (stroke) {
    ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth;
    ctx.strokeText(str, x, y);
    ctx.shadowColor = 'transparent';
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** 按宽度自动换行 (中文逐字，英文按词)，支持 \n；返回行数组 */
export function wrapLines(ctx, text, maxW, size, weight = 'normal', serif = false) {
  ctx.save();
  ctx.font = font(size, weight, serif);
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        // 不让标点出现在行首
        if (/[，。、！？；：”’）》…—,.!?]/.test(ch)) { out.push(test); line = ''; continue; }
        out.push(line); line = ch;
      } else line = test;
    }
    out.push(line);
  }
  ctx.restore();
  return out;
}

export function drawParagraph(ctx, text, x, y, maxW, { size = 16, lineHeight = 1.55, color = GameConfig.colors.ink, align = 'center', weight = 'normal', serif = false, alpha = 1 } = {}) {
  const lines = wrapLines(ctx, text, maxW, size, weight, serif);
  lines.forEach((l, i) => drawText(ctx, l, x, y + i * size * lineHeight, { size, color, align, weight, serif, alpha }));
  return lines.length * size * lineHeight;
}

/** 米色纸面板 (带细边与投影) */
export function drawPanel(ctx, x, y, w, h, r = 18, { fill = GameConfig.colors.paper, border = '#d9c3a0', shadow = true } = {}) {
  ctx.save();
  if (shadow) { ctx.shadowColor = 'rgba(40,24,12,0.35)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8; }
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRectPath(ctx, x + 6, y + 6, w - 12, h - 12, Math.max(4, r - 5));
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.restore();
}

export function dimScreen(ctx, alpha = 0.5) {
  ctx.save();
  ctx.fillStyle = `rgba(28,18,12,${alpha})`;
  ctx.fillRect(0, 0, GameConfig.width, GameConfig.height);
  ctx.restore();
}

// 背景墙：暖色墙面 + 细竖纹 + 光晕 (预渲染)
let wallCache = null;
export function drawWall(ctx, tint = '#7a6450') {
  const W = GameConfig.width; const H = GameConfig.height;
  if (!wallCache || wallCache.tint !== tint) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, shade(tint, 1.18)); grd.addColorStop(0.5, tint); grd.addColorStop(1, shade(tint, 0.62));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // 墙纸细纹
    g.globalAlpha = 0.06;
    for (let x = 0; x < W; x += 6) { g.fillStyle = x % 12 ? '#fff' : '#000'; g.fillRect(x, 0, 2, H); }
    g.globalAlpha = 1;
    const rg = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, H * 0.75);
    rg.addColorStop(0, 'rgba(255,236,200,0.28)'); rg.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    wallCache = { tint, c };
  }
  ctx.drawImage(wallCache.c, 0, 0);
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16); const b = parseInt(hexB.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 圆形头像：图片已是圆形透明 PNG */
export function drawPortrait(ctx, img, x, y, r, alpha = 1) {
  if (!img) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** 把插画按"旧照片"色调画出来 (没拆出来的碎片)；用混合模式实现，不读像素 (file:// 下也能用) */
export function drawSepia(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, amount = 0.85, dark = 0.55) {
  ctx.save();
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = amount;
  ctx.fillStyle = '#8a6a48';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = dark;
  ctx.fillStyle = '#6b5640';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
}

export const ease = {
  backOut: (t, s = 1.70158) => { const u = t - 1; return u * u * ((s + 1) * u + s) + 1; },
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicIn: (t) => t * t * t,
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  elasticOut: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export const clamp01 = (v) => Math.max(0, Math.min(1, v));

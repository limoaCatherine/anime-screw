// 板子外观：按材质 (橡木 / 胡桃木 / 紫铜 / 钢板 / 亚克力 / 玻璃) 程序生成纹理，
// 每块板子只渲染一次到离屏画布 (局部坐标，2 倍分辨率)，之后每帧按刚体位置/角度贴图。
import { makeRng } from '../systems/geom.js';
import { platform } from '../platform/index.js';
import { GameConfig } from '../config/GameConfig.js';

const SS = 2;   // 超采样

export const MATERIALS = {
  oak:     { name: '橡木', base: '#d6a467', dark: '#a8743f', light: '#f0cb92', grain: 'rgba(120,72,30,0.22)', kind: 'wood' },
  walnut:  { name: '胡桃木', base: '#82502f', dark: '#55301a', light: '#a8724a', grain: 'rgba(40,18,6,0.3)', kind: 'wood' },
  copper:  { name: '紫铜', base: '#c9773f', dark: '#8a4421', light: '#f1b07c', kind: 'metal' },
  steel:   { name: '钢板', base: '#aab3bd', dark: '#6c7580', light: '#e3e8ee', kind: 'metal' },
  acrylic: { name: '亚克力', base: '#9fd8ff', kind: 'clear', alpha: 0.62 },
  glass:   { name: '玻璃', base: '#d8f2ff', kind: 'clear', alpha: 0.24 },
};

function localPoly(b) {
  return b.verts0.map(([x, y]) => ({ x: x - b.c0.x, y: y - b.c0.y }));
}

function polyPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** 生成一块板的离屏贴图：{ canvas, ox, oy } (ox/oy = 局部原点在贴图里的位置，单位为逻辑像素) */
export function renderBoard(b) {
  const pts = localPoly(b);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const pad = 4;
  const w = Math.ceil(maxX - minX + pad * 2); const h = Math.ceil(maxY - minY + pad * 2);
  const c = platform.createCanvas(w * SS, h * SS);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  g.translate(pad - minX, pad - minY);
  const m = MATERIALS[b.mat] || MATERIALS.oak;
  const rng = makeRng(b.seed || 7);
  const bw = maxX - minX; const bh = maxY - minY;
  const horizontal = bw >= bh;

  g.save();
  polyPath(g, pts);
  g.clip();
  if (m.kind === 'wood') woodTexture(g, m, rng, minX, minY, bw, bh, horizontal);
  else if (m.kind === 'metal') metalTexture(g, m, rng, minX, minY, bw, bh, b.mat);
  else clearTexture(g, m, b, rng, minX, minY, bw, bh);
  // 螺丝孔
  for (const hp of b.holes) {
    const r = GameConfig.screw.radius * 0.62;
    const hg = g.createRadialGradient(hp.x - 2, hp.y - 2, 1, hp.x, hp.y, r + 1);
    hg.addColorStop(0, 'rgba(10,6,4,0.95)'); hg.addColorStop(0.75, 'rgba(25,16,10,0.85)'); hg.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = hg;
    g.beginPath(); g.arc(hp.x, hp.y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = m.kind === 'clear' ? 'rgba(255,255,255,0.7)' : 'rgba(255,240,220,0.35)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(hp.x, hp.y, r + 1.2, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  }
  g.restore();

  // 倒角：内侧高光 (左上) + 内侧阴影 (右下)
  g.save();
  polyPath(g, pts);
  g.clip();
  const bevel = m.kind === 'clear' ? 3 : 4;
  g.lineJoin = 'round';
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i]; const z = pts[(i + 1) % pts.length]; area2 += a.x * z.y - z.x * a.y; }
  const sgn = area2 >= 0 ? 1 : -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const z = pts[(i + 1) % pts.length];
    const nx = z.y - a.y; const ny = -(z.x - a.x);          // 外法线 (顺时针多边形) —— 用光照方向判断亮暗
    const len = Math.hypot(nx, ny) || 1;
    const lit = (-(nx * 0.6 + ny * 0.8) / len) * sgn;   // 外法线 · 光照方向 (光从左上来)
    g.strokeStyle = lit > 0 ? `rgba(255,250,235,${0.25 + lit * 0.4})` : `rgba(20,10,4,${0.15 - lit * 0.35})`;
    g.lineWidth = bevel * 2;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(z.x, z.y); g.stroke();
  }
  g.restore();
  g.save();
  polyPath(g, pts);
  g.lineWidth = 1.2;
  g.strokeStyle = m.kind === 'clear' ? 'rgba(255,255,255,0.85)' : 'rgba(30,16,8,0.55)';
  g.stroke();
  g.restore();

  return { canvas: c, ox: pad - minX, oy: pad - minY, w, h, pts };
}

function woodTexture(g, m, rng, x, y, w, h, horizontal) {
  const grd = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  grd.addColorStop(0, m.light); grd.addColorStop(0.45, m.base); grd.addColorStop(1, m.dark);
  g.fillStyle = grd;
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  // 木纹：沿长边方向的波浪线
  g.save();
  if (!horizontal) { g.translate(x + w / 2, y + h / 2); g.rotate(Math.PI / 2); g.translate(-(x + w / 2), -(y + h / 2)); }
  const L = Math.max(w, h) + 40; const S = Math.max(w, h);
  const cx = x + w / 2; const cy = y + h / 2;
  const lines = Math.floor(S / 3.2);
  const phase = rng() * 10;
  for (let i = 0; i < lines; i++) {
    const yy = cy - S / 2 + (i / lines) * S + rng() * 2;
    g.beginPath();
    for (let t = -20; t <= L; t += 8) {
      const xx = cx - L / 2 + t;
      const wave = Math.sin(t * 0.012 + i * 0.15 + phase) * 4 + Math.sin(t * 0.045 + i * 0.6) * 1.2;
      t === -20 ? g.moveTo(xx, yy + wave) : g.lineTo(xx, yy + wave);
    }
    g.strokeStyle = m.grain;
    g.globalAlpha = 0.35 + rng() * 0.65;
    g.lineWidth = 0.6 + rng() * 1.4;
    g.stroke();
  }
  g.globalAlpha = 1;
  // 节疤
  const knots = rng() < 0.6 ? 1 + rng.int(2) : 0;
  for (let k = 0; k < knots; k++) {
    const kx = cx + (rng() - 0.5) * L * 0.6; const ky = cy + (rng() - 0.5) * S * 0.4;
    for (let r = 9; r > 1; r -= 2) {
      g.beginPath(); g.ellipse(kx, ky, r * 1.8, r * 0.8, 0, 0, Math.PI * 2);
      g.strokeStyle = m.grain; g.lineWidth = 1; g.stroke();
    }
    g.fillStyle = 'rgba(60,30,10,0.35)';
    g.beginPath(); g.ellipse(kx, ky, 3, 1.5, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // 一层很淡的清漆光泽
  const sheen = g.createLinearGradient(x, y, x + w, y + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.14)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = sheen; g.fillRect(x, y, w, h);
}

function metalTexture(g, m, rng, x, y, w, h, mat) {
  const grd = g.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, m.light); grd.addColorStop(0.35, m.base); grd.addColorStop(0.62, m.light); grd.addColorStop(1, m.dark);
  g.fillStyle = grd;
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  // 拉丝纹
  for (let i = 0; i < h * 1.3; i++) {
    const yy = y + rng() * h;
    g.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${0.04 + rng() * 0.08})` : `rgba(0,0,0,${0.03 + rng() * 0.06})`;
    g.fillRect(x + rng() * w * 0.3 - 10, yy, w * (0.5 + rng() * 0.7), 0.6);
  }
  if (mat === 'copper') {
    // 一点铜绿和氧化斑
    for (let k = 0; k < 6; k++) {
      const px = x + rng() * w; const py = y + rng() * h; const r = 6 + rng() * 16;
      const pg = g.createRadialGradient(px, py, 0, px, py, r);
      pg.addColorStop(0, rng() < 0.4 ? 'rgba(80,160,130,0.18)' : 'rgba(90,40,15,0.16)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = pg; g.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }
  // 冲压的四角小铆钉
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(x, y, w, h * 0.12);
}

function clearTexture(g, m, b, rng, x, y, w, h) {
  const tint = b.mat === 'glass' ? m.base : (b.tint || m.base);
  g.globalAlpha = m.alpha;
  g.fillStyle = tint;
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.globalAlpha = 1;
  // 斜向高光条
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate(-0.6);
  const S = Math.max(w, h) * 1.5;
  g.fillStyle = `rgba(255,255,255,${b.mat === 'glass' ? 0.32 : 0.22})`;
  g.fillRect(-S / 2, -S * 0.22, S, S * 0.06);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(-S / 2, -S * 0.12, S, S * 0.025);
  g.restore();
  // 边缘发白 (透明材料的厚边)
  const eg = g.createLinearGradient(x, y, x, y + h);
  eg.addColorStop(0, 'rgba(255,255,255,0.25)'); eg.addColorStop(0.15, 'rgba(255,255,255,0)'); eg.addColorStop(0.85, 'rgba(255,255,255,0)'); eg.addColorStop(1, 'rgba(255,255,255,0.18)');
  g.fillStyle = eg; g.fillRect(x, y, w, h);
}

/** 绘制一块板 (含投影)；art 来自 renderBoard */
export function drawBoard(ctx, b, art, pixelScale, { alpha = 1, flash = 0 } = {}) {
  const pos = b.body.position;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(b.body.angle);
  ctx.globalAlpha *= alpha;
  const m = MATERIALS[b.mat] || MATERIALS.oak;
  const clear = m.kind === 'clear';
  ctx.shadowColor = clear ? 'rgba(20,30,40,0.18)' : 'rgba(25,14,6,0.42)';
  ctx.shadowBlur = (6 + b.layer * 2.2) * pixelScale;
  // 投影偏移不受 transform 影响：按设备像素给出，方向固定为右下
  ctx.shadowOffsetX = (2 + b.layer * 1.2) * pixelScale;
  ctx.shadowOffsetY = (4 + b.layer * 1.8) * pixelScale;
  ctx.drawImage(art.canvas, -art.ox, -art.oy, art.w, art.h);
  ctx.shadowColor = 'transparent';
  if (flash > 0) {
    polyPath(ctx, art.pts);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255,90,60,${flash})`;
    ctx.stroke();
  }
  ctx.restore();
}

export { polyPath, localPoly };

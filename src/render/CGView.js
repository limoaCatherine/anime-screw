// 插画 (被封住的画) 的绘制：已经拆出来的碎片是彩色，没拆的是旧照片色 + 封条纸纹。
// 游戏里画框底下、主界面、选关、画册都用这一套。
import { FRAGMENT_GRID, CHAPTERS } from '../config/LevelConfig.js';
import { drawSepia, roundRectPath, drawText, hexA } from '../ui/draw.js';

export function fragmentRect(i, x, y, w, h) {
  const { cols, rows } = FRAGMENT_GRID;
  const c = i % cols; const r = Math.floor(i / cols);
  return { x: x + (c * w) / cols, y: y + (r * h) / rows, w: w / cols, h: h / rows };
}

/**
 * @param {object} o
 *   chapter: 章节下标 (0 起)  owned(i): 第 i 块是否已拆出
 *   reveal: { index, k }  正在揭开的那一块 (k 0→1)
 *   highlight: 当前关对应的那块 (画虚线框)
 *   labels: 没拆的块上写"第几关"
 */
export function drawCG(ctx, game, x, y, w, h, o) {
  const ch = CHAPTERS[o.chapter];
  const img = game.assets.getImage(ch.cg);
  if (!img) return;
  const iw = img.width; const ih = img.height;
  const n = FRAGMENT_GRID.cols * FRAGMENT_GRID.rows;
  ctx.save();
  roundRectPath(ctx, x, y, w, h, o.radius || 0);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const d = fragmentRect(i, x, y, w, h);
    const s = fragmentRect(i, 0, 0, iw, ih);
    const owned = o.owned(i);
    const rv = o.reveal && o.reveal.index === i ? o.reveal.k : null;
    if (owned && rv == null) {
      ctx.drawImage(img, s.x, s.y, s.w, s.h, d.x, d.y, d.w + 0.5, d.h + 0.5);
    } else {
      drawSepia(ctx, img, s.x, s.y, s.w, s.h, d.x, d.y, d.w + 0.5, d.h + 0.5, 0.9, o.dark ?? 0.6);
      if (rv != null && rv > 0) {
        // 从左上往右下揭开：彩色部分逐渐扩大
        ctx.save();
        ctx.beginPath();
        const span = (d.w + d.h) * rv;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + span, d.y); ctx.lineTo(d.x, d.y + span); ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, s.x, s.y, s.w, s.h, d.x, d.y, d.w + 0.5, d.h + 0.5);
        ctx.restore();
        // 揭开的边缘一道光
        ctx.save();
        ctx.beginPath(); ctx.rect(d.x, d.y, d.w, d.h); ctx.clip();
        ctx.strokeStyle = `rgba(255,245,220,${0.9 * (1 - rv)})`;
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(d.x + span, d.y); ctx.lineTo(d.x, d.y + span); ctx.stroke();
        ctx.restore();
      } else if (o.paper !== false) {
        // 封条：一层薄纸 + 斜纹
        ctx.save();
        ctx.fillStyle = 'rgba(232,214,180,0.16)';
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.beginPath(); ctx.rect(d.x, d.y, d.w, d.h); ctx.clip();
        ctx.strokeStyle = 'rgba(255,240,210,0.07)'; ctx.lineWidth = 6;
        for (let k = -d.h; k < d.w; k += 16) { ctx.beginPath(); ctx.moveTo(d.x + k, d.y + d.h); ctx.lineTo(d.x + k + d.h, d.y); ctx.stroke(); }
        ctx.restore();
        if (o.labels) drawText(ctx, `第${i + 1}关`, d.x + d.w / 2, d.y + d.h / 2, { size: Math.max(10, d.h * 0.18), color: 'rgba(255,240,215,0.55)', weight: 'normal' });
      }
    }
  }
  // 碎片之间细细的拼缝
  ctx.strokeStyle = 'rgba(40,24,12,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) { const d = fragmentRect(i, x, y, w, h); ctx.strokeRect(d.x, d.y, d.w, d.h); }
  if (o.highlight != null) {
    const d = fragmentRect(o.highlight, x, y, w, h);
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -(o.time || 0) * 20;
    ctx.strokeStyle = hexA('#ffe6b0', 0.85); ctx.lineWidth = 2.5;
    ctx.strokeRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4);
    ctx.restore();
  }
  ctx.restore();
}

/** 木画框 */
export function drawFrame(ctx, x, y, w, h, color = '#6b4a3a', t = 14) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  ctx.fillStyle = color;
  ctx.fillRect(x - t, y - t, w + t * 2, h + t * 2);
  ctx.restore();
  const g = ctx.createLinearGradient(x - t, y - t, x + w + t, y + h + t);
  g.addColorStop(0, 'rgba(255,230,190,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(x - t, y - t, w + t * 2, h + t * 2);
  // 内外两道线脚
  ctx.strokeStyle = 'rgba(255,225,180,0.45)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x - t + 3, y - t + 3, w + t * 2 - 6, h + t * 2 - 6);
  ctx.strokeStyle = 'rgba(20,10,4,0.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
}

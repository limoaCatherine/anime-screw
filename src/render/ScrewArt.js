// 螺丝外观：金属垫圈 + 主题色钉帽 (径向渐变 + 高光) + 十字槽；以及冰冻 / 炸弹 / 钥匙 / 双层 / 隐色 等状态。
import { GameConfig } from '../config/GameConfig.js';
import { drawText } from '../ui/draw.js';
import { platform } from '../platform/index.js';

const R = GameConfig.screw.radius;
const capCache = new Map();

function capSprite(colorKey, r) {
  const key = `${colorKey}|${r}`;
  if (capCache.has(key)) return capCache.get(key);
  const SS = 3;
  const size = Math.ceil((r + 6) * 2);
  const c = platform.createCanvas(size * SS, size * SS);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  g.translate(size / 2, size / 2);
  const col = colorKey === 'hidden' ? { hex: '#8d8a86', light: '#d6d2cc', dark: '#55524e' } : GameConfig.screwColors[colorKey];
  // 垫圈
  const wg = g.createLinearGradient(-r, -r, r, r);
  wg.addColorStop(0, '#f4f4f2'); wg.addColorStop(0.5, '#a9adb2'); wg.addColorStop(1, '#5d6268');
  g.beginPath(); g.arc(0, 0, r + 3, 0, Math.PI * 2); g.fillStyle = wg; g.fill();
  g.lineWidth = 0.8; g.strokeStyle = 'rgba(30,30,30,0.6)'; g.stroke();
  // 钉帽 (圆顶)
  const cg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  cg.addColorStop(0, col.light); cg.addColorStop(0.45, col.hex); cg.addColorStop(1, col.dark);
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = cg; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
  // 边缘一圈反光
  g.beginPath(); g.arc(0, 0, r - 1.6, Math.PI * 0.95, Math.PI * 1.6);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.4; g.stroke();
  capCache.set(key, { c, size });
  return capCache.get(key);
}

function slot(ctx, r, rot) {
  ctx.save();
  ctx.rotate(rot);
  const L = r * 0.62; const T = r * 0.2;
  for (let k = 0; k < 2; k++) {
    ctx.save();
    ctx.rotate(k * Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-L, -T / 2 + 0.9, L * 2, T);
    ctx.fillStyle = 'rgba(20,12,8,0.62)';
    ctx.fillRect(-L, -T / 2, L * 2, T);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * @param {object} o
 *   color: 颜色 key (sky/pink/...)；inner: 双层的内层颜色；hidden: 隐色
 *   rot 十字槽角度；scale；alpha；lift (拧出时抬高，阴影变大)
 *   frost (剩余层数) bomb (剩余步数) key (是钥匙钉) hanger (挂钉) lockBadge (锁链挂锁) urgent
 */
export function drawScrew(ctx, x, y, o = {}) {
  const r = R;
  const s = o.scale ?? 1;
  const time = o.time || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= o.alpha ?? 1;
  if (o.hanger) {
    // 挂钉的铜底座
    ctx.fillStyle = '#9c6a3a';
    ctx.beginPath(); ctx.ellipse(0, 2, r + 9, r + 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9925a';
    ctx.beginPath(); ctx.ellipse(0, 0, r + 8, r + 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.scale(s, s);
  // 投影
  const lift = o.lift || 0;
  ctx.fillStyle = `rgba(20,10,4,${0.35 - lift * 0.15})`;
  ctx.beginPath(); ctx.ellipse(1.5 + lift * 6, 2.5 + lift * 10, r + 3, r + 2.5, 0, 0, Math.PI * 2); ctx.fill();
  if (lift) ctx.translate(-lift * 2, -lift * 6);
  if (o.inner) {
    // 双层：外圈露出内层颜色的一道厚边
    const ic = GameConfig.screwColors[o.inner];
    ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
    const ig = ctx.createRadialGradient(-3, -4, 2, 0, 0, r + 6);
    ig.addColorStop(0, ic.light); ig.addColorStop(0.6, ic.hex); ig.addColorStop(1, ic.dark);
    ctx.fillStyle = ig; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    // 螺纹圈
    ctx.beginPath(); ctx.arc(0, 0, r + 4.5, 0, Math.PI * 2);
    ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  }
  const sp = capSprite(o.hidden ? 'hidden' : (o.color || 'hidden'), r);
  ctx.drawImage(sp.c, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
  if (o.hidden && o.blank) {
    // 只要灰色钉帽
  } else if (o.hidden) {
    drawText(ctx, '?', 0, 1, { size: 18, color: '#fffdf8', stroke: 'rgba(40,36,32,0.6)', strokeWidth: 3 });
  } else if (o.key) {
    // 钥匙钉：金色小钥匙代替十字槽
    ctx.save();
    ctx.rotate(-0.7);
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#7a5300'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(-5, 0, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillRect(-1.5, -1.4, 10, 2.8); ctx.strokeRect(-1.5, -1.4, 10, 2.8);
    ctx.fillRect(5, 1, 2, 3); ctx.fillRect(7.5, 1, 1.8, 2.4);
    ctx.fillStyle = '#7a5300'; ctx.beginPath(); ctx.arc(-5, 0, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else {
    slot(ctx, r, o.rot || 0);
  }
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.32, r * 0.18, -0.6, 0, Math.PI * 2); ctx.fill();

  if (o.frost > 0) {
    // 冰壳：半透明冰块 + 裂纹
    ctx.save();
    const fr = r + 8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; ctx.lineTo(Math.cos(a) * fr, Math.sin(a) * fr); }
    ctx.closePath();
    const fg = ctx.createLinearGradient(-fr, -fr, fr, fr);
    fg.addColorStop(0, 'rgba(240,252,255,0.88)'); fg.addColorStop(0.5, 'rgba(170,220,245,0.7)'); fg.addColorStop(1, 'rgba(120,180,220,0.78)');
    ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(90,150,190,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-1, 0); ctx.lineTo(6, -7); ctx.moveTo(-1, 0); ctx.lineTo(2, 9); ctx.stroke();
    if (o.frost > 1) {
      ctx.fillStyle = '#2f6f99';
      ctx.beginPath(); ctx.arc(fr - 3, -fr + 5, 8, 0, Math.PI * 2); ctx.fill();
      drawText(ctx, String(o.frost), fr - 3, -fr + 5.5, { size: 11, color: '#fff' });
    }
    ctx.restore();
  }
  if (o.bomb > 0) {
    const urgent = o.bomb <= 3;
    const pulse = urgent ? 1 + Math.sin(time * 12) * 0.08 : 1;
    ctx.save();
    ctx.scale(pulse, pulse);
    ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = urgent ? '#ff3b2f' : '#2a2a2a'; ctx.lineWidth = 3.5;
    ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    // 引信 + 火花
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.8); ctx.quadraticCurveTo(r + 4, -r - 6, r + 8, -r - 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,${180 + Math.sin(time * 30) * 60 | 0},60,0.95)`;
    ctx.beginPath(); ctx.arc(r + 8, -r - 2, 3 + Math.sin(time * 25) * 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = urgent ? '#d8261b' : '#2b2b2b';
    ctx.beginPath(); ctx.arc(-r + 1, -r + 1, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    drawText(ctx, String(o.bomb), -r + 1, -r + 1.5, { size: 12, color: '#fff' });
    ctx.restore();
  }
  if (o.lockBadge) {
    ctx.save();
    ctx.translate(r - 1, r - 2);
    ctx.fillStyle = o.lockBadge;
    ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -3, 4, Math.PI, 0); ctx.lineWidth = 2; ctx.strokeStyle = '#555'; ctx.stroke();
    ctx.fillRect(-5.5, -3, 11, 8); ctx.lineWidth = 1; ctx.strokeStyle = '#3a2a10'; ctx.strokeRect(-5.5, -3, 11, 8);
    ctx.restore();
  }
  if (o.glow) {
    ctx.beginPath(); ctx.arc(0, 0, r + 7 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,236,160,${0.55 + Math.sin(time * 6) * 0.25})`; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
}

/** 收纳盒里/临时孔里的螺丝 (小一号，俯视) */
export function drawPiece(ctx, x, y, piece, { scale = 0.82, rot = 0, alpha = 1, revealed = true, lift = 0 } = {}) {
  drawScrew(ctx, x, y, { color: piece.color, hidden: piece.hidden && !revealed, key: !!piece.key, rot, scale, alpha, lift });
}

/** 锁链：两颗螺丝之间的一串链环 + 中间挂锁 */
export function drawChain(ctx, ax, ay, bx, by, color = '#c9a640', time = 0, shake = 0) {
  const dx = bx - ax; const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const n = Math.max(3, Math.floor(len / 11));
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  const sag = Math.min(18, len * 0.08);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * len; const y = Math.sin(t * Math.PI) * sag + (shake ? Math.sin(time * 60 + i) * shake : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i % 2 ? 0 : 0.0);
    ctx.beginPath();
    if (i % 2) ctx.ellipse(0, 0, 6.5, 2.4, 0, 0, Math.PI * 2);
    else ctx.ellipse(0, 0, 6.5, 4.2, 0, 0, Math.PI * 2);
    ctx.lineWidth = i % 2 ? 2.4 : 2.6;
    ctx.strokeStyle = '#5c6066'; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#d7dbe0'; ctx.stroke();
    ctx.restore();
  }
  // 挂锁
  ctx.translate(len / 2, sag + 8);
  ctx.rotate(-ang);
  ctx.beginPath(); ctx.arc(0, -6, 5.5, Math.PI, 0); ctx.lineWidth = 2.6; ctx.strokeStyle = '#6a6e74'; ctx.stroke();
  const pg = ctx.createLinearGradient(0, -6, 0, 9);
  pg.addColorStop(0, '#ffe08a'); pg.addColorStop(1, color);
  ctx.fillStyle = pg;
  ctx.fillRect(-8, -6, 16, 14);
  ctx.strokeStyle = '#6b4f10'; ctx.lineWidth = 1; ctx.strokeRect(-8, -6, 16, 14);
  ctx.fillStyle = '#4a3508'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-0.8, 0, 1.6, 4);
  ctx.restore();
}

/** 绳子：从挂钉到板子上的挂点 */
export function drawRope(ctx, ax, ay, bx, by) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8c6a43'; ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = '#c9a777'; ctx.lineWidth = 2.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.setLineDash([]);
  // 板上的小铜环
  ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2);
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#b07a3e'; ctx.stroke();
  ctx.restore();
}

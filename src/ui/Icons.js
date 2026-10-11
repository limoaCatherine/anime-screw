// 矢量小图标 (画布绘制，以 (0,0) 为中心，s 为图标框大小)。
const INK = '#4a3426';

function line(ctx, pts, w, color = INK) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
}

export const Icons = {
  home(ctx, s) {
    const k = s / 44;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, -12 * k); ctx.lineTo(12 * k, -1 * k); ctx.lineTo(8 * k, -1 * k); ctx.lineTo(8 * k, 11 * k);
    ctx.lineTo(3 * k, 11 * k); ctx.lineTo(3 * k, 4 * k); ctx.lineTo(-3 * k, 4 * k); ctx.lineTo(-3 * k, 11 * k);
    ctx.lineTo(-8 * k, 11 * k); ctx.lineTo(-8 * k, -1 * k); ctx.lineTo(-12 * k, -1 * k);
    ctx.closePath(); ctx.fill();
  },
  back(ctx, s) {
    const k = s / 44;
    line(ctx, [[6 * k, -11 * k], [-6 * k, 0], [6 * k, 11 * k]], 4 * k);
  },
  gear(ctx, s) {
    const k = s / 44;
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = (i % 2 ? 9 : 13) * k;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbf4e6';
    ctx.beginPath(); ctx.arc(0, 0, 4.5 * k, 0, Math.PI * 2); ctx.fill();
  },
  close(ctx, s) {
    const k = s / 44;
    line(ctx, [[-8 * k, -8 * k], [8 * k, 8 * k]], 4 * k);
    line(ctx, [[8 * k, -8 * k], [-8 * k, 8 * k]], 4 * k);
  },
  undo(ctx, s) {
    const k = s / 50;
    ctx.beginPath(); ctx.arc(2 * k, 2 * k, 10 * k, Math.PI * 1.05, Math.PI * 0.55, false);
    ctx.lineWidth = 3.6 * k; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(-13 * k, -4 * k); ctx.lineTo(-3 * k, -6 * k); ctx.lineTo(-9 * k, 4 * k); ctx.closePath(); ctx.fill();
  },
  addHole(ctx, s) {
    const k = s / 50;
    ctx.beginPath(); ctx.arc(-3 * k, 2 * k, 10 * k, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-5 * k, 0, 1, -3 * k, 2 * k, 10 * k);
    g.addColorStop(0, '#1d140e'); g.addColorStop(1, '#5a4434');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2 * k; ctx.strokeStyle = '#8f6e52'; ctx.stroke();
    line(ctx, [[10 * k, -12 * k], [10 * k, -2 * k]], 3.4 * k, '#3f8f5b');
    line(ctx, [[5 * k, -7 * k], [15 * k, -7 * k]], 3.4 * k, '#3f8f5b');
  },
  screwdriver(ctx, s) {
    const k = s / 50;
    ctx.save(); ctx.rotate(-0.75);
    ctx.fillStyle = '#d9673b';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-5 * k, 2 * k, 10 * k, 15 * k, 3 * k) : ctx.rect(-5 * k, 2 * k, 10 * k, 15 * k); ctx.fill();
    ctx.fillStyle = '#8a8f96'; ctx.fillRect(-1.6 * k, -15 * k, 3.2 * k, 18 * k);
    ctx.fillStyle = '#5c6066'; ctx.fillRect(-2.6 * k, -17 * k, 5.2 * k, 3 * k);
    ctx.restore();
  },
  hammer(ctx, s) {
    const k = s / 50;
    ctx.save(); ctx.rotate(-0.6);
    ctx.fillStyle = '#9b6a3e'; ctx.fillRect(-2 * k, -4 * k, 4 * k, 20 * k);
    ctx.fillStyle = '#6c7178'; ctx.fillRect(-10 * k, -12 * k, 20 * k, 9 * k);
    ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-10 * k, -12 * k, 20 * k, 3 * k);
    ctx.restore();
  },
  shuffle(ctx, s) {
    const k = s / 50;
    ctx.fillStyle = '#3fa9f5'; ctx.fillRect(-13 * k, -9 * k, 10 * k, 8 * k);
    ctx.fillStyle = '#ff6fa6'; ctx.fillRect(3 * k, 2 * k, 10 * k, 8 * k);
    line(ctx, [[-4 * k, 6 * k], [-8 * k, 6 * k], [-8 * k, 2 * k]], 2.6 * k);
    line(ctx, [[4 * k, -6 * k], [8 * k, -6 * k], [8 * k, -2 * k]], 2.6 * k);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(-11 * k, 2 * k); ctx.lineTo(-5 * k, 2 * k); ctx.lineTo(-8 * k, -2 * k); ctx.fill();
    ctx.beginPath(); ctx.moveTo(11 * k, -2 * k); ctx.lineTo(5 * k, -2 * k); ctx.lineTo(8 * k, 2 * k); ctx.fill();
  },
  book(ctx, s) {
    const k = s / 44;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(0, -7 * k); ctx.quadraticCurveTo(-7 * k, -11 * k, -13 * k, -9 * k); ctx.lineTo(-13 * k, 9 * k);
    ctx.quadraticCurveTo(-7 * k, 7 * k, 0, 11 * k); ctx.quadraticCurveTo(7 * k, 7 * k, 13 * k, 9 * k); ctx.lineTo(13 * k, -9 * k);
    ctx.quadraticCurveTo(7 * k, -11 * k, 0, -7 * k); ctx.fill();
    line(ctx, [[0, -6 * k], [0, 10 * k]], 1.6 * k, '#fbf4e6');
  },
  map(ctx, s) {
    const k = s / 44;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(-13 * k, -8 * k); ctx.lineTo(-5 * k, -11 * k); ctx.lineTo(5 * k, -8 * k); ctx.lineTo(13 * k, -11 * k);
    ctx.lineTo(13 * k, 8 * k); ctx.lineTo(5 * k, 11 * k); ctx.lineTo(-5 * k, 8 * k); ctx.lineTo(-13 * k, 11 * k); ctx.closePath(); ctx.fill();
    line(ctx, [[-5 * k, -10 * k], [-5 * k, 8 * k]], 1.4 * k, '#fbf4e6');
    line(ctx, [[5 * k, -8 * k], [5 * k, 10 * k]], 1.4 * k, '#fbf4e6');
  },
  share(ctx, s) {
    const k = s / 44;
    const dot = (x, y) => { ctx.beginPath(); ctx.arc(x * k, y * k, 4 * k, 0, Math.PI * 2); ctx.fill(); };
    ctx.fillStyle = '#fffaf0';
    line(ctx, [[8 * k, -8 * k], [-7 * k, 0], [8 * k, 8 * k]], 2.4 * k, '#fffaf0');
    dot(8, -8); dot(-7, 0); dot(8, 8);
  },
  lock(ctx, s, color = INK) {
    const k = s / 44;
    ctx.beginPath(); ctx.arc(0, -3 * k, 7 * k, Math.PI, 0);
    ctx.lineWidth = 3.4 * k; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-10 * k, -3 * k, 20 * k, 15 * k);
  },
  play(ctx, s) {
    const k = s / 44;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(-6 * k, -10 * k); ctx.lineTo(10 * k, 0); ctx.lineTo(-6 * k, 10 * k); ctx.closePath(); ctx.fill();
  },
  left(ctx, s) { const k = s / 44; line(ctx, [[5 * k, -10 * k], [-5 * k, 0], [5 * k, 10 * k]], 4 * k); },
  right(ctx, s) { const k = s / 44; line(ctx, [[-5 * k, -10 * k], [5 * k, 0], [-5 * k, 10 * k]], 4 * k); },
  restart(ctx, s) {
    const k = s / 44;
    ctx.beginPath(); ctx.arc(0, 0, 10 * k, -Math.PI * 0.3, Math.PI * 1.45);
    ctx.lineWidth = 3.4 * k; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(4 * k, -14 * k); ctx.lineTo(12 * k, -9 * k); ctx.lineTo(4 * k, -4 * k); ctx.closePath(); ctx.fill();
  },
};

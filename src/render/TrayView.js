// 收纳区的表现层：收纳盒、"下一个"队列、临时孔，以及螺丝从板子飞进盒子/孔的动画。
// 规则状态在 BoxSystem 里是"瞬间"变化的；这里按时间线把它演出来：
//   拧出 (原地转两圈抬起) → 弧线飞行 → 落进去 (音效在落地瞬间) → 盒满合盖 → 飞走 → 下一个盒子滑入
// 落地 / 合盖时发出 fx:land / fx:boxClose 事件 (AudioSystem 据此出声)。
import { GameConfig } from '../config/GameConfig.js';
import { roundRectPath, drawText, shade, hexA, ease, drawPortrait } from '../ui/draw.js';
import { drawPiece } from './ScrewArt.js';

const L = GameConfig.layout;
const SPIN = 0.2;        // 拧出动作时长
const FLY = 0.36;        // 飞行时长
const CLOSE = 0.26;      // 合盖
const EXIT = 0.28;       // 飞走
const ARRIVE = 0.3;      // 新盒子滑入

export class TrayView {
  constructor(game, events) {
    this.game = game;
    this.events = events;
    this.t = 0;
    this.reset(null);
  }

  reset(puzzle) {
    this.puzzle = puzzle;
    this.flights = [];
    this.origin = new Map();
    this.landAt = new Map();
    this.boxLandAt = new Map();
    this.closing = [];
    this.arrivals = new Map();   // boxId -> { slot, start }
    this.slotReady = [0, 0, 0, 0];
    this.flip = new Map();
    this.holeFlash = 0;
    this.poofs = [];
  }

  /** 撤销 / 复活之后：直接对齐到规则状态，不演动画 */
  snap() {
    this.flights = [];
    this.closing = [];
    this.arrivals.clear();
    this.slotReady = [0, 0, 0, 0];
    this.landAt.clear();
    this.boxLandAt.clear();
  }

  // ------------------------------------------------------------ 布局
  slotCount() {
    const n = this.puzzle ? this.puzzle.box.slots.length : 2;
    return Math.max(n, this.thirdOffer ? 3 : n);
  }

  slotRect(i) {
    const n = this.slotCount();
    const area = L.boxArea;
    const gap = 10;
    const w = Math.min(L.boxW, (area.right - area.left - gap * (n - 1)) / n);
    const total = n * w + (n - 1) * gap;
    const x0 = (area.left + area.right) / 2 - total / 2;
    return { x: x0 + i * (w + gap) + w / 2, y: L.boxY, w, h: L.boxH };
  }

  piecePos(slot, index) {
    const r = this.slotRect(slot);
    return { x: r.x + (index - 1) * r.w * 0.29, y: r.y + 10 };
  }

  holePos(i) {
    const n = this.puzzle ? this.puzzle.box.holes.length : 5;
    const gap = Math.min(L.holeGap, 470 / n);
    return { x: GameConfig.width / 2 + (i - (n - 1) / 2) * gap, y: L.holeY };
  }

  // ------------------------------------------------------------ 事件
  onScrewOut(e) {
    this.origin.set(e.piece.id, { x: e.pos.x, y: e.pos.y, dumped: e.dumped, order: this.dumpOrder = e.dumped ? (this.dumpOrder || 0) + 1 : 0 });
  }

  onPieceBox(e) {
    const now = this.t;
    let from; let start; let spin = 0;
    if (e.from === 'hole') {
      from = this.holePos(e.hole);
      start = Math.max(now, (this.landAt.get(e.piece.id) || 0) + 0.06);
    } else {
      const o = this.origin.get(e.piece.id) || { x: 270, y: 500 };
      from = o;
      spin = o.dumped ? 0 : SPIN;
      start = now + (o.dumped ? o.order * 0.06 : 0);
    }
    const ready = this.slotReady[e.slot] || 0;
    const takeoff = Math.max(start + spin, ready - FLY * 0.6);
    const land = takeoff + FLY;
    this.flights.push({ piece: e.piece, from, to: { kind: 'box', slot: e.slot, index: e.index, box: e.box }, start, takeoff, land, spin: spin > 0, fromHole: e.from === 'hole' });
    this.landAt.set(e.piece.id, land);
    this.boxLandAt.set(e.box.id, Math.max(this.boxLandAt.get(e.box.id) || 0, land));
  }

  onPieceHole(e) {
    const o = this.origin.get(e.piece.id) || { x: 270, y: 500 };
    const spin = o.dumped ? 0 : SPIN;
    const start = this.t + (o.dumped ? o.order * 0.06 : 0);
    const land = start + spin + FLY;
    this.flights.push({ piece: e.piece, from: o, to: { kind: 'hole', index: e.index }, start, takeoff: start + spin, land, spin: spin > 0 });
    this.landAt.set(e.piece.id, land);
  }

  onBoxFull(e) {
    const begin = Math.max(this.t, this.boxLandAt.get(e.box.id) || 0, this.slotReady[e.slot] || 0);
    this.closing.push({ box: e.box, slot: e.slot, start: begin, orphan: e.orphan, announced: false });
    this.slotReady[e.slot] = begin + CLOSE + EXIT + ARRIVE;
    this.pendingArrival = { slot: e.slot, start: begin + CLOSE + EXIT };
  }

  onBoxArrive(e) {
    const pa = this.pendingArrival && this.pendingArrival.slot === e.slot ? this.pendingArrival : { start: this.t };
    this.arrivals.set(e.box.id, { slot: e.slot, start: pa.start });
    this.slotReady[e.slot] = Math.max(this.slotReady[e.slot] || 0, pa.start + ARRIVE);
    this.pendingArrival = null;
  }

  onShuffle(e) { for (const s of e.slots) this.flip.set(s, this.t); }

  onHolesClear(e) { for (const c of e.cleared) this.poofs.push({ ...this.holePos(c.index), t: this.t, color: GameConfig.screwColors[c.piece.color].hex }); }

  /** 正在飞或还没落地的动画 */
  get busy() { return this.flights.length > 0 || this.closing.length > 0; }

  // ------------------------------------------------------------ 推进
  update(dt, fx) {
    this.t += dt;
    const now = this.t;
    const done = [];
    for (const f of this.flights) {
      if (now >= f.land) done.push(f);
    }
    if (done.length) {
      this.flights = this.flights.filter((f) => !done.includes(f));
      for (const f of done) {
        const p = this.targetPos(f.to);
        const col = GameConfig.screwColors[f.piece.color];
        this.events.emit('fx:land', { kind: f.to.kind, x: p.x, y: p.y, piece: f.piece });
        if (fx) {
          fx.ring(p.x, p.y, { color: hexA(col.hex, 0.9), r0: 6, r1: 26, life: 0.3 });
          if (f.to.kind === 'box') fx.burst(p.x, p.y, { n: 6, colors: [col.light, '#fff'], speed: 120, size: 2, life: 0.35, kind: 'star', gravity: 200 });
        }
      }
    }
    for (const c of this.closing) {
      if (!c.announced && now >= c.start) {
        c.announced = true;
        const r = this.slotRect(c.slot);
        this.events.emit('fx:boxClose', { box: c.box, x: r.x, y: r.y, orphan: c.orphan });
        if (fx && !c.orphan) {
          const col = GameConfig.screwColors[c.box.color];
          fx.burst(r.x, r.y - 10, { n: 16, colors: [col.hex, col.light, '#fff4d8'], speed: 220, size: 3.5, life: 0.8, kind: 'paper', gravity: 380 });
        }
      }
    }
    this.closing = this.closing.filter((c) => now < c.start + CLOSE + EXIT);
    this.poofs = this.poofs.filter((p) => now - p.t < 0.5);
    if (this.puzzle && this.puzzle.box.freeHoles <= 1 && this.puzzle.box.holes.length) this.holeFlash += dt; else this.holeFlash = 0;
  }

  targetPos(to) {
    return to.kind === 'box' ? this.piecePos(to.slot, to.index) : this.holePos(to.index);
  }

  // ------------------------------------------------------------ 绘制
  render(ctx, time) {
    const pz = this.puzzle;
    if (!pz) return;
    const now = this.t;
    const flying = new Set(this.flights.map((f) => f.piece.id));

    // 盒子区底板 (一条铜边木托盘)
    ctx.save();
    roundRectPath(ctx, 8, L.boxY - L.boxH / 2 - 14, 524, L.boxH + 26, 14);
    const tg = ctx.createLinearGradient(0, L.boxY - 60, 0, L.boxY + 60);
    tg.addColorStop(0, 'rgba(60,40,28,0.55)'); tg.addColorStop(1, 'rgba(40,26,18,0.7)');
    ctx.fillStyle = tg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,180,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // 收纳盒
    for (let i = 0; i < this.slotCount(); i++) {
      const box = pz.box.slots[i];
      const r = this.slotRect(i);
      const closing = this.closing.find((c) => c.slot === i && now < c.start + CLOSE + EXIT);
      if (closing) {
        this.drawBox(ctx, r, closing.box, { close: Math.min(1, Math.max(0, (now - closing.start) / CLOSE)), exit: Math.max(0, (now - closing.start - CLOSE) / EXIT), flying, time });
        continue;
      }
      if (i >= pz.box.slots.length) { this.drawOffer(ctx, r, time); continue; }
      if (!box) { this.drawEmptySlot(ctx, r); continue; }
      const arr = this.arrivals.get(box.id);
      if (arr && now < arr.start) { this.drawEmptySlot(ctx, r); continue; }
      const k = arr ? Math.min(1, (now - arr.start) / ARRIVE) : 1;
      const fl = this.flip.get(i);
      const flipK = fl != null ? Math.min(1, (now - fl) / 0.35) : 1;
      this.drawBox(ctx, r, box, { arrive: k, flying, flip: flipK, time });
    }

    // 下一个
    const q = pz.box.queue;
    drawText(ctx, '下一个', L.nextX, L.boxY - 34, { size: 12, color: 'rgba(255,240,220,0.75)', weight: 'normal' });
    for (let k = 0; k < Math.min(2, q.length); k++) {
      const col = GameConfig.screwColors[q[k]];
      const y = L.boxY - 10 + k * 30;
      ctx.save();
      ctx.globalAlpha = k === 0 ? 1 : 0.65;
      roundRectPath(ctx, L.nextX - 24, y - 10, 48, 22, 6);
      ctx.fillStyle = col.hex; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = shade(col.hex, 0.6); ctx.stroke();
      roundRectPath(ctx, L.nextX - 24, y - 10, 48, 7, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
      ctx.restore();
    }
    if (q.length > 2) drawText(ctx, `还有${q.length - 2}`, L.nextX, L.boxY + 52, { size: 11, color: 'rgba(255,240,220,0.7)', weight: 'normal' });
    if (!q.length) drawText(ctx, '没了', L.nextX, L.boxY + 2, { size: 12, color: 'rgba(255,240,220,0.5)', weight: 'normal' });

    // 临时孔
    const n = pz.box.holes.length;
    const p0 = this.holePos(0); const p1 = this.holePos(n - 1);
    ctx.save();
    roundRectPath(ctx, p0.x - 30, L.holeY - 26, p1.x - p0.x + 60, 52, 26);
    const hg = ctx.createLinearGradient(0, L.holeY - 26, 0, L.holeY + 26);
    hg.addColorStop(0, '#6e4e36'); hg.addColorStop(1, '#4a3222');
    ctx.fillStyle = hg; ctx.fill();
    const warn = this.holeFlash > 0 ? 0.5 + 0.5 * Math.sin(this.holeFlash * 8) : 0;
    ctx.lineWidth = warn ? 2.5 : 1.5;
    ctx.strokeStyle = warn ? `rgba(255,90,60,${0.5 + warn * 0.5})` : 'rgba(255,220,180,0.3)';
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < n; i++) {
      const p = this.holePos(i);
      const g = ctx.createRadialGradient(p.x - 3, p.y - 4, 2, p.x, p.y, L.holeR);
      g.addColorStop(0, '#120b07'); g.addColorStop(0.8, '#2c1d13'); g.addColorStop(1, '#7a5a40');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, L.holeR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,200,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, L.holeR + 0.5, 0.2, Math.PI - 0.2); ctx.stroke();
      const piece = pz.box.holes[i];
      if (piece && !flying.has(piece.id)) drawPiece(ctx, p.x, p.y, piece, { scale: 0.85, rot: 0.4 + piece.id });
    }
    for (const p of this.poofs) {
      const k = (now - p.t) / 0.5;
      ctx.save(); ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10 + k * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /** 飞行中的螺丝画在最上层 (板子之上) */
  renderFlights(ctx) {
    const now = this.t;
    for (const f of this.flights) {
      const to = this.targetPos(f.to);
      if (now < f.start) {
        // 还没出发：画在出发点 (临时孔里等待的、或排队掉落的)
        drawPiece(ctx, f.from.x, f.from.y, f.piece, { scale: f.fromHole ? 0.85 : 1, rot: f.piece.id });
        continue;
      }
      if (now < f.takeoff) {
        if (!f.spin) { drawPiece(ctx, f.from.x, f.from.y, f.piece, { scale: f.fromHole ? 0.85 : 1, rot: f.piece.id }); continue; }
        const k = (now - f.start) / (f.takeoff - f.start);
        const lift = ease.cubicOut(Math.min(1, k));
        ctx.save();
        drawPieceLift(ctx, f.from.x, f.from.y, f.piece, { rot: -k * Math.PI * 3.2, scale: 1 + lift * 0.18, lift });
        ctx.restore();
        continue;
      }
      const k = Math.min(1, (now - f.takeoff) / (f.land - f.takeoff));
      const e = ease.cubicInOut(k);
      const mx = (f.from.x + to.x) / 2 + (to.x > f.from.x ? -30 : 30);
      const my = Math.min(f.from.y, to.y) - 70 - Math.abs(to.x - f.from.x) * 0.1;
      const x = (1 - e) * (1 - e) * f.from.x + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * f.from.y + 2 * (1 - e) * e * my + e * e * to.y;
      const sc = (f.fromHole ? 0.85 : 1.18) + ((f.to.kind === 'box' ? 0.82 : 0.85) - (f.fromHole ? 0.85 : 1.18)) * e;
      drawPieceLift(ctx, x, y, f.piece, { rot: -Math.PI * 3.2 - k * 6, scale: sc + Math.sin(k * Math.PI) * 0.12, lift: 1 - e * 0.9 });
    }
  }

  drawEmptySlot(ctx, r) {
    ctx.save();
    roundRectPath(ctx, r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 12);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(255,240,220,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  drawOffer(ctx, r, time) {
    ctx.save();
    roundRectPath(ctx, r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 12);
    ctx.fillStyle = 'rgba(255,240,220,0.08)'; ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = `rgba(255,220,160,${0.5 + Math.sin(time * 3) * 0.2})`; ctx.lineWidth = 2; ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, '+ 多一个盒子', r.x, r.y - 10, { size: 15, color: '#ffe7c2' });
    drawText(ctx, '看个广告', r.x, r.y + 14, { size: 12, color: 'rgba(255,231,194,0.75)', weight: 'normal' });
    ctx.restore();
  }

  drawBox(ctx, r, box, { arrive = 1, close = 0, exit = 0, flying, flip = 1, time = 0 }) {
    const col = GameConfig.screwColors[box.color];
    const now = this.t;
    ctx.save();
    let x = r.x; let y = r.y;
    if (arrive < 1) {
      const e = ease.backOut(arrive, 1.2);
      x = L.nextX + (r.x - L.nextX) * e;
      y = r.y - 6 * Math.sin(arrive * Math.PI);
      ctx.globalAlpha *= Math.min(1, arrive * 2);
    }
    if (exit > 0) {
      const e = ease.cubicIn(exit);
      y -= e * 70;
      ctx.globalAlpha *= 1 - e;
    }
    ctx.translate(x, y);
    if (flip < 1) ctx.scale(Math.abs(Math.cos(flip * Math.PI)), 1);
    const w = r.w; const h = r.h;
    // 盒身：铁皮小盒 (主题色烤漆)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 12);
    const bg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    bg.addColorStop(0, col.light); bg.addColorStop(0.18, col.hex); bg.addColorStop(1, shade(col.hex, 0.72));
    ctx.fillStyle = bg; ctx.fill();
    ctx.restore();
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 12);
    ctx.lineWidth = 2; ctx.strokeStyle = shade(col.hex, 0.55); ctx.stroke();
    roundRectPath(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, 10, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
    // 头像标签
    const img = this.game.assets.getImage(col.char);
    ctx.save();
    ctx.beginPath(); ctx.arc(-w / 2 + 17, -h / 2 + 18, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    drawPortrait(ctx, img, -w / 2 + 17, -h / 2 + 18, 11);
    drawText(ctx, col.name, w / 2 - 10, -h / 2 + 17, { size: 12, color: '#fff', align: 'right', stroke: shade(col.hex, 0.5), strokeWidth: 3 });
    // 三个槽
    for (let k = 0; k < 3; k++) {
      const px = (k - 1) * w * 0.29; const py = 10;
      const g = ctx.createRadialGradient(px - 2, py - 3, 2, px, py, 17);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, 16, 0.3, Math.PI - 0.3); ctx.stroke();
      const piece = box.pieces[k];
      if (piece && !(flying && flying.has(piece.id))) {
        const landed = this.landAt.get(piece.id);
        const bounce = landed && now - landed < 0.18 ? 1 + Math.sin(((now - landed) / 0.18) * Math.PI) * 0.15 : 1;
        drawPiece(ctx, px, py, piece, { scale: 0.82 * bounce, rot: piece.id * 0.7, revealed: true });
      }
    }
    // 合盖
    if (close > 0) {
      const lh = h * ease.cubicOut(close);
      ctx.save();
      roundRectPath(ctx, -w / 2 - 2, -h / 2 - 2, w + 4, lh + 4, 12);
      const lg = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 + lh);
      lg.addColorStop(0, shade(col.hex, 1.15)); lg.addColorStop(1, shade(col.hex, 0.85));
      ctx.fillStyle = lg; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = shade(col.hex, 0.55); ctx.stroke();
      if (close >= 1) {
        drawText(ctx, '✓', 0, 0, { size: 30, color: '#fff', stroke: shade(col.hex, 0.5), strokeWidth: 4 });
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

function drawPieceLift(ctx, x, y, piece, { rot, scale, lift }) {
  drawPiece(ctx, x, y, piece, { scale, rot, revealed: true, lift });
}

// 板子系统：创建板子刚体与螺丝约束、遮挡判定、掉落/出屏检测、绳吊板。
// 只管"物理上的板子"，不关心颜色和收纳 (那是 BoxSystem 的事)。
import { GameConfig } from '../config/GameConfig.js';
import { polygonCentroid, circleHitsPoly, rotate } from './geom.js';

export class BoardSystem {
  constructor(events, physics) {
    this.events = events;
    this.physics = physics;
    this.boards = [];
    this.byId = new Map();
  }

  load(levelBoards, screws) {
    for (const def of levelBoards) {
      const c = polygonCentroid(def.verts);
      const body = this.physics.createBoard(def.verts, c);
      const b = {
        id: def.id, layer: def.layer, mat: def.mat, tint: def.tint || null, seed: def.seed || def.id * 37,
        verts0: def.verts, c0: { x: c.x, y: c.y }, area: c.area, body,
        pins: new Set(), falling: false, gone: false, broken: false, impacted: false,
        lock: def.lock || null, locked: !!def.lock,
        rope: def.rope ? { ...def.rope, c: null, cut: false } : null,
        holes: [],          // 板上的孔 (局部坐标)，用于绘制
      };
      this.boards.push(b);
      this.byId.set(b.id, b);
    }
    for (const s of screws) {
      if (s.board < 0) continue;
      const b = this.byId.get(s.board);
      s.local = { x: s.x0 - b.c0.x, y: s.y0 - b.c0.y };
      b.holes.push(s.local);
      if (s.pin) {
        b.pins.add(s.id);
        s.c = this.physics.pin(b.body, s.x0, s.y0);
      }
    }
    for (const b of this.boards) {
      if (b.rope) b.rope.c = this.physics.rope(b.body, b.rope.ax, b.rope.ay, b.rope.bx, b.rope.by);
    }
  }

  get(id) { return this.byId.get(id); }

  /** 仍在场上、会挡住下层螺丝的板子 */
  isSolid(b) { return !b.gone && !b.broken && !b.falling; }

  alive() { return this.boards.filter((b) => !b.gone && !b.broken); }

  /** 螺丝当前世界坐标 */
  screwPos(s) {
    if (s.board < 0) return { x: s.x0, y: s.y0 };
    const b = this.byId.get(s.board);
    if (s.pin && s.state === 'on' && !b.falling) return { x: s.x0, y: s.y0 }; // 钉住的点不动
    const p = rotate(s.local.x, s.local.y, b.body.angle);
    return { x: b.body.position.x + p.x, y: b.body.position.y + p.y };
  }

  layerOf(s) {
    return s.board < 0 ? (s.layer ?? -1) : this.byId.get(s.board).layer;
  }

  /**
   * 螺丝钉帽是否被更高层的板子压住；返回压住它的板子 (或 null)。
   * 用板子此刻的真实位置判断 (下垂、摆动、绳吊晃过来的都算)；正在往下掉、还没离开的板子也算压着，
   * 画面上看着被挡住的螺丝就一定拧不了。
   */
  coveredBy(s) {
    const p = this.screwPos(s);
    const layer = this.layerOf(s);
    const r = GameConfig.screw.coverRadius;
    let top = null;
    for (const b of this.boards) {
      if (b.layer <= layer || b.id === s.board || b.gone || b.broken) continue;
      if (circleHitsPoly(p.x, p.y, r, b.body.vertices, b.body.bounds)) {
        if (!top || b.layer > top.layer) top = b;
      }
    }
    return top;
  }

  /** 螺丝被拧走：删掉它那条约束，按剩余钉数决定下垂 / 掉落 */
  unpin(s, jitter = 0) {
    if (s.board < 0) return null;
    const b = this.byId.get(s.board);
    if (s.c) { this.physics.removeConstraint(s.c); s.c = null; }
    if (!b.pins.delete(s.id)) return b;
    const n = b.pins.size;
    this.events.emit('board:pins', { board: b, pins: n });
    if (n === 1 && jitter) this.physics.nudge(b.body, jitter);
    if (n === 0 && (!b.rope || b.rope.cut)) this.drop(b);
    return b;
  }

  cutRope(b) {
    if (!b.rope || b.rope.cut) return;
    b.rope.cut = true;
    this.physics.removeConstraint(b.rope.c);
    b.rope.c = null;
    this.events.emit('rope:cut', { board: b });
    if (b.pins.size === 0) this.drop(b);
  }

  drop(b) {
    if (b.falling) return;
    b.falling = true;
    for (const id of b.pins) { /* 不应发生：掉落时已无钉 */ void id; }
    this.events.emit('board:fall', { board: b });
  }

  /** 小锤：整块敲碎 */
  shatter(b, screws) {
    for (const s of screws) if (s.board === b.id && s.c) { this.physics.removeConstraint(s.c); s.c = null; }
    b.pins.clear();
    if (b.rope && b.rope.c) { this.physics.removeConstraint(b.rope.c); b.rope.c = null; b.rope.cut = true; }
    b.broken = true;
    this.physics.removeBody(b.body);
    this.events.emit('board:break', { board: b });
  }

  /** 每个物理步之后：检测出屏 */
  postStep() {
    const H = GameConfig.height;
    const cfg = GameConfig.physics;
    for (const b of this.boards) {
      if (!b.falling || b.gone) continue;
      b.fallSteps = (b.fallSteps || 0) + 1;
      if (b.fallSteps > cfg.fallTimeout) {
        // 兜底：掉了太久还没出屏 (理论上不会，板子之间不碰撞) —— 直接移除，免得一直挡着下面的螺丝
        b.gone = true;
        this.physics.removeBody(b.body);
        this.events.emit('board:gone', { board: b, forced: true });
        continue;
      }
      const bb = b.body.bounds;
      if (!b.impacted && bb.min.y > H + 8) {
        b.impacted = true;
        this.events.emit('board:impact', { board: b, speed: b.body.velocity.y, area: b.area });
      }
      if (bb.min.y > cfg.goneY) {
        b.gone = true;
        this.physics.removeBody(b.body);
        this.events.emit('board:gone', { board: b });
      }
    }
  }

  /** 所有板子都静止 (掉落中的板子算"未静止"，直到出屏) */
  settled() {
    const cfg = GameConfig.physics;
    for (const b of this.boards) {
      if (b.gone || b.broken) continue;
      if (b.falling) return false;
      const v = b.body.velocity;
      if (Math.hypot(v.x, v.y) > cfg.settleSpeed || Math.abs(b.body.angularVelocity) > cfg.settleAngular) return false;
    }
    return true;
  }

  allCleared() {
    return this.boards.every((b) => b.gone || b.broken);
  }

  // ---- 撤销用：保存 / 恢复 ----
  snapshot() {
    return this.boards.map((b) => ({
      falling: b.falling, gone: b.gone, broken: b.broken, impacted: b.impacted, locked: b.locked,
      pins: [...b.pins], ropeCut: b.rope ? b.rope.cut : null,
      body: this.physics.getState(b.body),
    }));
  }

  restore(snap, screws) {
    // 先拆掉所有约束，再按快照重建
    for (const s of screws) if (s.c) { this.physics.removeConstraint(s.c); s.c = null; }
    this.boards.forEach((b, i) => {
      const st = snap[i];
      if (b.rope && b.rope.c) { this.physics.removeConstraint(b.rope.c); b.rope.c = null; }
      Object.assign(b, { falling: st.falling, gone: st.gone, broken: st.broken, impacted: st.impacted, locked: st.locked, fallSteps: 0 });
      b.pins = new Set(st.pins);
      if (b.gone || b.broken) { this.physics.removeBody(b.body); return; }
      this.physics.addBody(b.body);
      this.physics.setState(b.body, st.body);
      if (b.rope) {
        b.rope.cut = st.ropeCut;
        if (!b.rope.cut) {
          const p = rotate(b.rope.bx - b.c0.x, b.rope.by - b.c0.y, b.body.angle);
          b.rope.c = this.physics.rope(b.body, b.rope.ax, b.rope.ay, b.body.position.x + p.x, b.body.position.y + p.y);
          b.rope.c.length = Math.hypot(b.rope.bx - b.rope.ax, b.rope.by - b.rope.ay);
        }
      }
    });
    for (const s of screws) {
      if (s.board < 0 || s.state !== 'on' || !s.pin) continue;
      const b = this.byId.get(s.board);
      if (b.pins.has(s.id) && !b.gone && !b.broken) s.c = this.physics.pin(b.body, s.x0, s.y0);
    }
  }
}

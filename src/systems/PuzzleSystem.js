// 拧螺丝核心规则 (一关的完整局面)：组合 PhysicsSystem / BoardSystem / BoxSystem / ObstacleSystem。
// 只做规则与状态，不画任何东西；通过事件总线通知表现层 (GameScene / AudioSystem / EffectSystem)。
// 无 DOM 依赖：tools/design_levels.mjs 与 tools/verify_levels.mjs 在 Node 里直接跑同一份代码。
import { PhysicsSystem } from './PhysicsSystem.js';
import { BoardSystem } from './BoardSystem.js';
import { BoxSystem } from './BoxSystem.js';
import { ObstacleSystem } from './ObstacleSystem.js';

export class PuzzleSystem {
  /**
   * @param {EventBus} events
   * @param {object} level  关卡数据 (LevelConfig 里的一关)
   * @param {object} [opts]
   *   rng: 随机数 (用于单钉下垂时的轻微扰动)；jitter: 扰动幅度
   *   assignColor(screw, puzzle): 关卡生成器用，颜色未定的螺丝在被拧下时临时决定颜色
   */
  constructor(events, level, opts = {}) {
    this.events = events;
    this.level = level;
    this.opts = opts;
    this.rng = opts.rng || Math.random;
    this.physics = new PhysicsSystem(events, {});
    this.boards = new BoardSystem(events, this.physics);
    this.box = new BoxSystem(events);
    this.obstacles = new ObstacleSystem(events, this.boards);
    this.screws = level.screws.map((s) => ({
      id: s.id, x0: s.x, y0: s.y, board: s.board, pin: s.pin !== false,
      colors: s.colors ? [...s.colors] : [null], hidden: !!s.hidden, frost: s.frost || 0, bomb: s.bomb || 0,
      key: s.key || null, layer: s.layer, state: 'on', c: null, local: null,
    }));
    this.byId = new Map(this.screws.map((s) => [s.id, s]));
    this.boards.load(level.boards, this.screws);
    this.obstacles.load(level.chains);
    this.hangers = new Map();
    for (const b of this.boards.boards) if (b.rope) this.hangers.set(b.rope.hanger, b);
    this.box.remainingOf = opts.assignColor ? () => 1 : (c) => this.remainingOf(c);
    this.box.onBoxed = (p) => this.obstacles.onBoxed(p);
    if (!opts.assignColor) this.box.needMap = () => this.needMap();
    this.allColors = [...new Set(this.screws.flatMap((s) => s.colors).filter(Boolean))];
    this.box.load(level.boxQueue, level.slots || 2, level.holes);
    this.physics.afterStep = () => this.boards.postStep();
    this.status = 'play';
    this.failReason = null;
    this.taps = 0;
    this.maxHolesUsed = 0;
    this.history = [];
    this.nextPieceId = 1;
  }

  // ------------------------------------------------------------ 查询
  screw(id) { return this.byId.get(id); }
  posOf(s) { return this.boards.screwPos(s); }

  /** 不能拧的原因：covered / frozen / chained / locked / gone；null = 能拧 */
  blockReason(s) {
    if (!s || s.state !== 'on') return 'gone';
    if (this.boards.coveredBy(s)) return 'covered';
    return this.obstacles.blockReason(s);
  }

  tappable() { return this.screws.filter((s) => !this.blockReason(s)); }

  /** 拧这颗会放进收纳区的钉帽颜色 (挂钉：连同吊着的整块板上的螺丝) */
  takeColors(s) {
    const out = [s.colors[0]];
    if (s.colors.length <= 1 && this.hangers.has(s.id)) {
      const rb = this.hangers.get(s.id);
      for (const o of this.screws) if (o.board === rb.id && o.state === 'on') out.push(...o.colors);
    }
    return out;
  }

  /** 收纳区现在放得下拧这颗带出来的所有钉帽吗 */
  canTake(s) {
    const cols = this.takeColors(s);
    if (cols.some((c) => c == null)) return true;      // 生成器模式：颜色拧下来时才定
    if (cols.length === 1) return !!this.box.findRoute(cols[0]);
    return this.box.canFit(cols);
  }

  /** 每种颜色还需要几个盒子 (盒子队列对账用) */
  needMap() {
    const need = {};
    for (const c of this.allColors) {
      let room = 0;
      for (const b of this.box.slots) if (b && b.color === c) room += 3 - b.pieces.length;
      need[c] = Math.max(0, Math.ceil((this.remainingOf(c) - room) / 3));
    }
    return need;
  }
  remainingOf(color) {
    let n = 0;
    for (const s of this.screws) if (s.state === 'on') for (const c of s.colors) if (c === color) n++;
    for (const p of this.box.holes) if (p && p.color === color) n++;
    return n;
  }

  /** 停稳并且没有板子还在往下掉 (判负、机器人、校验器都等到这个状态再看局面) */
  quiet() {
    return this.stable() && !this.boards.boards.some((b) => b.falling && !b.gone && !b.broken);
  }

  /** 板子都停稳了 (正在往下掉的不算) */
  stable() {
    const cfg = this.physics.cfg;
    for (const b of this.boards.boards) {
      if (b.gone || b.broken || b.falling) continue;
      const v = b.body.velocity;
      if (Math.hypot(v.x, v.y) > cfg.settleSpeed || Math.abs(b.body.angularVelocity) > cfg.settleAngular) return false;
    }
    return true;
  }

  /** 卡死判定 (只在稳定时调用)：返回失败原因或 null */
  checkFail() {
    if (this.status !== 'play') return null;
    if (!this.boards.boards.some((b) => this.boards.isSolid(b))) return null;
    const tap = this.tappable();
    if (!tap.length) return 'stuck';
    if (!tap.some((s) => this.canTake(s))) return 'holes';
    return null;
  }

  // ------------------------------------------------------------ 操作
  _color(s) {
    if (s.colors[0] == null && this.opts.assignColor) s.colors[0] = this.opts.assignColor(s, this);
    return s.colors[0];
  }

  /** 点一颗螺丝。force = 螺丝刀 (无视遮挡和障碍) */
  tap(id, { force = false } = {}) {
    const s = this.byId.get(id);
    if (this.status !== 'play') return { ok: false, reason: 'over' };
    if (!s || s.state !== 'on') return { ok: false, reason: 'gone' };
    if (!force) {
      const reason = this.blockReason(s);
      if (reason) { this.events.emit('tap:refused', { screw: s, reason }); return { ok: false, reason }; }
    }
    this._color(s);
    if (!this.canTake(s)) {
      this.events.emit('tap:refused', { screw: s, reason: this.takeColors(s).length > 1 ? 'ropeFull' : 'full' });
      return { ok: false, reason: 'full' };
    }
    this.history.push(this.snapshot());
    this.taps++;
    const piece = this._remove(s, { force });
    this._afterAction(s.id);
    return { ok: true, piece };
  }

  /** 拧下一颗螺丝 (或双层螺丝的外层钉帽)，放进盒子/临时孔，并处理连带效果 */
  _remove(s, { force = false, dumped = false } = {}) {
    const color = this._color(s);
    const pos = this.posOf(s);
    const fully = s.colors.length <= 1;
    const piece = {
      id: this.nextPieceId++, color, screwId: s.id, hidden: s.hidden, key: fully ? s.key : null,
      x: pos.x, y: pos.y, outer: !fully,
    };
    if (fully) { s.state = 'gone'; } else { s.colors.shift(); }
    this.events.emit('screw:out', { screw: s, piece, pos, force, fully, dumped });
    const route = this.box.place(piece);
    if (!route) { this._overflow = true; }
    this.box.settle();
    if (fully) {
      const jitter = this.opts.jitter ? (this.rng() - 0.5) * this.opts.jitter : 0;
      this.boards.unpin(s, jitter, this.byId);
    }
    this.obstacles.onRemoved(s, pos, this.screws, (o) => this.posOf(o), fully);
    if (fully && this.hangers.has(s.id)) {
      const rb = this.hangers.get(s.id);
      this.boards.cutRope(rb);
      this._dump(rb);
    }
    return piece;
  }

  /** 绳吊板掉下来：板上剩下的螺丝全部被带进收纳区 */
  _dump(board) {
    for (const o of this.screws) {
      if (o.board !== board.id || o.state !== 'on') continue;
      while (o.state === 'on') this._remove(o, { dumped: true });
    }
  }

  _afterAction(exceptId) {
    this.box.settle();
    this._fixLocks();
    this.maxHolesUsed = Math.max(this.maxHolesUsed, this.box.usedHoles);
    if (this._overflow) { this._overflow = false; this.fail('overflow'); return; }
    const exploded = this.obstacles.tick(this.screws, exceptId);
    if (exploded) { this.fail('bomb', { screw: exploded }); return; }
    this.checkWin();
  }

  /** 小锤：敲碎一整块板子，板上所有螺丝进收纳区；放不下就不让敲 */
  hammer(boardId) {
    const b = this.boards.get(boardId);
    if (this.status !== 'play' || !b || !this.boards.isSolid(b)) return { ok: false, reason: 'gone' };
    const before = this.snapshot();
    const on = this.screws.filter((s) => s.board === b.id && s.state === 'on');
    // 试放：放不下就回滚
    const quiet = this.events.emit.bind(this.events);
    const buffered = [];
    this.events.emit = (name, payload) => buffered.push([name, payload]);
    let okAll = true;
    for (const s of on) {
      while (s.state === 'on') {
        if (!this.box.findRoute(this._color(s))) { okAll = false; break; }
        this._remove(s, { force: true, dumped: true });
      }
      if (!okAll) break;
    }
    this.events.emit = quiet;
    if (!okAll || this._overflow) {
      this._overflow = false;
      this.restore(before);
      this.events.emit('tap:refused', { screw: null, reason: 'hammerFull', board: b });
      return { ok: false, reason: 'full' };
    }
    this.history.push(before);
    this.taps++;
    this.boards.shatter(b, this.screws);
    this.events.emit('item:hammer', { board: b });
    for (const [n, p] of buffered) {
      if ((n === 'board:fall' || n === 'board:pins') && p.board === b) continue;
      this.events.emit(n, p);
    }
    this._afterAction(-1);
    return { ok: true };
  }

  /** 钥匙钉已经不在了 (进盒以外的方式丢掉) 的锁直接打开，避免永远打不开 */
  _fixLocks() {
    for (const b of this.boards.boards) {
      if (!b.locked) continue;
      const keys = this.screws.filter((s) => s.key === b.lock);
      const alive = keys.some((s) => s.state === 'on') || this.box.holes.some((p) => p && p.key === b.lock);
      if (!alive) {
        b.locked = false;
        this.events.emit('lock:open', { board: b, key: b.lock });
      }
    }
  }

  addHole() { this.box.addHole(); this.box.settle(); }

  addSlot() { this.box.addSlot(); this.checkWin(); }

  shuffle() {
    const w = {};
    for (const s of this.tappable()) if (s.colors[0]) w[s.colors[0]] = (w[s.colors[0]] || 0) + 1;
    for (const p of this.box.holes) if (p) w[p.color] = (w[p.color] || 0) + 2;
    return this.box.shuffle(w);
  }

  undo() {
    if (!this.history.length) return false;
    const snap = this.history.pop();
    this.restore(snap);
    this.events.emit('puzzle:undo', {});
    return true;
  }

  /** 看广告复活 */
  revive(cfg) {
    if (this.status !== 'fail') return false;
    if (this.failReason === 'bomb') {
      for (const s of this.screws) if (s.state === 'on' && (s.bomb > 0 || s === this.failScrew)) s.bomb += cfg.bombSteps;
    } else {
      this.box.addHole();
      this.box.clearHoles(cfg.clearHoles);
      this.box.settle();
      this._fixLocks();
    }
    this.status = 'play';
    this.failReason = null;
    this.failScrew = null;
    this.events.emit('puzzle:revive', {});
    return true;
  }

  fail(reason, extra = {}) {
    if (this.status !== 'play') return;
    this.status = 'fail';
    this.failReason = reason;
    this.failScrew = extra.screw || null;
    this.events.emit('puzzle:fail', { reason, ...extra });
  }

  checkWin() {
    if (this.status !== 'play') return;
    if (this.boards.boards.some((b) => this.boards.isSolid(b))) return;
    if (this.screws.some((s) => s.state === 'on')) return;
    this.status = 'win';
    this.events.emit('puzzle:win', { taps: this.taps });
  }

  // ------------------------------------------------------------ 时间推进
  update(dt) {
    this.physics.step(dt);
    this.checkWin();
  }

  stepFixed() {
    this.physics.stepFixed();
    this.checkWin();
  }

  // ------------------------------------------------------------ 撤销
  snapshot() {
    return {
      screws: this.screws.map((s) => ({ state: s.state, colors: [...s.colors], frost: s.frost, bomb: s.bomb })),
      boards: this.boards.snapshot(),
      box: this.box.snapshot(),
      obstacles: this.obstacles.snapshot(),
      taps: this.taps,
    };
  }

  restore(snap) {
    // 道具买来的孔位 / 第三个盒位是永久的：退一步不能把它们退掉
    const nHoles = this.box.holes.length; const nSlots = this.box.slots.length;
    this.screws.forEach((s, i) => Object.assign(s, snap.screws[i], { colors: [...snap.screws[i].colors] }));
    this.boards.restore(snap.boards, this.screws);
    this.box.restore(snap.box);
    while (this.box.holes.length < nHoles) this.box.holes.push(null);
    while (this.box.slots.length < nSlots) this.box.slots.push(null);
    this.obstacles.restore(snap.obstacles);
    this.box.settle();
    this.taps = snap.taps;
    this.status = 'play';
    this.failReason = null;
  }

  destroy() {
    this.physics.destroy();
  }
}

// 收纳系统：同色收纳盒 (每盒 3 孔，2~3 个盒位) + 盒子队列 + 临时孔。
// - 拧下的螺丝优先进同色且没满的盒子，否则进临时孔
// - 盒子装满 3 颗即合上飞走，队列里的下一个补位；新盒子到位时，临时孔里的同色螺丝自动飞进去
// - 某颜色在场上和临时孔里都没有了，这个颜色的盒子直接合上 (复活收走螺丝后不会卡队列)
// - 盒子队列随时和"还剩下的螺丝"对账 (reconcile)：每种颜色排队的盒子数 = 还没地方去的钉帽数 / 3。
//   正常玩时队列本来就是对得上的 (关卡设计的顺序原样保留)；复活收走螺丝、换盒、溢出之后多余的盒子会被
//   拿掉、缺的盒子补到队尾 (临时孔里有的颜色排前面)，保证任何道具之后都不会出现"螺丝没有盒子可去"。
export class BoxSystem {
  constructor(events) {
    this.events = events;
    this.slots = [];      // 当前开放的盒位：box | null
    this.queue = [];      // 后续盒子颜色
    this.holes = [];      // 临时孔：piece | null
    this.nextBoxId = 1;
    this.remainingOf = () => 1; // 由 PuzzleSystem 注入：某颜色还剩多少颗 (场上 + 临时孔)
    this.onBoxed = () => {};    // 由 PuzzleSystem 注入：螺丝进盒回调 (钥匙钉开锁)
    this.closedCount = 0;
    this.needMap = null;        // 由 PuzzleSystem 注入：() => { 颜色: 还需要几个盒子 }；生成器模式下为 null (队列固定)
  }

  load(queue, slotCount, holeCount) {
    this.queue = [...queue];
    this.slots = [];
    for (let i = 0; i < slotCount; i++) this.slots.push(this.takeNext(i, false));
    this.holes = new Array(holeCount).fill(null);
  }

  takeNext(slot, emit = true) {
    if (!this.queue.length) return null;
    const box = { id: this.nextBoxId++, color: this.queue.shift(), pieces: [], slot };
    if (emit) this.events.emit('box:arrive', { box, slot });
    return box;
  }

  get freeHoles() { return this.holes.filter((h) => !h).length; }
  get usedHoles() { return this.holes.filter(Boolean).length; }

  /** 颜色 color 的螺丝现在拧下来会去哪：{type:'box',box} | {type:'hole',index} | null */
  findRoute(color) {
    for (const box of this.slots) if (box && box.color === color && box.pieces.length < 3) return { type: 'box', box };
    const idx = this.holes.indexOf(null);
    return idx >= 0 ? { type: 'hole', index: idx } : null;
  }

  boxHasRoom(color) {
    return this.slots.some((b) => b && b.color === color && b.pieces.length < 3);
  }

  /** 放入一颗螺丝 (piece)，返回去向 */
  place(piece) {
    const r = this.findRoute(piece.color);
    if (!r) return null;
    if (r.type === 'box') {
      r.box.pieces.push(piece);
      this.events.emit('piece:box', { piece, box: r.box, slot: r.box.slot, index: r.box.pieces.length - 1, from: 'screw' });
      this.onBoxed(piece);
    } else {
      this.holes[r.index] = piece;
      this.events.emit('piece:hole', { piece, index: r.index });
    }
    return r;
  }

  /** 队列对账：多余的盒子拿掉 (从队尾)，缺的盒子补到队尾；返回是否改动 */
  reconcile() {
    if (!this.needMap) return false;
    const need = this.needMap();
    const have = {};
    for (const c of this.queue) have[c] = (have[c] || 0) + 1;
    let changed = false;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const c = this.queue[i];
      if ((have[c] || 0) > (need[c] || 0)) { have[c]--; this.queue.splice(i, 1); changed = true; }
    }
    const inHoles = {};
    for (const p of this.holes) if (p) inHoles[p.color] = (inHoles[p.color] || 0) + 1;
    const missing = [];
    for (const c of Object.keys(need)) for (let k = have[c] || 0; k < need[c]; k++) missing.push(c);
    if (missing.length) {
      missing.sort((a, b) => (inHoles[b] || 0) - (inHoles[a] || 0));
      this.queue.push(...missing);
      changed = true;
    }
    return changed;
  }

  /** 试放：按顺序放进这些颜色 (含装满换盒、临时孔回收) 能不能全放下；不改动真实状态 */
  canFit(colors) {
    const sim = new BoxSystem({ emit() {} });
    sim.restore(this.snapshot());
    sim.remainingOf = () => 1;
    for (const c of colors) {
      if (!sim.place({ color: c })) return false;
      sim.settle();
    }
    return true;
  }

  /** 处理装满 / 补位 / 临时孔回收，直到稳定 */
  settle() {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      this.reconcile();
      for (let i = 0; i < this.slots.length; i++) {
        if (!this.slots[i] && this.queue.length) { this.slots[i] = this.takeNext(i); changed = true; }
      }
      for (let i = 0; i < this.slots.length; i++) {
        const box = this.slots[i];
        if (!box) continue;
        const full = box.pieces.length >= 3;
        const orphan = !full && this.remainingOf(box.color) === 0;
        if (full || orphan) {
          this.closedCount++;
          this.events.emit('box:full', { box, slot: i, orphan });
          this.slots[i] = this.takeNext(i);
          changed = true;
        }
      }
      // 临时孔 -> 盒子
      for (let h = 0; h < this.holes.length; h++) {
        const p = this.holes[h];
        if (!p) continue;
        const box = this.slots.find((b) => b && b.color === p.color && b.pieces.length < 3);
        if (box) {
          this.holes[h] = null;
          box.pieces.push(p);
          this.events.emit('piece:box', { piece: p, box, slot: box.slot, index: box.pieces.length - 1, from: 'hole', hole: h });
          this.onBoxed(p);
          changed = true;
        }
      }
    }
  }

  addHole() {
    this.holes.push(null);
    this.events.emit('holes:add', { count: this.holes.length });
  }

  addSlot() {
    const i = this.slots.length;
    this.slots.push(this.takeNext(i));
    this.events.emit('slot:add', { slot: i });
    this.settle();
  }

  /** 复活：收走临时孔里最早放进去的 n 颗 (钥匙钉不收，免得锁永远打不开) */
  clearHoles(n) {
    const out = [];
    for (let h = 0; h < this.holes.length && out.length < n; h++) {
      if (this.holes[h] && !this.holes[h].key) { out.push({ piece: this.holes[h], index: h }); this.holes[h] = null; }
    }
    if (out.length) this.events.emit('holes:clear', { cleared: out });
    return out;
  }

  /** 换盒：空盒子与队列重新排颜色，优先排临时孔里最多、场上能拧到的颜色 */
  shuffle(weights) {
    const emptySlots = this.slots.map((b, i) => (b && b.pieces.length === 0 ? i : -1)).filter((i) => i >= 0);
    const pool = [...this.queue, ...emptySlots.map((i) => this.slots[i].color)];
    if (pool.length < 2) return false;
    const score = (c) => (weights[c] || 0);
    // 稳定排序 + 轻微打乱，避免每次都一样
    const keyed = pool.map((c, i) => ({ c, k: score(c) * 10 + ((i * 7919) % 13) / 13 }));
    keyed.sort((a, b) => b.k - a.k);
    const sorted = keyed.map((x) => x.c);
    // 同一种颜色别连着占两个盒位
    const head = [];
    for (const c of sorted) if (head.length < emptySlots.length && !head.includes(c)) head.push(c);
    const rest = [...sorted];
    for (const c of head) rest.splice(rest.indexOf(c), 1);
    while (head.length < emptySlots.length && rest.length) head.push(rest.shift());
    emptySlots.forEach((si, k) => {
      this.slots[si] = { id: this.nextBoxId++, color: head[k], pieces: [], slot: si };
    });
    this.queue = rest;
    this.events.emit('boxes:shuffle', { slots: emptySlots });
    this.settle();
    return true;
  }

  snapshot() {
    return {
      slots: this.slots.map((b) => (b ? { id: b.id, color: b.color, slot: b.slot, pieces: [...b.pieces] } : null)),
      queue: [...this.queue],
      holes: [...this.holes],
      nextBoxId: this.nextBoxId,
      closedCount: this.closedCount,
    };
  }

  restore(s) {
    this.slots = s.slots.map((b) => (b ? { ...b, pieces: [...b.pieces] } : null));
    this.queue = [...s.queue];
    this.holes = [...s.holes];
    this.nextBoxId = s.nextBoxId;
    this.closedCount = s.closedCount;
  }
}

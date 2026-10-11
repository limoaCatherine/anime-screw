// 障碍系统：锁链 / 冰冻 / 钥匙锁 / 炸弹 / 隐色 / 双层 的规则判断 (玻璃板与绳吊板的物理在 BoardSystem)。
// 规则数值 (冰冻范围等) 读 GameConfig，具体每关放什么障碍由关卡数据决定，这里没有关卡/难度分支。
import { GameConfig } from '../config/GameConfig.js';

export class ObstacleSystem {
  constructor(events, boards) {
    this.events = events;
    this.boards = boards;
    this.chains = [];
  }

  load(chains) {
    this.chains = (chains || []).map((c, i) => ({ id: i, a: c.a, b: c.b, lock: c.lock, broken: false }));
  }

  /** 螺丝因障碍不能拧的原因；null = 没有障碍 */
  blockReason(s) {
    if (s.frost > 0) return 'frozen';
    for (const c of this.chains) if (!c.broken && (c.a === s.id || c.b === s.id)) return 'chained';
    if (s.board >= 0) {
      const b = this.boards.get(s.board);
      if (b.locked) return 'locked';
    }
    return null;
  }

  chainOf(s) {
    return this.chains.find((c) => !c.broken && (c.a === s.id || c.b === s.id || c.lock === s.id)) || null;
  }

  /** 一颗螺丝 (或一层钉帽) 被拧下：链条断开、周围的霜化一层 */
  onRemoved(s, pos, screws, posOf, fully) {
    if (fully) {
      for (const c of this.chains) {
        if (!c.broken && (c.lock === s.id || c.a === s.id || c.b === s.id)) {
          c.broken = true;
          this.events.emit('chain:break', { chain: c, by: s.id });
        }
      }
    }
    const R = GameConfig.frostRadius;
    for (const o of screws) {
      if (o === s || o.state !== 'on' || !(o.frost > 0)) continue;
      const p = posOf(o);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) <= R || Math.hypot(o.x0 - s.x0, o.y0 - s.y0) <= R) {
        o.frost--;
        this.events.emit('frost:crack', { screw: o, left: o.frost });
      }
    }
    // 兜底：周围剩下的钉帽已经不够把冰敲开了 (比如邻居被锤子/绳吊一起带走、板子晃远了)，
    // 冰层降到"还能敲开"的程度，保证冰冻螺丝永远解得开
    for (const o of screws) {
      if (o.state !== 'on' || !(o.frost > 0)) continue;
      const po = posOf(o);
      let potential = 0;
      for (const n of screws) {
        if (n === o || n.state !== 'on' || n.frost > 0) continue;   // 自己也冻着的邻居不算
        const pn = posOf(n);
        const near = Math.hypot(pn.x - po.x, pn.y - po.y) <= R || Math.hypot(n.x0 - o.x0, n.y0 - o.y0) <= R;
        if (near) potential += n.colors.length;
      }
      if (o.frost > potential) {
        o.frost = potential;
        this.events.emit('frost:crack', { screw: o, left: o.frost });
      }
    }
  }

  /** 钥匙钉进了收纳盒：对应的锁打开 */
  onBoxed(piece) {
    if (!piece.key) return;
    for (const b of this.boards.boards) {
      if (b.lock === piece.key && b.locked) {
        b.locked = false;
        this.events.emit('lock:open', { board: b, key: piece.key });
      }
    }
  }

  /** 每次操作后：炸弹引信 -1；返回是否有炸弹归零 */
  tick(screws, exceptId) {
    let exploded = null;
    for (const s of screws) {
      if (s.state !== 'on' || !(s.bomb > 0) || s.id === exceptId) continue;
      s.bomb--;
      this.events.emit('bomb:tick', { screw: s, left: s.bomb });
      if (s.bomb <= 0 && !exploded) exploded = s;
    }
    return exploded;
  }

  snapshot() { return this.chains.map((c) => c.broken); }
  restore(s) { this.chains.forEach((c, i) => { c.broken = s[i]; }); }
}

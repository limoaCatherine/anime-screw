// 无头模拟工具：等物理稳定、机器人试玩。生成器与校验器共用。
export function settle(puzzle, { minSteps = 10, maxSteps = 400, calm = 20 } = {}) {
  let quiet = 0;
  let n = 0;
  for (; n < maxSteps; n++) {
    puzzle.stepFixed();
    if (n >= minSteps) {
      if (puzzle.quiet()) { if (++quiet >= calm) break; } else quiet = 0;
    }
  }
  return n;
}

/** 跑完正在下落的板子 (检查它们确实掉出屏幕) */
export function drain(puzzle, maxSteps = 600) {
  for (let i = 0; i < maxSteps; i++) {
    if (puzzle.boards.boards.every((b) => b.gone || b.broken)) return i;
    puzzle.stepFixed();
  }
  return -1;
}

/**
 * "普通玩家"机器人：能直接进盒就进盒 (随机挑一颗)，引信快烧完的炸弹优先；
 * 否则还有空孔就随便拧一颗；不看后面的盒子队列，也不做长远规划。
 */
export function botPlay({ PuzzleSystem, EventBus }, level, rng, opts = {}) {
  const puzzle = new PuzzleSystem(new EventBus(), level, { rng, jitter: opts.jitter ?? 0.004 });
  let guard = 0;
  let result = 'timeout';
  while (guard++ < 400) {
    settle(puzzle, { maxSteps: opts.maxSettle || 240 });
    if (puzzle.status === 'win') { result = 'win'; break; }
    if (puzzle.status === 'fail') { result = puzzle.failReason; break; }
    const f = puzzle.checkFail();
    if (f) { result = f; break; }
    const taps = puzzle.tappable();
    const box = puzzle.box;
    const known = (s) => !s.hidden;
    const routeOk = (s) => puzzle.canTake(s);
    const urgent = taps.filter((s) => s.bomb > 0 && s.bomb <= 2 && routeOk(s));
    const match = taps.filter((s) => known(s) && box.boxHasRoom(s.colors[0]));
    let pick = null;
    if (urgent.length) pick = rng.pick(urgent);
    else if (match.length) pick = rng.pick(match);
    else if (box.freeHoles > 0 && taps.some(routeOk)) pick = rng.pick(taps.filter(routeOk));
    else {
      const hid = taps.filter((s) => !known(s) && routeOk(s));
      if (hid.length) pick = rng.pick(hid);
    }
    if (!pick) { result = 'holes'; break; }
    const r = puzzle.tap(pick.id);
    if (!r.ok) { result = 'refused:' + r.reason; break; }
  }
  const out = { result, taps: puzzle.taps, maxHoles: puzzle.maxHolesUsed };
  puzzle.destroy();
  return out;
}

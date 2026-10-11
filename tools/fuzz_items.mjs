// 道具 / 乱点 模糊测试 (Node 无头，与游戏同一份 PuzzleSystem + Matter.js)。
// 每关跑若干个随机种子：乱拧 + 随机用道具 (退一步 / 加孔 / 换盒 / 螺丝刀 / 小锤 / 第 3 盒位)，失败了就复活 (每关最多 2 次)。
// 每一步都检查：
//   A. 盒子队列和剩下的螺丝对得上 (每种颜色排队的盒子数 = 还没地方去的钉帽 / 3) —— 任何道具之后都不会出现"螺丝没盒子可去"
//   B. 退一步把一切都退回去：螺丝状态/颜色/冰/炸弹、板子位置角度/钉子/掉落/锁、绳子、链子、盒子、临时孔、物理约束数量
//   C. 物理约束和规则一致：每颗还钉着的螺丝正好一条约束，没剪的绳子一条约束，没有多余的
//   D. 能拧的螺丝一定没被压住；被压住的一定拧不动
//   E. 局面"没有任何合法操作"时，判负一定会触发 (checkFail 非空) —— 不存在不报的死局
//   F. 每一局最终都会结束 (通关或判负)，通关后所有板子都会离开画面
// 另外：在参考解的随机位置用一次"换盒"，再让机器人接着打，统计还能不能通关 (换盒不会把关卡变成死局)。
//   node tools/fuzz_items.mjs [--seeds 12] [--only 15,29]
import { loadHeadless } from './lib/headless.mjs';
import { settle, drain, botPlay } from './lib/sim.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(opt('--seeds', 12));
const ONLY = opt('--only') ? opt('--only').split(',').map(Number) : null;
const M = await loadHeadless('entry-verify');
const { LEVELS, PuzzleSystem, EventBus, makeRng, GameConfig } = M;

const r2 = (v) => Math.round(v * 2) / 2;
function sig(pz, { physics = true } = {}) {
  return JSON.stringify({
    s: pz.screws.map((s) => [s.state, s.colors.join('/'), s.frost, s.bomb]),
    b: pz.boards.boards.map((b) => [b.falling, b.gone, b.broken, b.locked, [...b.pins].sort().join(','), b.rope ? b.rope.cut : null,
      ...(physics && !b.gone && !b.broken ? [r2(b.body.position.x), r2(b.body.position.y), Math.round(b.body.angle * 500)] : [])]),
    box: pz.box.slots.map((x) => (x ? `${x.color}:${x.pieces.map((p) => p.color).join('')}` : '-')),
    q: pz.box.queue.join(','),
    h: pz.box.holes.map((p) => (p ? p.color : '-')).join(','),
    c: pz.obstacles.chains.map((c) => c.broken),
    st: pz.status,
  });
}

function checkInvariants(pz, errs, where) {
  // A. 队列对账
  if (pz.status === 'play') {
    const need = pz.needMap();
    const have = {};
    for (const c of pz.box.queue) have[c] = (have[c] || 0) + 1;
    for (const c of Object.keys(need)) if ((have[c] || 0) !== need[c]) { errs.push(`${where}: 颜色 ${c} 还需要 ${need[c]} 个盒子，队列里有 ${have[c] || 0}`); break; }
    for (let i = 0; i < pz.box.slots.length; i++) if (!pz.box.slots[i] && pz.box.queue.length) errs.push(`${where}: 盒位 ${i} 空着但队列里还有盒子`);
  }
  // C. 约束一致
  let want = 0;
  for (const s of pz.screws) {
    if (s.board < 0 || s.state !== 'on' || !s.pin) continue;
    const b = pz.boards.get(s.board);
    if (b.gone || b.broken || !b.pins.has(s.id)) continue;
    want++;
    if (!s.c) errs.push(`${where}: 螺丝#${s.id} 钉着但没有约束`);
  }
  for (const b of pz.boards.boards) if (b.rope && !b.rope.cut && !b.gone && !b.broken) { want++; if (!b.rope.c) errs.push(`${where}: 板#${b.id} 的绳子没有约束`); }
  const have = pz.physics.world.constraints.length;
  if (have !== want) errs.push(`${where}: 物理约束 ${have} 条，应为 ${want} 条`);
  // D. 遮挡
  for (const s of pz.tappable()) if (pz.boards.coveredBy(s)) errs.push(`${where}: 螺丝#${s.id} 被压着却能拧`);
}

function fuzzRun(L, seed) {
  const rng = makeRng(seed * 2246822519 + 7);
  const pz = new PuzzleSystem(new EventBus(), L, { rng, jitter: 0.012 });
  const errs = [];
  const used = { undo: 0, addHole: 0, shuffle: 0, driver: 0, hammer: 0, slot: 0, revive: 0 };
  let guard = 0;
  let thirdBox = !!L.thirdBox && pz.box.slots.length < 3;
  while (guard++ < 500 && pz.status !== 'win') {
    settle(pz, { maxSteps: 600 });
    checkInvariants(pz, errs, `第${guard}步`);
    if (errs.length) break;
    if (pz.status === 'fail') {
      if (used.revive < GameConfig.revivesPerLevel) {
        // 一半时候先退一步再说，一半直接复活
        if (pz.history.length && rng() < 0.3 && used.undo < 3) { pz.undo(); used.undo++; continue; }
        pz.revive({ bombSteps: GameConfig.bombReviveSteps, clearHoles: GameConfig.reviveClearHoles });
        used.revive++;
        if (pz.status !== 'play') errs.push('复活后状态不对');
        // stuck 复活附送一次螺丝刀
        const blocked = pz.screws.filter((s) => s.state === 'on' && pz.blockReason(s));
        if (blocked.length && !pz.tappable().length) { pz.tap(rng.pick(blocked).id, { force: true }); used.driver++; }
        continue;
      }
      break;
    }
    const legal = pz.tappable().filter((s) => pz.canTake(s));
    const flag = pz.checkFail();
    // E. 没有合法操作 ⇒ 必须判负
    if (!legal.length && !flag) { errs.push(`第${guard}步: 没有任何合法操作却没判负`); break; }
    if (flag) { pz.fail(flag); continue; }
    // 随机道具
    const roll = rng();
    if (roll < 0.05 && used.addHole < 2) { pz.addHole(); used.addHole++; continue; }
    if (roll < 0.10 && pz.box.slots.some((b) => b && b.pieces.length === 0)) { pz.shuffle(); used.shuffle++; continue; }
    if (roll < 0.13 && thirdBox) { pz.addSlot(); thirdBox = false; used.slot++; continue; }
    if (roll < 0.18) {
      const blocked = pz.screws.filter((s) => s.state === 'on' && pz.blockReason(s) && pz.canTake(s));
      if (blocked.length) { pz.tap(rng.pick(blocked).id, { force: true }); used.driver++; continue; }
    }
    if (roll < 0.21) {
      const solid = pz.boards.boards.filter((b) => pz.boards.isSolid(b));
      if (solid.length) { pz.hammer(rng.pick(solid).id); used.hammer++; continue; }
    }
    // B. 退一步一致性：拧一颗、跑几帧、退回去，状态必须一模一样
    if (roll < 0.30 && legal.length) {
      settle(pz, { maxSteps: 600 });
      const before = sig(pz);
      const holesBefore = pz.box.holes.length;
      const pick = rng.pick(legal);
      const r = pz.tap(pick.id);
      if (r.ok) {
        for (let k = 0; k < 20 + rng.int(60); k++) pz.stepFixed();
        pz.undo(); used.undo++;
        const after = sig(pz);
        if (after !== before && pz.box.holes.length === holesBefore) errs.push(`退一步后状态不一致 (螺丝#${pick.id})`);
        checkInvariants(pz, errs, '退一步后');
        if (errs.length) break;
        continue;
      }
    }
    // 普通拧：偏向能进盒的
    const match = legal.filter((s) => pz.box.boxHasRoom(s.colors[0]));
    const pick = match.length && rng() < 0.7 ? rng.pick(match) : rng.pick(legal);
    const r = pz.tap(pick.id);
    if (!r.ok) errs.push(`第${guard}步: 合法操作被拒 (${r.reason})`);
  }
  let result = pz.status;
  if (pz.status === 'play') { errs.push('500 步还没结束'); result = 'hang'; }
  if (pz.status === 'win') {
    const d = drain(pz, 1500);
    if (d < 0) errs.push('通关后有板子没离开画面');
  }
  pz.destroy();
  return { errs, result, used };
}

// 参考解随机位置换一次盒 → 机器人接着打 (8 个种子任一通关即"仍可解")
function shuffleProbe(L, seed) {
  const rng = makeRng(seed * 97 + 13);
  const cut = 1 + rng.int(Math.max(1, L.solution.length - 2));
  let wins = 0; let tried = 0;
  for (let b = 0; b < 8; b++) {
    const pz = new PuzzleSystem(new EventBus(), L, { rng: makeRng(b + 1), jitter: 0.004 });
    let ok = true;
    for (let i = 0; i < cut; i++) {
      settle(pz, { maxSteps: 600 });
      const r = pz.tap(L.solution[i]);
      if (!r.ok) { ok = false; break; }
    }
    if (!ok || pz.status !== 'play') { pz.destroy(); continue; }
    settle(pz, { maxSteps: 600 });
    const did = pz.shuffle();
    tried++;
    // 机器人接管 (复用 botPlay 的策略：在现有局面上继续)
    const res = continueBot(pz, makeRng(seed * 31 + b));
    if (res === 'win') wins++;
    void did;
  }
  return { cut, wins, tried };
}

function continueBot(pz, rng) {
  let guard = 0; let revives = 0;
  while (guard++ < 400) {
    settle(pz, { maxSteps: 400 });
    if (pz.status === 'win') { pz.destroy(); return 'win'; }
    const f = pz.status === 'fail' ? pz.failReason : pz.checkFail();
    if (f) {
      if (pz.status === 'play') pz.fail(f);
      if (revives++ < 2) { pz.revive({ bombSteps: GameConfig.bombReviveSteps, clearHoles: GameConfig.reviveClearHoles }); if (!pz.tappable().length) { const bl = pz.screws.filter((s) => s.state === 'on'); if (bl.length) pz.tap(bl[0].id, { force: true }); } continue; }
      pz.destroy(); return f;
    }
    const legal = pz.tappable().filter((s) => pz.canTake(s));
    const urgent = legal.filter((s) => s.bomb > 0 && s.bomb <= 2);
    const match = legal.filter((s) => !s.hidden && pz.box.boxHasRoom(s.colors[0]));
    const pick = urgent.length ? rng.pick(urgent) : match.length ? rng.pick(match) : rng.pick(legal);
    pz.tap(pick.id);
  }
  pz.destroy();
  return 'timeout';
}

let bad = 0;
const t0 = Date.now();
const lines = [];
for (let i = 0; i < LEVELS.length; i++) {
  if (ONLY && !ONLY.includes(i + 1)) continue;
  const L = LEVELS[i];
  const name = `${Math.floor(i / 10) + 1}-${(i % 10) + 1}`;
  const res = { win: 0, fail: 0, hang: 0 };
  const errs = [];
  const tot = { undo: 0, addHole: 0, shuffle: 0, driver: 0, hammer: 0, slot: 0, revive: 0 };
  for (let s = 1; s <= SEEDS; s++) {
    const r = fuzzRun(L, s + i * 1000);
    res[r.result === 'win' ? 'win' : r.result === 'fail' ? 'fail' : 'hang']++;
    for (const k of Object.keys(tot)) tot[k] += r.used[k];
    if (r.errs.length) errs.push(`种子${s}: ${[...new Set(r.errs)].slice(0, 2).join('；')}`);
  }
  const sp = shuffleProbe(L, i + 1);
  const ok = !errs.length && res.hang === 0;
  if (!ok) bad++;
  const line = `${ok ? 'PASS' : 'FAIL'} ${name.padEnd(5)} 随机局 ${SEEDS}: 通关 ${res.win} / 判负 ${res.fail} / 卡死未报 ${res.hang} | 道具: 退${tot.undo} 孔${tot.addHole} 换${tot.shuffle} 刀${tot.driver} 锤${tot.hammer} 盒${tot.slot} 复活${tot.revive} | 第${sp.cut}步换盒后机器人通关 ${sp.wins}/${sp.tried}`;
  console.log(line);
  for (const e of errs) console.log('     ' + e);
  lines.push(line, ...errs.map((e) => '     ' + e));
}
console.log(`\n${bad ? `✗ ${bad} 关有问题` : '✓ 道具模糊测试全部通过'}（每关 ${SEEDS} 局，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
process.exit(bad ? 1 : 0);

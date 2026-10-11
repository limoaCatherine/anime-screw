// 关卡校验器：在 Node 里跑 Matter.js (与游戏同一份 vendor/matter.min.js + PuzzleSystem)，
// 对每一关、每个随机种子重放参考解，证明：
//   1. 数据自洽：每种颜色的钉帽数 = 该色盒子数 × 3；参考解覆盖全部螺丝
//   2. 参考解每一步点的螺丝在那一刻确实能拧 (没被压住、没被锁/链/冰挡住)，且有地方放
//   3. 物理正确：剩 1 颗钉的板绕那颗钉下垂 (钉点不脱开)；钉子拧光的板掉出屏幕并被移除
//   4. 最后所有板子都掉光、判定通关，炸弹不会提前炸
//   5. 遮挡 (v1.1)：每一帧检查点位，"能拧"的螺丝绝不能被更高层的板子压着——包括晃过来/转过来的板子、正在掉的板子；
//      用独立的几何算法 (点在多边形内 + 到边距离) 复核，不依赖游戏里的 coveredBy
//   6. 物理收尾 (v1.1)：不允许有板子靠"掉落超时"强制移除 (说明卡住了)；单钉晃动的板子最终会停下
//   7. 障碍数据 (v1.1)：钥匙螺丝不在自己锁住的板上、开局不被那块板压着；冰层数 ≤ 周围可拧钉帽数；
//      每种新障碍第一次出现的关卡只有它自己 (先单独教，再组合)
// 种子会改变：每步之间等待的帧数、单钉下垂时的初始扰动 (模拟玩家点得快慢不同、真机浮点差异)。
// 另外跑"普通玩家"机器人给出参考通关率，作为难度曲线参考。
//   node tools/verify_levels.mjs [--seeds 6] [--bot 24] [--only 1,2]
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadHeadless, root } from './lib/headless.mjs';
import { settle, drain, botPlay } from './lib/sim.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(opt('--seeds', 6));
const BOT = Number(opt('--bot', 24));
const ONLY = opt('--only') ? opt('--only').split(',').map(Number) : null;

const M = await loadHeadless('entry-verify');
const { LEVELS, PuzzleSystem, EventBus, makeRng, GameConfig } = M;

function checkData(L) {
  const errs = [];
  const count = {};
  for (const s of L.screws) {
    if (!s.colors || !s.colors.length || s.colors.some((c) => !GameConfig.screwColors[c])) errs.push(`螺丝#${s.id} 颜色缺失`);
    for (const c of s.colors || []) count[c] = (count[c] || 0) + 1;
  }
  const boxes = {};
  for (const c of L.boxQueue) boxes[c] = (boxes[c] || 0) + 1;
  for (const c of new Set([...Object.keys(count), ...Object.keys(boxes)])) {
    if ((count[c] || 0) !== (boxes[c] || 0) * 3) errs.push(`颜色 ${c}: 钉帽 ${count[c] || 0} 颗，盒子 ${boxes[c] || 0} 个`);
  }
  const caps = L.screws.reduce((n, s) => n + s.colors.length, 0);
  if (caps % 3) errs.push('钉帽总数不是 3 的倍数');
  return errs;
}

// ---- 独立的遮挡几何 (故意不复用游戏代码)
function inPoly(x, y, vs) {
  let c = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const a = vs[i]; const b = vs[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function segDist(px, py, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
function geomCovered(pz, s) {
  const p = pz.posOf(s);
  const myLayer = pz.boards.layerOf(s);
  const r = GameConfig.screw.coverRadius - 0.5;   // 0.5px 容差
  for (const b of pz.boards.boards) {
    if (b.gone || b.broken || b.layer <= myLayer || b.id === s.board) continue;
    const vs = b.body.vertices;
    if (inPoly(p.x, p.y, vs)) return b;
    for (let i = 0; i < vs.length; i++) if (segDist(p.x, p.y, vs[i], vs[(i + 1) % vs.length]) < r) return b;
  }
  return null;
}
/** 遮挡复核：能拧的不许被压；返回被"晃过来的板"压住的螺丝数 (说明这种情况被测到了) */
function checkOcclusion(pz, errs, where, startCovered) {
  let swungCover = 0;
  const tap = new Set(pz.tappable().map((s) => s.id));
  for (const s of pz.screws) {
    if (s.state !== 'on') continue;
    const g = geomCovered(pz, s);
    if (g && tap.has(s.id)) errs.push(`${where}: 螺丝#${s.id} 被板#${g.id} 压着却判定能拧`);
    if (g && pz.blockReason(s) !== 'covered' && pz.obstacles.blockReason(s) == null) errs.push(`${where}: 螺丝#${s.id} 被压但原因不是 covered`);
    if (g && !startCovered.has(s.id)) swungCover++;
  }
  return swungCover;
}

function checkObstacleData(L, intro) {
  const errs = [];
  const R = GameConfig.frostRadius;
  for (const b of L.boards) {
    if (!b.lock) continue;
    const keys = L.screws.filter((s) => s.key === b.lock);
    if (!keys.length) errs.push(`板#${b.id} 的锁没有钥匙螺丝`);
    for (const k of keys) if (k.board === b.id) errs.push(`钥匙螺丝#${k.id} 钉在自己锁住的板#${b.id} 上`);
  }
  for (const s of L.screws) {
    if (!(s.frost > 0)) continue;
    let pot = 0;
    for (const n of L.screws) if (n !== s && !(n.frost > 0) && Math.hypot(n.x - s.x, n.y - s.y) <= R) pot += n.colors.length;
    if (s.frost > pot) errs.push(`冰冻螺丝#${s.id} 霜 ${s.frost} 层，周围只有 ${pot} 颗钉帽`);
  }
  return errs;
}

function replay(L, seed) {
  const rng = makeRng(seed * 2654435761);
  const ev = new EventBus();
  const pz = new PuzzleSystem(ev, L, { rng, jitter: 0.012 });
  const errs = [];
  const unpinnedAt = new Map();   // 板子开始掉落的步数
  const pivots = new Map();       // 单钉下垂的板：钉子 id
  let swings = 0; let falls = 0; let gones = 0; let forced = 0; let swungCover = 0;
  const startCovered = new Set(pz.screws.filter((s) => pz.boards.coveredBy(s)).map((s) => s.id));
  // 开局数据：钥匙螺丝不能被它锁的板压着
  for (const b of pz.boards.boards) {
    if (!b.lock) continue;
    for (const k of pz.screws.filter((s) => s.key === b.lock)) {
      const g = geomCovered(pz, k);
      if (g && g.id === b.id) errs.push(`钥匙螺丝#${k.id} 开局被它锁住的板#${b.id} 压着`);
    }
  }
  ev.on('board:pins', ({ board, pins }) => {
    if (pins === 1) { pivots.set(board.id, [...board.pins][0]); swings++; }
  });
  ev.on('board:fall', ({ board }) => { unpinnedAt.set(board.id, pz.physics.steps); pivots.delete(board.id); falls++; });
  ev.on('board:gone', ({ board, forced: f }) => {
    gones++;
    if (f) { forced++; errs.push(`板#${board.id} 卡住了，靠掉落超时强制移除`); }
    const t = pz.physics.steps - (unpinnedAt.get(board.id) ?? pz.physics.steps);
    if (t > 900) errs.push(`板#${board.id} 掉了 ${t} 帧才出屏`);
  });
  ev.on('puzzle:fail', ({ reason }) => errs.push(`中途失败: ${reason}`));
  const checkPivots = () => {
    for (const [bid, sid] of pivots) {
      const b = pz.boards.get(bid); const s = pz.screw(sid);
      if (b.falling || b.gone || s.state !== 'on') continue;
      const local = s.local; const a = b.body.angle;
      const wx = b.body.position.x + local.x * Math.cos(a) - local.y * Math.sin(a);
      const wy = b.body.position.y + local.x * Math.sin(a) + local.y * Math.cos(a);
      const d = Math.hypot(wx - s.x0, wy - s.y0);
      if (d > 4) errs.push(`板#${bid} 下垂时脱开钉点 ${d.toFixed(1)}px`);
    }
  };
  let step = 0;
  for (const id of L.solution) {
    step++;
    // 玩家有快有慢：随机等 0~45 帧再点
    const wait = rng.int(46);
    for (let k = 0; k < wait; k++) {
      pz.stepFixed();
      if (k % 5 === 0) swungCover = Math.max(swungCover, checkOcclusion(pz, errs, `第 ${step} 步前`, startCovered));
    }
    checkPivots();
    swungCover = Math.max(swungCover, checkOcclusion(pz, errs, `第 ${step} 步`, startCovered));
    let reason = pz.blockReason(pz.screw(id));
    if (reason) { settle(pz, { maxSteps: 900, calm: 8 }); reason = pz.blockReason(pz.screw(id)); }
    if (reason) { errs.push(`第 ${step} 步 螺丝#${id} 拧不了 (${reason})`); break; }
    const r = pz.tap(id);
    if (!r.ok) { errs.push(`第 ${step} 步 螺丝#${id} 被拒 (${r.reason})`); break; }
    if (pz.status === 'fail') break;
  }
  settle(pz, { maxSteps: 300 });
  checkPivots();
  if (pz.status !== 'win') errs.push(`参考解跑完没有通关 (状态 ${pz.status}，剩余螺丝 ${pz.screws.filter((s) => s.state === 'on').length})`);
  const d = drain(pz, 1200);
  if (d < 0) errs.push('有板子没掉出屏幕');
  if (gones !== L.boards.length) errs.push(`出屏的板子 ${gones}/${L.boards.length}`);
  pz.destroy();
  return { errs, swings, falls, forced, swungCover };
}

function obstOf(L) {
  const obst = [];
  if (L.boards.some((b) => b.mat === 'glass')) obst.push('玻璃');
  if (L.chains && L.chains.length) obst.push('锁链');
  if (L.screws.some((s) => s.frost)) obst.push('冰冻');
  if (L.boards.some((b) => b.lock)) obst.push('钥匙锁');
  if (L.screws.some((s) => s.bomb)) obst.push('炸弹');
  if (L.screws.some((s) => s.hidden)) obst.push('隐色');
  if (L.boards.some((b) => b.rope)) obst.push('绳吊');
  if (L.screws.some((s) => s.colors.length > 1)) obst.push('双层');
  return obst;
}
// 新障碍首次出现：这一关只能有它这一种新东西 (首次登场必须单独教，之后才组合)
const seenObst = new Set();
const introAt = {};
const introErr = LEVELS.map((L, i) => {
  const name = `${Math.floor(i / 10) + 1}-${(i % 10) + 1}`;
  const obst = obstOf(L).filter((o) => o !== '玻璃');
  const fresh = obst.filter((o) => !seenObst.has(o));
  const others = obst.filter((o) => !fresh.includes(o));
  const e = [];
  if (fresh.length > 1) e.push(`首次出现的障碍不止一种: ${fresh.join('+')}`);
  if (fresh.length === 1 && others.length) e.push(`新障碍 ${fresh[0]} 第一次出现就和 ${others.join('+')} 混在一起`);
  for (const o of fresh) { seenObst.add(o); introAt[o] = name; }
  return e;
});

const lines = [];
let failed = 0;
const t0 = Date.now();
for (let i = 0; i < LEVELS.length; i++) {
  if (ONLY && !ONLY.includes(i + 1)) continue;
  const L = LEVELS[i];
  const name = `${Math.floor(i / 10) + 1}-${(i % 10) + 1}`;
  const dataErr = [...checkData(L), ...checkObstacleData(L), ...introErr[i]];
  const seedErrs = [];
  let swings = 0; let swungCover = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const r = replay(L, s + i * 100);
    swings = Math.max(swings, r.swings);
    swungCover = Math.max(swungCover, r.swungCover);
    if (r.errs.length) seedErrs.push(`种子${s}: ${[...new Set(r.errs)].slice(0, 3).join('；')}`);
  }
  let wins = 0;
  for (let b = 0; b < BOT; b++) if (botPlay(M, L, makeRng(777 + b * 31 + i)).result === 'win') wins++;
  const ok = !dataErr.length && !seedErrs.length;
  if (!ok) failed++;
  const obst = obstOf(L);
  const caps = L.screws.reduce((n, s) => n + s.colors.length, 0);
  const layers = new Set(L.boards.map((b) => b.layer)).size;
  const line = `${ok ? 'PASS' : 'FAIL'} ${name.padEnd(5)} 层${layers} 板${String(L.boards.length).padStart(2)} 钉帽${String(caps).padStart(2)} ${new Set(L.boxQueue).size}色 孔${L.holes} | 参考解 ${L.solution.length} 步 × ${SEEDS} 种子 | 单钉下垂 ${swings} 次 晃来压住 ${swungCover} 颗 | 机器人通关 ${String(Math.round((wins / BOT) * 100)).padStart(3)}% | ${obst.join('+') || '-'}`;
  console.log(line);
  for (const e of [...dataErr, ...seedErrs]) console.log('     ' + e);
  lines.push(line, ...[...dataErr, ...seedErrs].map((e) => '     ' + e));
}
const introLine = `障碍首次登场: ${Object.entries(introAt).map(([o, n]) => `${o} ${n}`).join('，')}`;
console.log('\n' + introLine);
lines.push('', introLine);
const summary = `\n${failed ? `✗ ${failed} 关未通过` : `✓ 全部 ${ONLY ? ONLY.length : LEVELS.length} 关通过`}（${SEEDS} 个种子，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`;
console.log(summary);
if (!ONLY) {
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/verify_report.txt'), `关卡校验报告 (node tools/verify_levels.mjs)\n生成时间: ${new Date().toLocaleString("zh-CN", { hour12: false })} (本机时间)\n\n${lines.join('\n')}\n${summary}\n`, 'utf8');
}
process.exit(failed ? 1 : 0);

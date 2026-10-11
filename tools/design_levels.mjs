// 关卡生成器：读 src/config/LevelBlueprints.js (手摆的板子与螺丝) + DifficultyConfig.js，
// 在 Node 里跑真实物理 (与游戏同一份 PuzzleSystem + Matter.js)，自动配出螺丝颜色、盒子队列、参考解，
// 再让"普通玩家"机器人试玩，从若干候选方案里挑通关率最接近目标的一个，写入 src/config/LevelData.js。
//   node tools/design_levels.mjs              # 全部重新生成
//   node tools/design_levels.mjs --only 5,15  # 只重做某几关 (其余保留)
//   node tools/design_levels.mjs --check      # 只做几何校验
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadHeadless, root } from './lib/headless.mjs';
import { settle, botPlay } from './lib/sim.mjs';
import { layoutLevel, addObstacles } from './lib/layout.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ONLY = opt('--only') ? opt('--only').split(',').map(Number) : null;
const CHECK = args.includes('--check');

const M = await loadHeadless('entry-design');
const { BLUEPRINTS, DIFFICULTY, GENERATOR, GameConfig, PuzzleSystem, EventBus, makeRng, pointInPoly, distToPolyEdge } = M;
const CHAPTER_MAIN = ['sky', 'pink', 'amber'];

// ---------------------------------------------------------------- 蓝图 -> 原始关卡
function compile(bp) {
  const boards = []; const screws = []; const tags = {};
  bp.boards.forEach((b, bi) => {
    const board = { id: bi, layer: b.layer, mat: b.mat, verts: b.v, seed: (bi * 131 + b.v.length * 17) % 997 };
    if (b.tint) board.tint = b.tint;
    if (b.lock) board.lock = b.lock;
    boards.push(board);
    for (const e of b.s) {
      const o = Array.isArray(e) ? { at: e } : e;
      const s = { id: screws.length, x: o.at[0], y: o.at[1], board: bi };
      if (b.rope) s.pin = false;
      if (o.frost) s.frost = o.frost;
      if (o.hidden) s.hidden = true;
      if (o.key) s.key = o.key;
      if (o.bomb) s.bomb = 999;
      s.colors = o.double ? [null, null] : [null];
      if (o.tag) tags[o.tag] = s.id;
      screws.push(s);
    }
    if (b.rope) {
      const ys = b.v.map((p) => p[1]);
      const xs = b.v.map((p) => p[0]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const hanger = { id: screws.length, x: b.rope[0], y: b.rope[1], board: -1, layer: b.layer, colors: [null] };
      screws.push(hanger);
      board.rope = { hanger: hanger.id, ax: b.rope[0], ay: b.rope[1], bx: cx, by: Math.min(...ys) + 10 };
    }
  });
  const chains = (bp.chains || []).map(([a, b, l]) => ({ a: tags[a], b: tags[b], lock: tags[l] }));
  return { boards, screws, chains };
}

function validate(raw, idx) {
  const errs = [];
  const G = GameConfig.screw;
  const pieces = raw.screws.reduce((n, s) => n + s.colors.length, 0);
  if (pieces % 3) errs.push(`螺丝(钉帽)数 ${pieces} 不是 3 的倍数`);
  for (const s of raw.screws) {
    if (s.board < 0) continue;
    const b = raw.boards[s.board];
    const vs = b.verts.map(([x, y]) => ({ x, y }));
    if (!pointInPoly(s.x, s.y, vs)) errs.push(`螺丝#${s.id} 不在板子#${b.id} 里`);
    else if (distToPolyEdge(s.x, s.y, vs) < G.edgeInset) errs.push(`螺丝#${s.id} 离板#${b.id} 边太近 (${distToPolyEdge(s.x, s.y, vs).toFixed(1)})`);
  }
  for (let i = 0; i < raw.screws.length; i++) {
    for (let j = i + 1; j < raw.screws.length; j++) {
      const a = raw.screws[i]; const b = raw.screws[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < G.minGap) errs.push(`螺丝#${a.id}(板${a.board}) 与 #${b.id}(板${b.board}) 太近 ${d.toFixed(1)}`);
    }
  }
  const F = GameConfig.layout.frame;
  for (const b of raw.boards) {
    for (const [x, y] of b.verts) {
      if (x < F.left - 6 || x > F.right + 6 || y < F.top - 6 || y > F.bottom + 6) { errs.push(`板#${b.id} 超出画框 (${x},${y})`); break; }
    }
    const n = b.verts.length; let sign = 0; let convex = true;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = b.verts[i]; const [x1, y1] = b.verts[(i + 1) % n]; const [x2, y2] = b.verts[(i + 2) % n];
      const cr = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
      if (Math.abs(cr) < 1e-6) continue;
      const sg = Math.sign(cr);
      if (sign && sg !== sign) convex = false;
      sign = sg;
    }
    if (!convex) errs.push(`板#${b.id} 不是凸多边形`);
  }
  if (raw.boards.some((b) => b.lock) && !raw.screws.some((s) => s.key)) errs.push('有锁没钥匙');
  return { errs, pieces };
}

// ---------------------------------------------------------------- 颜色方案
function makeQueue(counts, rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const bag = [];
    for (const [c, n] of Object.entries(counts)) for (let i = 0; i < n; i++) bag.push(c);
    rng.shuffle(bag);
    let ok = true;
    for (let i = 1; i < bag.length; i++) if (bag[i] === bag[i - 1] && new Set(bag).size > 1) { ok = false; break; }
    if (ok) return bag;
  }
  const bag = [];
  for (const [c, n] of Object.entries(counts)) for (let i = 0; i < n; i++) bag.push(c);
  return bag;
}

function generate(raw, idx, diff, rng) {
  const pieces = raw.screws.reduce((n, s) => n + s.colors.length, 0);
  const nb = pieces / 3;
  const nColors = Math.min(diff.colors, nb);
  const chapter = Math.floor(idx / 10);
  const palette = [CHAPTER_MAIN[chapter], ...GameConfig.colorOrder.filter((c) => c !== CHAPTER_MAIN[chapter])].slice(0, nColors);
  const counts = {};
  palette.forEach((c, i) => { counts[c] = Math.floor(nb / nColors) + (i < nb % nColors ? 1 : 0); });
  const queue = makeQueue(counts, rng);
  const unassigned = {};
  for (const c of palette) unassigned[c] = counts[c] * 3;

  const level = JSON.parse(JSON.stringify({ ...raw, boxQueue: queue, holes: diff.holes, slots: 2 }));
  const assignColor = (s, pz) => {
    const box = pz.box;
    const activeSet = new Set(box.slots.filter((b) => b && b.pieces.length < 3).map((b) => b.color));
    const activeRoom = [...activeSet].filter((c) => unassigned[c] > 0);
    const holeCands = Object.keys(unassigned).filter((c) => unassigned[c] > 0 && !activeSet.has(c));
    let c;
    if (!s.key && holeCands.length && box.usedHoles < diff.budget && rng() < diff.pHole) c = rng.pick(holeCands);
    else if (activeRoom.length) c = rng.pick(activeRoom);
    else if (holeCands.length) c = rng.pick(holeCands);
    else c = Object.keys(unassigned).find((k) => unassigned[k] > 0);
    unassigned[c]--;
    return c;
  };
  const pz = new PuzzleSystem(new EventBus(), level, { assignColor, rng, jitter: 0 });
  const solution = [];
  const bombAt = {};
  let guard = 0;
  while (guard++ < 300) {
    settle(pz, { maxSteps: GENERATOR.maxSettleSteps });
    if (pz.status !== 'play') break;
    const taps = pz.tappable();
    if (!taps.length) { pz.destroy(); return { ok: false, why: 'stuck' }; }
    // 参考解：随机挑，稍微偏向上层 (更像人会先拧的)
    const weights = taps.map((s) => 1 + Math.max(0, pz.boards.layerOf(s)) * 0.4);
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let pick = taps[0];
    for (let i = 0; i < taps.length; i++) { r -= weights[i]; if (r <= 0) { pick = taps[i]; break; } }
    const before = pick.state;
    const res = pz.tap(pick.id);
    if (!res.ok) { pz.destroy(); return { ok: false, why: 'refused ' + res.reason }; }
    solution.push(pick.id);
    for (const s of pz.screws) if (s.bomb && s.state === 'gone' && bombAt[s.id] == null) bombAt[s.id] = pz.taps;
    void before;
  }
  if (pz.status !== 'win') { const why = pz.status; pz.destroy(); return { ok: false, why }; }
  const colors = pz.screws.map((s) => s);
  const out = JSON.parse(JSON.stringify(raw));
  // 记录最终颜色：双层螺丝的两层在拧的时候依次决定，这里从 piece 记录里还原
  void colors;
  out.screws.forEach((s) => { s.colors = []; });
  pz.destroy();
  return { ok: true, out, solution, bombAt, queue, maxHoles: null, pieceLog: null };
}

// 生成时把每次拧下的钉帽颜色记下来 (双层螺丝两层分别记)
function generateWithLog(raw, idx, diff, rng) {
  const log = [];
  const origTap = PuzzleSystem.prototype._remove;
  PuzzleSystem.prototype._remove = function (s, o) {
    const piece = origTap.call(this, s, o);
    log.push({ screw: s.id, color: piece.color });
    return piece;
  };
  let g;
  try { g = generate(raw, idx, diff, rng); } finally { PuzzleSystem.prototype._remove = origTap; }
  if (!g.ok) return g;
  for (const e of log) g.out.screws[e.screw].colors.push(e.color);
  for (const s of g.out.screws) {
    if (s.bomb) s.bomb = (g.bombAt[s.id] ?? 1) + diff.bombSlack;
  }
  g.level = { ...g.out, boxQueue: g.queue, holes: diff.holes, slots: 2, solution: g.solution };
  return g;
}

function evaluate(level, runs, seed) {
  let wins = 0; let holes = 0;
  const reasons = {};
  for (let r = 0; r < runs; r++) {
    const res = botPlay(M, level, makeRng(seed * 7919 + r * 104729));
    if (res.result === 'win') wins++;
    else reasons[res.result] = (reasons[res.result] || 0) + 1;
    holes += res.maxHoles;
  }
  return { rate: wins / runs, avgMaxHoles: holes / runs, reasons };
}

// ---------------------------------------------------------------- main
const outPath = path.join(root, 'src/config/LevelData.js');
let previous = [];
try {
  const txt = await fs.readFile(outPath, 'utf8');
  previous = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1));
} catch (_) { /* 首次生成 */ }

const results = [];
const rawDump = [];
let bad = 0;

/** 一关的候选布局：手摆的只有一个；程序摆板按种子摆若干个，挑压得够多的 */
function layoutCandidates(bp, i) {
  if (bp.boards) {
    const raw = compile(bp);
    const { errs } = validate(raw, i);
    return errs.length ? { errs } : { list: [{ raw, cover: null, seed: null }] };
  }
  const spec = bp.gen;
  const list = [];
  let lastErr = null;
  for (let seed = 0; seed < 400 && list.length < GENERATOR.layouts; seed++) {
    const rng = makeRng(5000 + i * 1009 + seed * 7);
    const lay = layoutLevel(M, spec, rng);
    if (!lay || lay.cover < spec.cover) continue;
    lay.layers = spec.layers;
    const chains = addObstacles(M, lay, { ...spec.ob, double: spec.doubles || 0 }, rng, GameConfig.frostRadius);
    if (chains === null) continue;
    const raw = compile({ boards: lay.boards, chains });
    const { errs } = validate(raw, i);
    if (errs.length) { lastErr = errs; continue; }
    list.push({ raw, cover: lay.cover, seed });
  }
  return list.length ? { list } : { errs: lastErr || ['摆不出满足条件的布局'] };
}

for (let i = 0; i < BLUEPRINTS.length; i++) {
  const tag = `第 ${Math.floor(i / 10) + 1}-${(i % 10) + 1} 关`;
  if (ONLY && !ONLY.includes(i + 1) && !CHECK) { results.push(previous[i] || null); continue; }
  const t0 = Date.now();
  const lc = layoutCandidates(BLUEPRINTS[i], i);
  if (lc.errs) { bad++; console.log(`✗ ${tag}: ${lc.errs.join('；')}`); results.push(previous[i] || null); continue; }
  if (CHECK) {
    rawDump.push(lc.list[0].raw);
    console.log(`✓ ${tag}: 候选布局 ${lc.list.length} 个，覆盖率 ${lc.list.map((c) => (c.cover == null ? '手摆' : c.cover.toFixed(2))).join(' ')}`);
    results.push(previous[i] || null);
    continue;
  }
  const diff = DIFFICULTY[i];
  let best = null;
  const pool = [];
  for (const cand of lc.list) {
    const raw = cand.raw;
    const pieces = raw.screws.reduce((n, s) => n + s.colors.length, 0);
    let made = 0;
    for (let c = 0; c < GENERATOR.candidates * 4 && made < GENERATOR.candidates; c++) {
      const rng = makeRng(1000 + i * 97 + c * 13 + (cand.seed || 0) * 7717);
      const g = generateWithLog(raw, i, diff, rng);
      if (!g.ok) { if (process.env.DEBUG) console.log('  gen fail', cand.seed, c, g.why); continue; }
      made++;
      const ev = evaluate(g.level, GENERATOR.botRuns, i * 31 + c);
      if (process.env.DEBUG) console.log('  cand', cand.seed, c, ev.rate, JSON.stringify(ev.reasons));
      const score = Math.abs(ev.rate - diff.target) - (cand.cover || 0) * 0.15;
      pool.push({ score, g, ev, cand: c, layoutSeed: cand.seed, cover: cand.cover, pieces });
    }
  }
  // v1.1：从几十个候选里挑"测出来最接近目标"的那个会有赢家诅咒 (挑中的往往是测量噪声刚好偏向目标的)。
  // 先按初测取前 4 名，再用一组全新的种子各复测一次，按复测结果定稿，报告的也是复测通关率
  pool.sort((a, b) => a.score - b.score);
  for (const p of pool.slice(0, 4)) {
    const ev2 = evaluate(p.g.level, Math.max(48, GENERATOR.botRuns), 99991 + i * 7 + p.cand);
    p.ev = ev2;
    p.score = Math.abs(ev2.rate - diff.target) - (p.cover || 0) * 0.05;
    if (!best || p.score < best.score) best = p;
  }
  if (!best) { bad++; console.log(`✗ ${tag}: 生成失败`); results.push(previous[i] || null); continue; }
  const L = best.g.level;
  L.stats = {
    botWinRate: +best.ev.rate.toFixed(2), target: diff.target, pieces: best.pieces, boards: L.boards.length,
    colors: new Set(L.boxQueue).size, layoutSeed: best.layoutSeed, colorSeed: best.cand, cover: best.cover == null ? null : +best.cover.toFixed(2),
  };
  results.push(L);
  console.log(`✓ ${tag}: 板 ${L.boards.length} / 钉帽 ${best.pieces} / ${L.stats.colors} 色 / 覆盖 ${L.stats.cover ?? '手摆'} | 机器人通关 ${(best.ev.rate * 100).toFixed(0)}% (目标 ${(diff.target * 100).toFixed(0)}%) 平均最多占孔 ${best.ev.avgMaxHoles.toFixed(1)} ${JSON.stringify(best.ev.reasons)} | ${Date.now() - t0}ms`);
}

if (CHECK) await fs.writeFile('/tmp/animescrew_raw.json', JSON.stringify(rawDump));
if (!CHECK) {
  const header = '// 自动生成：node tools/design_levels.mjs  (不要手改；改 LevelBlueprints.js / DifficultyConfig.js 后重新生成)\n';
  await fs.writeFile(outPath, `${header}export const LEVEL_DATA = ${JSON.stringify(results)};\n`, 'utf8');
  console.log(`写入 ${path.relative(root, outPath)}`);
}
process.exit(bad ? 1 : 0);

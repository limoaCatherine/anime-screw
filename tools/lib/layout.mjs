// 程序化摆板：给定层数 / 螺丝数 / 形状与材质偏好，按"上层板子压住下层螺丝"的原则一层层往上摆。
// 产出与手摆蓝图相同的结构 ({boards:[{mat,layer,v,s,...}], chains})，之后统一走生成器。
const TAU = Math.PI * 2;
const F = { l: 44, r: 496, t: 280, b: 838 };
const ROTS = [0, 0, Math.PI / 2, Math.PI / 12, -Math.PI / 12, Math.PI / 6, -Math.PI / 6, Math.PI / 4, -Math.PI / 4];

function inside(M, x, y, verts) {
  const vs = verts.map(([a, b]) => ({ x: a, y: b }));
  return M.pointInPoly(x, y, vs) ? M.distToPolyEdge(x, y, vs) : -1;
}

function inFrame(verts) {
  return verts.every(([x, y]) => x >= F.l - 14 && x <= F.r + 14 && y >= F.t - 12 && y <= F.b + 12);
}

function rp(x, y, cx, cy, a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return [cx + x * c - y * s, cy + x * s + y * c];
}

/** 形状模板：返回 { v, cands: [[x,y],...候选螺丝位], center } */
function makeShape(M, kind, cx, cy, a, rng, big = false) {
  const R = (lo, hi) => lo + rng() * (hi - lo);
  if (kind === 'plank') {
    const len = big ? R(300, 400) : R(170, 330); const w = R(50, 62);
    const x1 = cx - Math.cos(a) * len / 2; const y1 = cy - Math.sin(a) * len / 2;
    const x2 = cx + Math.cos(a) * len / 2; const y2 = cy + Math.sin(a) * len / 2;
    const v = M.plank(x1, y1, x2, y2, w);
    const cands = [];
    for (let t = 0; t <= 1.0001; t += 1 / 6) cands.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    return { v, cands, ends: [cands[0], cands[cands.length - 1]] };
  }
  if (kind === 'rect' || kind === 'ticket' || kind === 'big') {
    const w = kind === 'big' ? R(380, 440) : kind === 'ticket' ? R(120, 160) : R(130, 230);
    const h = kind === 'big' ? R(400, 520) : kind === 'ticket' ? R(64, 84) : R(110, 200);
    const v = M.rect(cx, cy, w, h, a, kind === 'big' ? 18 : 12);
    const ix = w / 2 - 27; const iy = h / 2 - 27;
    const cands = [];
    for (const fx of [-1, -0.5, 0, 0.5, 1]) for (const fy of [-1, -0.5, 0, 0.5, 1]) {
      if (iy < 12 && fy !== 0) continue;
      cands.push(rp(fx * ix, fy * Math.max(0, iy), cx, cy, a));
    }
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([fx, fy]) => rp(fx * ix, fy * Math.max(0, iy), cx, cy, a));
    return { v, cands, corners };
  }
  if (kind === 'hex' || kind === 'pent' || kind === 'tri') {
    const n = kind === 'hex' ? 6 : kind === 'pent' ? 5 : 3;
    const Rr = kind === 'tri' ? R(90, 120) : R(56, 90);
    const v = M.ngon(cx, cy, Rr, n, a, 10);
    const cands = [[cx, cy]];
    const inner = kind === 'tri' ? Rr * 0.38 : Rr * 0.5;
    for (let i = 0; i < 6; i++) { const t = a + i * TAU / 6; cands.push([cx + Math.cos(t) * inner, cy + Math.sin(t) * inner]); }
    return { v, cands };
  }
  if (kind === 'disc') {
    const Rr = R(64, 110);
    const v = M.disc(cx, cy, Rr);
    const cands = [[cx, cy]];
    for (let i = 0; i < 8; i++) { const t = a + i * TAU / 8; cands.push([cx + Math.cos(t) * (Rr - 30), cy + Math.sin(t) * (Rr - 30)]); }
    return { v, cands };
  }
  if (kind === 'trap') {
    const wt = R(110, 200); const wb = wt + R(60, 120); const h = R(110, 170);
    const v = M.trap(cx, cy, wt, wb, h, a);
    const cands = [];
    for (const fy of [-0.5, 0, 0.5]) for (const fx of [-0.5, 0, 0.5]) {
      const ww = (wt + (wb - wt) * (fy + 0.5)) / 2 - 28;
      cands.push(rp(fx * 2 * ww, fy * (h - 56), cx, cy, a));
    }
    return { v, cands };
  }
  throw new Error('unknown shape ' + kind);
}

const MX = 270;
const mirrorPts = (pts) => pts.map(([x, y]) => [2 * MX - x, y]);
const mirrorPoly = (v) => mirrorPts(v).reverse();
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * 左右对称摆板。spec: { layers, screws, shapes:[...], mats:[...], glass:0~1, tints:[...], ropes, doubles }
 * 每块上层板都要压住至少一颗下层螺丝；大多数板子成对出现 (镜像)，少数摆在中轴上。
 */
export function layoutLevel(M, spec, rng) {
  const gap = 37;
  const boards = []; const screws = [];
  const minEdge = 18;
  const pickMat = (layer) => {
    if (spec.glass && layer > 0 && rng() < spec.glass) return 'glass';
    return layer === 0 ? rng.pick(spec.baseMats || spec.mats) : rng.pick(spec.mats);
  };
  const okPoint = (x, y, v, extra = []) => inside(M, x, y, v) >= minEdge
    && screws.every((s) => Math.hypot(s.x - x, s.y - y) >= gap)
    && extra.every(([px, py]) => Math.hypot(px - x, py - y) >= gap);
  const covered = (s, uptoLayer) => boards.some((b) => b.layer > s.layer && b.layer <= uptoLayer && inside(M, s.x, s.y, b.v) > -1);
  const addBoard = (layer, v, pts, extra = {}) => {
    const id = boards.length;
    const b = { id, mat: extra.mat || pickMat(layer), layer, v: v.map(([x, y]) => [r1(x), r1(y)]), s: [], ...extra };
    if (b.mat === 'acrylic' && !b.tint) b.tint = rng.pick(spec.tints);
    boards.push(b);
    for (const [x, y] of pts) { screws.push({ x: r1(x), y: r1(y), board: id, layer }); b.s.push([r1(x), r1(y)]); }
    return b;
  };

  const total = spec.screws - (spec.ropes || 0) - (spec.doubles || 0); // 板上螺丝数 (不含挂绳钉；双层螺丝多出来的一层另算)
  const ropeCount = spec.ropes || 0;
  const target = total - ropeCount * 2;

  // ---- 底层：一块大板 (对称)
  {
    const w = 404 + rng() * 40; const h = 450 + rng() * 90;
    const cy = 560 + (rng() - 0.5) * 24;
    const v = M.rect(MX, cy, w, h, 0, 18);
    const ix = w / 2 - 30; const iy = h / 2 - 30;
    const pts = [[MX - ix, cy - iy], [MX + ix, cy - iy], [MX + ix, cy + iy], [MX - ix, cy + iy]];
    if (target >= 12) pts.push([MX - ix, cy + (rng() - 0.5) * 60], [MX + ix, 0]);
    if (pts.length === 6) pts[5][1] = pts[4][1];
    if (target >= 15) pts.push([MX, cy + (rng() - 0.5) * 80]);
    if ((target - pts.length) % 2 === 1 && pts.length < 7) pts.push([MX, cy + iy]);
    addBoard(0, v, pts);
  }

  const layers = spec.layers;
  let layer = 1;
  const perLayer = Math.max(2, Math.round((target - screws.length) / Math.max(1, layers - 1)));
  let layerScrews = 0;
  let guard = 0;
  while (screws.length < target && guard++ < 6000) {
    if (layerScrews >= perLayer && layer < layers - 1) { layer++; layerScrews = 0; }
    const remaining = target - screws.length;
    const kind = rng.pick(spec.shapes);
    const centered = remaining < 4 || rng() < 0.28;
    // 目标螺丝：左半边 (或中轴) 上还没被压住的下层螺丝
    const open = screws.filter((s) => s.layer < layer && !covered(s, layer) && (centered ? Math.abs(s.x - MX) < 60 : s.x <= MX + 1));
    const pool = open.length ? open : screws.filter((s) => s.layer < layer && (centered ? true : s.x <= MX + 1));
    if (!pool.length) continue;
    const wts = pool.map((p) => 1 + 2.2 * Math.exp(-((p.y - 560) ** 2) / (2 * 150 * 150)));
    let rr = rng() * wts.reduce((x, y) => x + y, 0);
    let tgt = pool[0];
    for (let k = 0; k < pool.length; k++) { rr -= wts[k]; if (rr <= 0) { tgt = pool[k]; break; } }
    let a; let cx; let cy;
    if (centered) {
      a = rng.pick([0, Math.PI / 2]);
      if (kind === 'trap' || kind === 'hex' || kind === 'pent' || kind === 'tri') a = rng.pick([0, Math.PI]);
      cx = MX; cy = tgt.y + (rng() - 0.5) * 70;
    } else {
      a = rng.pick(ROTS);
      const off = 16 + rng() * 52; const ang = rng() * TAU;
      cx = tgt.x + Math.cos(ang) * off; cy = tgt.y + Math.sin(ang) * off;
    }
    const sh = makeShape(M, kind, cx, cy, a, rng);
    if (!inFrame(sh.v)) continue;
    if (inside(M, tgt.x, tgt.y, sh.v) < 6) continue;
    const sameLayer = boards.filter((b) => b.layer === layer);
    let want;
    if (centered) want = Math.min(remaining, rng() < 0.5 ? 2 : (rng() < 0.5 ? 1 : 3));
    else want = Math.min(Math.floor(remaining / 2), kind === 'plank' ? 2 + (rng() < 0.3 ? 1 : 0) : (kind === 'hex' || kind === 'disc' || kind === 'pent' || kind === 'tri') ? (rng() < 0.45 ? 1 : 2) : 2 + (rng() < 0.3 ? 1 : 0));
    if (want < 1) continue;
    let pts = [];
    const c = M.polygonCentroid(sh.v);
    if (centered) {
      const cands = rng.shuffle(sh.cands.filter(([x]) => x < MX - gap / 2));
      if (want % 2 === 1) { if (okPoint(c.x, c.y, sh.v)) pts.push([c.x, c.y]); else continue; }
      for (const [x, y] of cands) {
        if (pts.length >= want) break;
        const m = [2 * MX - x, y];
        if (!okPoint(x, y, sh.v, pts) || !okPoint(m[0], m[1], sh.v, [...pts, [x, y]])) continue;
        if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < 60)) continue;
        pts.push([x, y], m);
      }
      if (pts.length !== want) continue;
      if (pts.some(([x, y]) => sameLayer.some((b) => inside(M, x, y, b.v) > -1))) continue;
      if (sameLayer.some((b) => inside(M, c.x, c.y, b.v) > -1)) continue;
      addBoard(layer, sh.v, pts);
      layerScrews += pts.length;
      continue;
    }
    // 成对：左边一块 + 右边镜像
    if (want === 1) { if (okPoint(c.x, c.y, sh.v)) pts = [[c.x, c.y]]; else continue; }
    else {
      const pref = sh.ends || sh.corners;
      const order = [...(pref ? rng.shuffle([...pref]) : []), ...rng.shuffle([...sh.cands])];
      for (const [x, y] of order) {
        if (pts.length >= want) break;
        if (!okPoint(x, y, sh.v, pts)) continue;
        if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < 66)) continue;
        pts.push([x, y]);
      }
      if (pts.length < 2) continue;
    }
    const mv = mirrorPoly(sh.v); const mp = mirrorPts(pts);
    if (!inFrame(mv)) continue;
    // 镜像那块的螺丝也要合法，且两块别互相重叠
    if (!mp.every(([x, y]) => okPoint(x, y, mv, pts))) continue;
    if (inside(M, M.polygonCentroid(mv).x, M.polygonCentroid(mv).y, sh.v) > -1) continue;
    if (sh.v.some(([x, y]) => inside(M, x, y, mv) > 4)) continue;
    const all = [...pts, ...mp];
    if (all.some(([x, y]) => sameLayer.some((b) => inside(M, x, y, b.v) > -1))) continue;
    if ([c, M.polygonCentroid(mv)].some((p) => sameLayer.some((b) => inside(M, p.x, p.y, b.v) > -1))) continue;
    const mat = pickMat(layer);
    const tint = mat === 'acrylic' ? rng.pick(spec.tints) : undefined;
    addBoard(layer, sh.v, pts, { mat, tint });
    addBoard(layer, mv, mp, { mat, tint });
    layerScrews += pts.length * 2;
  }
  if (screws.length !== target) return null;
  // ---- 绳吊板 (挂在上方，压住下面的螺丝)
  for (let r = 0; r < ropeCount; r++) {
    let placed = false;
    for (let tries = 0; tries < 400 && !placed; tries++) {
      const cx = ropeCount === 1 ? MX : (r === 0 ? 150 + rng() * 60 : 2 * MX - boards[boards.length - 1].rope[0]);
      const cy = 430 + rng() * 260;
      const w = 130 + rng() * 30; const h = 70 + rng() * 14;
      const v = M.rect(cx, cy, w, h, 0, 10);
      if (!inFrame(v)) continue;
      const hy = Math.max(F.t + 18, cy - h / 2 - 80 - rng() * 80);
      if (screws.some((s) => Math.hypot(s.x - cx, s.y - hy) < gap + 4)) continue;
      const pts = [[cx - 38, cy], [cx + 38, cy]];
      if (!pts.every(([x, y]) => okPoint(x, y, v))) continue;
      if (!screws.some((s) => inside(M, s.x, s.y, v) > -1)) continue;
      addBoard(layers - 1, v, pts, { mat: 'acrylic', rope: [Math.round(cx), Math.round(hy)] });
      screws.push({ x: cx, y: hy, board: -1, layer: -1 });
      placed = true;
    }
    if (!placed) return null;
  }
  const onBoards = screws.filter((s) => s.board >= 0);
  const cover = onBoards.filter((s) => covered(s, 99)).length / onBoards.length;
  return { boards, cover, screws };
}

/** 给布局加障碍 (直接改 boards[].s 里的条目) */
export function addObstacles(M, lay, ob, rng, frostRadius) {
  const all = [];
  lay.boards.forEach((b) => b.s.forEach((p, i) => all.push({ b, i, x: p[0], y: p[1], layer: b.layer })));
  const used = new Set();
  const key = (e) => `${e.b.id}:${e.i}`;
  const mark = (e, o) => {
    const cur = e.b.s[e.i];
    const at = Array.isArray(cur) ? cur : cur.at;
    e.b.s[e.i] = { ...(Array.isArray(cur) ? {} : cur), at, ...o };
    used.add(key(e));
  };
  const free = (filter = () => true) => all.filter((e) => !used.has(key(e)) && !e.b.rope && filter(e));
  const chains = [];
  for (let c = 0; c < (ob.chain || 0); c++) {
    const cands = free((e) => e.layer <= 1);
    let ok = false;
    for (let t = 0; t < 200 && !ok; t++) {
      const a = rng.pick(cands); const b = rng.pick(cands);
      if (!a || !b || a === b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 80 || d > 260) continue;
      const lockC = free((e) => e !== a && e !== b && e.layer >= 1 && Math.hypot(e.x - (a.x + b.x) / 2, e.y - (a.y + b.y) / 2) < 220);
      if (!lockC.length) continue;
      const l = rng.pick(lockC);
      const tg = `c${c}`;
      mark(a, { tag: tg + 'a' }); mark(b, { tag: tg + 'b' }); mark(l, { tag: tg + 'l' });
      chains.push([tg + 'a', tg + 'b', tg + 'l']);
      ok = true;
    }
  }
  for (let k = 0; k < (ob.lock || 0); k++) {
    const lockable = lay.boards.filter((b) => b.layer >= 1 && b.layer <= Math.max(1, Math.floor(lay.layers / 2) + 1) && b.s.length >= 2 && !b.rope && !b.lock);
    if (!lockable.length) return null;
    const lb = rng.pick(lockable);
    const kc = free((e) => e.b !== lb && e.b.layer >= lb.layer);
    if (!kc.length) return null;
    const name = 'K' + k;
    lb.lock = name;
    mark(rng.pick(kc), { key: name });
  }
  for (let k = 0; k < (ob.frost || 0); k++) {
    const fc = free((e) => all.filter((o) => o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= frostRadius).length >= 3);
    if (!fc.length) break;
    const e = rng.pick(fc);
    mark(e, { frost: 1 + (rng() < 0.5 ? 1 : 0) + (ob.frostMax > 2 && rng() < 0.3 ? 1 : 0) });
  }
  for (let k = 0; k < (ob.bomb || 0); k++) {
    const bc = free((e) => e.layer >= 1);
    if (!bc.length) break;
    mark(rng.pick(bc), { bomb: true });
  }
  for (let k = 0; k < (ob.hidden || 0); k++) {
    const hc = free();
    if (!hc.length) break;
    mark(rng.pick(hc), { hidden: true });
  }
  for (let k = 0; k < (ob.double || 0); k++) {
    const dc = free();
    if (!dc.length) break;
    mark(rng.pick(dc), { double: true });
  }
  return chains;
}

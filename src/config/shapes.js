// 关卡形状小工具：圆角矩形、长木条、正多边形、梯形 + 螺丝位置辅助。
// 所有坐标都是逻辑像素 (画框在 x 28~512, y 262~856)。板子必须是凸多边形 (物理用)。
const TAU = Math.PI * 2;

function rot(x, y, cx, cy, a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return [cx + x * c - y * s, cy + x * s + y * c];
}

function r2(v) { return Math.round(v * 10) / 10; }

/** 圆角凸多边形：corners 为局部坐标的角点 (逆/顺时针均可)，每个角用 seg 段圆弧 */
function rounded(corners, cx, cy, a, r, seg = 4) {
  const out = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p0 = corners[(i - 1 + n) % n]; const p1 = corners[i]; const p2 = corners[(i + 1) % n];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]]; const v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...v1); const l2 = Math.hypot(...v2);
    const u1 = [v1[0] / l1, v1[1] / l1]; const u2 = [v2[0] / l2, v2[1] / l2];
    const ang = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const rr = Math.min(r, l1 * 0.45 * Math.tan(ang / 2), l2 * 0.45 * Math.tan(ang / 2));
    const d = rr / Math.tan(ang / 2);
    const a1 = [p1[0] + u1[0] * d, p1[1] + u1[1] * d];
    const a2 = [p1[0] + u2[0] * d, p1[1] + u2[1] * d];
    // 圆心
    const bis = [u1[0] + u2[0], u1[1] + u2[1]]; const bl = Math.hypot(...bis) || 1;
    const h = rr / Math.sin(ang / 2);
    const oc = [p1[0] + (bis[0] / bl) * h, p1[1] + (bis[1] / bl) * h];
    let s0 = Math.atan2(a1[1] - oc[1], a1[0] - oc[0]);
    let s1 = Math.atan2(a2[1] - oc[1], a2[0] - oc[0]);
    let diff = s1 - s0;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    for (let k = 0; k <= seg; k++) {
      const t = s0 + (diff * k) / seg;
      out.push(rot(oc[0] + Math.cos(t) * rr, oc[1] + Math.sin(t) * rr, cx, cy, a));
    }
  }
  return out.map(([x, y]) => [r2(x), r2(y)]);
}

export function rect(cx, cy, w, h, a = 0, r = 12) {
  const x = w / 2; const y = h / 2;
  return rounded([[-x, -y], [x, -y], [x, y], [-x, y]], cx, cy, a, r);
}

/** 长木条：两端点之间，宽 w，两头圆一点 */
export function plank(x1, y1, x2, y2, w = 62) {
  const len = Math.hypot(x2 - x1, y2 - y1) + w;
  return rect((x1 + x2) / 2, (y1 + y2) / 2, len, w, Math.atan2(y2 - y1, x2 - x1), w * 0.42);
}

export function ngon(cx, cy, R, n, a = 0, r = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = -Math.PI / 2 + (i / n) * TAU;
    pts.push([Math.cos(t) * R, Math.sin(t) * R]);
  }
  return rounded(pts, cx, cy, a, r, 3);
}

export function disc(cx, cy, R, n = 26) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    out.push([r2(cx + Math.cos(t) * R), r2(cy + Math.sin(t) * R)]);
  }
  return out;
}

export function trap(cx, cy, wTop, wBot, h, a = 0, r = 12) {
  return rounded([[-wTop / 2, -h / 2], [wTop / 2, -h / 2], [wBot / 2, h / 2], [-wBot / 2, h / 2]], cx, cy, a, r);
}

// ---- 螺丝位置 ----
/** 矩形四角 (内缩 inset) */
export function corners(cx, cy, w, h, a = 0, inset = 26) {
  const x = w / 2 - inset; const y = h / 2 - inset;
  return [[-x, -y], [x, -y], [x, y], [-x, y]].map(([px, py]) => rot(px, py, cx, cy, a).map(r2));
}

/** 木条上均匀的 n 颗 (两端内缩 inset) */
export function along(x1, y1, x2, y2, n = 2, inset = 0) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
  const a = [x1 + ux * inset, y1 + uy * inset]; const b = [x2 - ux * inset, y2 - uy * inset];
  if (n === 1) return [[r2((a[0] + b[0]) / 2), r2((a[1] + b[1]) / 2)]];
  const out = [];
  for (let i = 0; i < n; i++) out.push([r2(a[0] + ((b[0] - a[0]) * i) / (n - 1)), r2(a[1] + ((b[1] - a[1]) * i) / (n - 1))]);
  return out;
}

export function ring(cx, cy, R, n, a0 = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + (i / n) * TAU;
    out.push([r2(cx + Math.cos(t) * R), r2(cy + Math.sin(t) * R)]);
  }
  return out;
}

/** 以 (cx,cy) 为原点、旋转 a 的局部坐标点 */
export function local(cx, cy, a, pts) {
  return pts.map(([x, y]) => rot(x, y, cx, cy, a).map(r2));
}

/** 给某颗螺丝加属性：S([x,y], { frost: 2, tag: 'a' }) */
export function S(p, o = {}) { return { at: p, ...o }; }

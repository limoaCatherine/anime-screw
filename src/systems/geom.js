// 纯几何工具 (无 DOM 依赖，浏览器与无头校验器共用)。
export function polygonCentroid(pts) {
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) {
    const n = pts.length;
    return { x: pts.reduce((s, p) => s + p[0], 0) / n, y: pts.reduce((s, p) => s + p[1], 0) / n, area: 0 };
  }
  return { x: cx / (6 * a), y: cy / (6 * a), area: Math.abs(a) };
}

/** 点是否在凸/凹多边形内 (射线法)；verts 为 {x,y} 数组 */
export function pointInPoly(x, y, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x; const yi = verts[i].y; const xj = verts[j].x; const yj = verts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t; const qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
}

/** 点到多边形边界的最短距离 */
export function distToPolyEdge(x, y, verts) {
  let d = Infinity;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    d = Math.min(d, distToSegment(x, y, verts[j].x, verts[j].y, verts[i].x, verts[i].y));
  }
  return d;
}

/** 圆与多边形是否相交 (带包围盒快速排除) */
export function circleHitsPoly(x, y, r, verts, bounds) {
  if (bounds && (x + r < bounds.min.x || x - r > bounds.max.x || y + r < bounds.min.y || y - r > bounds.max.y)) return false;
  if (pointInPoly(x, y, verts)) return true;
  return distToPolyEdge(x, y, verts) < r;
}

export function rotate(x, y, a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** 可复现的伪随机数 (mulberry32) */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.int = (n) => Math.floor(rnd() * n);
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  rnd.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return rnd;
}

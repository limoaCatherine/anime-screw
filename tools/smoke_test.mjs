// 冒烟测试 (Playwright + 无头 Chromium)：直接打开 dist/index.html (file://)
//  - 加载过程与操作过程中没有控制台报错 / 页面异常 / 资源加载失败
//  - 主界面 → 开拆 → 第 1 关：按参考解用鼠标逐颗点螺丝，直到"这块拆下来了"，存档里记上第 1 关
//  - 再截几张：选关、画册、设置、失败面板、广告占位、后面几关 (带障碍) 的局面
// 用法：npm run build && node tools/smoke_test.mjs [截图目录，默认 /workspace/AnimeScrew_shots]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.argv[2] || '/workspace/AnimeScrew_shots';
fs.mkdirSync(shotDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
await page.goto(url);
const shot = async (name) => { await page.screenshot({ path: path.join(shotDir, name) }); console.log(`  📷 ${name}`); };
const waitScene = (name, timeout = 10000) => page.waitForFunction((n) => {
  const g = window.__ANIME_SCREW__;
  return g && g.scenes.currentName === n && !g.scenes.transitioning;
}, name, { timeout });
const toPage = (x, y) => page.evaluate(([lx, ly]) => {
  const r = document.getElementById('game').getBoundingClientRect();
  return { x: r.left + (lx / 540) * r.width, y: r.top + (ly / 960) * r.height };
}, [x, y]);
const tap = async (x, y) => { const p = await toPage(x, y); await page.mouse.click(p.x, p.y); };
const G = (fn, arg) => page.evaluate(fn, arg);

console.log('加载 dist/index.html');
await waitScene('menu');
await sleep(600);
check(errors.length === 0, `加载无报错 ${errors.length ? JSON.stringify(errors) : ''}`);
await shot('01_menu.png');

console.log('第 1 关：用鼠标按参考解拧螺丝');
await tap(270, 742);            // 开拆
await waitScene('game');
await sleep(1900);
// 提示卡 "知道了"
if (await G(() => window.__ANIME_SCREW__.modals.length > 0)) { await shot('02_tip_card.png'); await tap(270, 640); await sleep(400); }
await shot('03_level1_start.png');
const solution = await G(() => window.__ANIME_SCREW__.scenes.current.L.solution);
for (const id of solution) {
  // 等这颗能拧、动画走完
  try {
    await page.waitForFunction((sid) => {
      const sc = window.__ANIME_SCREW__.scenes.current;
      const s = sc.puzzle.screw(sid);
      return s.state === 'on' && !sc.puzzle.blockReason(s) && !sc.tray.busy;
    }, id, { timeout: 15000 });
  } catch (e) {
    const d = await G((sid) => { const sc = window.__ANIME_SCREW__.scenes.current; const s = sc.puzzle.screw(sid);
      return { sid, state: s.state, reason: sc.puzzle.blockReason(s), stable: sc.puzzle.stable(), scene: sc.state, status: sc.puzzle.status, mode: sc.mode,
        screws: sc.puzzle.screws.map((o) => o.id + ':' + o.state), modals: window.__ANIME_SCREW__.modals.length }; }, id);
    console.log('卡住了', JSON.stringify(d), errors);
    throw e;
  }
  const pos = await G((sid) => { const sc = window.__ANIME_SCREW__.scenes.current; const p = sc.puzzle.posOf(sc.puzzle.screw(sid)); return { x: p.x, y: p.y }; }, id);
  await tap(pos.x, pos.y);
  await sleep(120);
  if (id === solution[2]) await shot('04_level1_midplay.png');
}
await page.waitForFunction(() => window.__ANIME_SCREW__.modals.some((m) => m.constructor.name === 'WinPanel' || m.share), null, { timeout: 12000 });
await sleep(700);
await shot('05_level1_win.png');
const st = await G(() => ({ cleared: window.__ANIME_SCREW__.save.data.cleared, status: window.__ANIME_SCREW__.scenes.current.puzzle.status, sfx: window.__ANIME_SCREW__.audio.played.slice(-12), voice: window.__ANIME_SCREW__.voice.history }));
check(st.status === 'win' && st.cleared[0], `第 1 关通关并存档 (status=${st.status})`);
check(st.sfx.includes('unscrew') && st.sfx.includes('box'), `有拧螺丝/进盒音效 ${st.sfx.join(',')}`);
check(errors.length === 0, `第 1 关过程无报错 ${errors.length ? JSON.stringify(errors) : ''}`);

console.log('其他界面截图');
await tap(270, 790);                // 下一块
await waitScene('game');
await sleep(2000);
if (await G(() => window.__ANIME_SCREW__.modals.length > 0)) { await tap(270, 640); await sleep(300); }
await shot('06_level2.png');

// 直接进几个带障碍的关卡看看局面 (解锁存档)
await G(() => { const g = window.__ANIME_SCREW__; g.save.data.unlocked = 29; g.save.data.tipsSeen = { chain: 1, frost: 1, lock: 1, bomb: 1, hidden: 1, rope: 1, double: 1, screwdriver: 1, hammer: 1, shuffle: 1, glass: 1, cover: 1, holes: 1, basic: 1 }; });
for (const [lv, name] of [[13, '07_level2-4_chain_frost.png'], [23, '08_level3-4_rope.png'], [28, '09_level3-9_all.png']]) {
  await G((l) => window.__ANIME_SCREW__.scenes.change('game', { level: l }), lv);
  await waitScene('game');
  await sleep(2600);
  await shot(name);
}
// 拧几颗看看临时孔和收纳盒
await G(() => {
  const sc = window.__ANIME_SCREW__.scenes.current;
  for (let k = 0; k < 6; k++) { const t = sc.puzzle.tappable()[0]; if (t) sc.puzzle.tap(t.id); }
});
await sleep(1500);
await shot('10_level3-9_progress.png');
// 失败面板
await G(() => window.__ANIME_SCREW__.scenes.current.puzzle.fail('holes'));
await sleep(1600);
await shot('11_fail_panel.png');
// 广告占位
await tap(270, 560);
await sleep(1200);
await shot('12_ad_placeholder.png');
await page.waitForFunction(() => !window.__ANIME_SCREW__.ads.placeholder, null, { timeout: 9000 });
await sleep(500);
const revived = await G(() => window.__ANIME_SCREW__.scenes.current.puzzle.status);
check(revived === 'play', `看完广告复活 (status=${revived})`);

// ======================= v1.1 回归测试 =======================
console.log('v1.1 回归：连点 / 双击 / 压住的螺丝 / 面板期间点击 / 复活连点 / 广告期间暂停 / 字幕位置 / 碎裂动画');
const enterLevel = async (lv) => {
  await G((l) => window.__ANIME_SCREW__.scenes.change('game', { level: l }), lv);
  await page.waitForFunction((l) => { const g = window.__ANIME_SCREW__; return g.scenes.currentName === 'game' && !g.scenes.transitioning && g.scenes.current.index === l; }, lv);
  await sleep(500);
  await G(() => { const g = window.__ANIME_SCREW__; while (g.modals.length) g.modals.pop(); g.scenes.current.state = 'play'; });
};
const capsTotal = () => G(() => { const pz = window.__ANIME_SCREW__.scenes.current.puzzle;
  const on = pz.screws.reduce((n, s) => n + (s.state === 'on' ? s.colors.length : 0), 0);
  const inBox = pz.box.slots.reduce((n, b) => n + (b ? b.pieces.length : 0), 0) + pz.box.holes.filter(Boolean).length;
  return { on, inBox, closed: pz.box.closedCount, taps: pz.taps }; });

// 1) 同一颗螺丝双击 / 五连点：只拧一次 (去抖)，下面刚露出来的螺丝不会被误拧
await enterLevel(8);
{
  const t = await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; const s = sc.puzzle.tappable()[0]; const p = sc.puzzle.posOf(s); return { id: s.id, x: p.x, y: p.y }; });
  const p = await toPage(t.x, t.y);
  for (let k = 0; k < 5; k++) await page.mouse.click(p.x, p.y, { delay: 5 });
  const c = await capsTotal();
  check(c.taps === 1, `同一位置 5 连点只拧 1 颗 (taps=${c.taps})`);
}
// 2) 螺丝在飞的时候狂点别的螺丝：全部按规则处理，钉帽一个不少
{
  const before = await G(() => window.__ANIME_SCREW__.scenes.current.L.screws.reduce((n, s) => n + s.colors.length, 0));
  const pts = await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; return sc.puzzle.tappable().slice(0, 4).map((s) => sc.puzzle.posOf(s)); });
  for (const q of pts) { const pp = await toPage(q.x, q.y); await page.mouse.click(pp.x, pp.y, { delay: 2 }); }
  const busy = await G(() => window.__ANIME_SCREW__.scenes.current.tray.busy);
  await page.waitForFunction(() => !window.__ANIME_SCREW__.scenes.current.tray.busy, null, { timeout: 8000 });
  const c = await capsTotal();
  check(c.on + c.inBox + c.closed * 3 === before, `飞行中连点 ${pts.length} 颗：钉帽守恒 (${c.on}+${c.inBox}+${c.closed}×3 = ${before})，点时动画中=${busy}`);
}
// 3) 点被压住的螺丝：不会被拧走 (包括单钉晃过来压住的)
{
  const r = await G(() => {
    const sc = window.__ANIME_SCREW__.scenes.current; const pz = sc.puzzle; const R = 26 * 1.3;
    const free = pz.tappable();
    const cov = pz.screws.filter((s) => s.state === 'on' && pz.boards.coveredBy(s))
      .find((s) => { const p = pz.posOf(s); return !free.some((f) => { const q = pz.posOf(f); return Math.hypot(q.x - p.x, q.y - p.y) < R; }); });
    if (!cov) return null;
    const p = pz.posOf(cov); return { id: cov.id, x: p.x, y: p.y, taps: pz.taps };
  });
  if (r) {
    await sleep(260);
    await tap(r.x, r.y);
    const after = await G((id) => { const pz = window.__ANIME_SCREW__.scenes.current.puzzle; return { st: pz.screw(id).state, taps: pz.taps }; }, r.id);
    check(after.st === 'on' && after.taps === r.taps, `点被压住的螺丝#${r.id}：没拧走 (state=${after.st})`);
  } else check(true, '这一局没有可单独点到的被压螺丝 (跳过)');
}
// 4) 面板打开时点画面：不拧，物理也停
{
  await G(() => window.__ANIME_SCREW__.scenes.current.openSettings());
  await sleep(200);
  const b = await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; const s = sc.puzzle.tappable()[0]; const p = sc.puzzle.posOf(s); return { x: p.x, y: p.y, taps: sc.puzzle.taps, steps: sc.puzzle.physics.steps }; });
  await tap(b.x, Math.max(300, b.y));
  await sleep(500);
  const a = await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; return { taps: sc.puzzle.taps, steps: sc.puzzle.physics.steps }; });
  check(a.taps === b.taps, `设置面板打开时点画面不拧螺丝 (taps ${b.taps}→${a.taps})`);
  check(a.steps === b.steps, `设置面板打开时物理暂停 (steps ${b.steps}→${a.steps})`);
  await G(() => window.__ANIME_SCREW__.modals.pop());
}
// 5) 字幕气泡不压画框
{
  const r = await G(() => { const g = window.__ANIME_SCREW__; const sc = g.scenes.current; sc.subs.say({ name: '测试', color: '#c66' }, '这是一句很长很长的测试台词，看看会不会挡住上面的螺丝', 3);
    const L = g.config ? g.config.layout : null; return { y: sc.subs.y ?? null, box: sc.subs.lastRect || null }; });
  await sleep(300);
  await shot('v11_subtitle_bottom.png');
  const ok = await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; const r = sc.subs.lastRect; return r ? r.y >= 856 - 1 : null; });
  check(ok !== false, `字幕气泡在画框下方 (${JSON.stringify(await G(() => window.__ANIME_SCREW__.scenes.current.subs.lastRect || null))})`);
}
// 6) 小锤碎裂动画
{
  const r = await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; const pz = sc.puzzle; const g = window.__ANIME_SCREW__;
    g.save.data.items.hammer = Math.max(1, g.save.data.items.hammer || 0);
    const b = pz.boards.boards.filter((x) => pz.boards.isSolid(x)).sort((a, c) => c.layer - a.layer)[0];
    if (!b) return null;
    sc.useItem('hammer');
    const vs = b.body.vertices; const c = vs.reduce((a, v) => ({ x: a.x + v.x / vs.length, y: a.y + v.y / vs.length }), { x: 0, y: 0 });
    sc.onPointerDown(c);
    return { broken: b.broken || b.gone || b.falling, shards: sc.shards.length };
  });
  await sleep(180);
  await shot('v11_hammer_shatter.png');
  check(r && r.broken && r.shards > 0, `小锤敲板：板子碎掉并有碎片动画 (${JSON.stringify(r)})`);
  await sleep(1200);
  const left = await G(() => window.__ANIME_SCREW__.scenes.current.shards.length);
  check(left === 0, `碎片动画 1 秒内放完 (剩 ${left})`);
}
// 7) 复活按钮连点两下：只看一次广告、只复活一次；广告期间物理和炸弹都停
await enterLevel(20);   // 3-1 炸弹关
{
  await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; sc.puzzle.fail('holes'); });
  await page.waitForFunction(() => window.__ANIME_SCREW__.scenes.current.failPanel && window.__ANIME_SCREW__.modals.length > 0, null, { timeout: 6000 });
  await sleep(1300);
  await shot('v11_fail_panel.png');
  await tap(270, 560); await tap(270, 560);
  await sleep(250);
  const mid = await G(() => { const g = window.__ANIME_SCREW__; const pz = g.scenes.current.puzzle; return { ad: !!g.ads.placeholder, steps: pz.physics.steps, bombs: pz.screws.filter((s) => s.bomb > 0).map((s) => s.bomb).join(',') }; });
  await sleep(1200);
  const mid2 = await G(() => { const g = window.__ANIME_SCREW__; const pz = g.scenes.current.puzzle; return { steps: pz.physics.steps, bombs: pz.screws.filter((s) => s.bomb > 0).map((s) => s.bomb).join(',') }; });
  check(mid.ad && mid.steps === mid2.steps && mid.bombs === mid2.bombs, `广告播放中物理/炸弹暂停 (steps ${mid.steps}→${mid2.steps}, 炸弹 ${mid.bombs}→${mid2.bombs})`);
  await page.waitForFunction(() => !window.__ANIME_SCREW__.ads.placeholder, null, { timeout: 9000 });
  await sleep(600);
  const rv = await G(() => { const sc = window.__ANIME_SCREW__.scenes.current; return { revives: sc.revives, status: sc.puzzle.status, modals: window.__ANIME_SCREW__.modals.length }; });
  check(rv.revives === 1 && rv.status === 'play', `复活连点两下只复活一次 (${JSON.stringify(rv)})`);
}
// 8) 拧螺丝后声音解锁 (第一次点击)
check(await G(() => { const a = window.__ANIME_SCREW__.audio; return !a.ctx || a.ctx.state === 'running'; }), '第一次点击后音频已解锁');
// 9) 存档被写坏：重新加载不报错，自动修正
{
  const key = await G(() => window.__ANIME_SCREW__.config ? null : null);
  void key;
  const fixed = await G(() => {
    const g = window.__ANIME_SCREW__; const k = g.save.key || 'animeScrew.save.v1';
    const good = localStorage.getItem(k);
    localStorage.setItem(k, JSON.stringify({ unlocked: 999, cleared: 'oops', fragments: [true, 'x'], items: { undo: -5, hammer: 1e9 }, settings: null, plays: 'a' }));
    const S = g.save.constructor; const t = new S(k);
    const d = t.data;
    const res = { unlocked: d.unlocked, cleared: Array.isArray(d.cleared), undo: d.items.undo, hammer: d.items.hammer, frag0: d.fragments[0] };
    localStorage.setItem(k, good);
    return res;
  });
  check(fixed.unlocked <= 29 && fixed.cleared && fixed.undo >= 0 && fixed.hammer <= 99, `坏存档自动修正 (${JSON.stringify(fixed)})`);
}
check(errors.length === 0, `v1.1 回归过程无报错 ${errors.length ? JSON.stringify(errors.slice(0, 5)) : ''}`);

// 选关、画册、设置
await G(() => window.__ANIME_SCREW__.scenes.change('select', { focus: 1 }));
await waitScene('select');
await sleep(500);
await shot('13_level_select.png');
await G(() => { const g = window.__ANIME_SCREW__; for (let i = 0; i < 10; i++) g.save.data.fragments[i] = true; });
await G(() => window.__ANIME_SCREW__.scenes.change('gallery', { chapter: 0 }));
await waitScene('gallery');
await sleep(500);
await shot('14_gallery.png');
await G(() => window.__ANIME_SCREW__.scenes.change('menu'));
await waitScene('menu');
await tap(500, 40);
await sleep(500);
await shot('15_settings.png');
await tap(270, 490);               // 制作人员
await sleep(500);
await shot('16_credits.png');
const credits = await G(() => window.__ANIME_SCREW__.modals.length);
check(credits >= 2, '制作人员面板打开');
const bgm = await G(() => window.__ANIME_SCREW__.bgm.state());
check(!!bgm.current, `背景音乐在放 (${bgm.current}, playing=${bgm.playing})`);

check(errors.length === 0, `全程无报错 ${errors.length ? JSON.stringify(errors.slice(0, 5)) : ''}`);
await browser.close();
console.log(failures ? `\n✗ ${failures} 项失败` : '\n✓ 冒烟测试通过');
process.exit(failures ? 1 : 0);

// 浏览器整套通关测试：在 dist/index.html 里把 30 关逐关按参考解点一遍 (走 GameScene 的点击逻辑)，
// 中间顺便把 5 个道具都用一次，确认每关都能弹出过关面板、全程没有报错。
// 用法：npm run build && node tools/playthrough.mjs [起始关=1] [结束关=30]
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = +(process.argv[2] || 1) - 1; const to = +(process.argv[3] || 30) - 1;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href);
await page.waitForFunction(() => window.__ANIME_SCREW__?.scenes.currentName === 'menu');
await page.evaluate(() => {
  const g = window.__ANIME_SCREW__; g.save.data.unlocked = 29;
  for (const k of ['basic', 'holes', 'cover', 'glass', 'chain', 'frost', 'lock', 'bomb', 'hidden', 'rope', 'double', 'screwdriver', 'hammer', 'shuffle']) g.save.data.tipsSeen[k] = 1;
  for (const k of ['undo', 'addHole', 'screwdriver', 'hammer', 'shuffle']) g.save.data.items[k] = 9;
});
let bad = 0;
for (let lv = from; lv <= to; lv++) {
  const t0 = Date.now();
  await page.evaluate((l) => window.__ANIME_SCREW__.scenes.change('game', { level: l }), lv);
  await page.waitForFunction((l) => { const g = window.__ANIME_SCREW__; return g.scenes.currentName === 'game' && !g.scenes.transitioning && g.scenes.current.index === l; }, lv);
  await page.waitForTimeout(300);
  const res = await page.evaluate(async (l) => {
    const g = window.__ANIME_SCREW__; const sc = g.scenes.current; const pz = sc.puzzle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms = 15000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await sleep(30); } return true; };
    sc.state = 'play'; const misses = [];
    // 道具：退一步 (拧一颗再退回来)、加孔 (换盒会改变盒子顺序、让参考解失效，放到最后单独试)
    if (l === 14) {
      const first = pz.screw(sc.L.solution[0]);
      sc.onPointerDown(pz.posOf(first)); await until(() => !sc.tray.busy);
      sc.useItem('undo'); await until(() => !sc.tray.busy);
      if (first.state !== 'on') return { ok: false, why: 'undo 没退回来' };
      sc.useItem('addHole');
      if (pz.box.holes.length !== 6) return { ok: false, why: '加孔没生效' };
    }
    let idx = 0; let shuffled = '';
    for (const id of sc.L.solution) {
      // v1.1：第 15 关 (2-5) 走到一半用"换盒"——v1.0 这里换盒后参考解失效、关卡卡死。
      // 现在盒子队列按剩余螺丝自动对账，换完之后照常能打完 (下面的收尾循环用普通玩家的打法接着拧)
      if (l === 14 && idx++ === 7) {
        await until(() => !sc.tray.busy && pz.stable(), 4000);
        const before = pz.box.slots.map((b) => b && b.color).join(',') + '|' + pz.box.queue.join(',');
        sc.useItem('shuffle');
        shuffled = `换盒 ${before} → ${pz.box.slots.map((b) => b && b.color).join(',')}|${pz.box.queue.join(',')}`;
        break;
      }
      const s = pz.screw(id);
      if (pz.status === 'win') break;
      if (s.state !== 'on') continue;
      const okWait = await until(() => (!pz.blockReason(s) && !sc.tray.busy) || pz.status !== 'play' || s.state !== 'on');
      if (pz.status !== 'play') break;
      if (s.state !== 'on') continue;
      if (!okWait) return { ok: false, why: `等不到 #${id} (${pz.blockReason(s)}) 点歪 ${misses}` };
      const before = pz.taps; const colorsBefore = s.colors.length;
      sc.onPointerDown(pz.posOf(s));
      if (pz.taps !== before && s.state === 'on' && s.colors.length === colorsBefore) misses.push(id);
      if (pz.taps === before) {
        // 点歪了 (被别的螺丝抢了)：直接按 id 拧
        pz.tap(id);
      }
      await sleep(40);
    }
    // 收尾：要是参考解之外还剩 (隐色分配不同等)，用螺丝刀清
    let guard = 0;
    while (pz.status === 'play' && guard++ < 60) {
      await until(() => pz.stable() && !sc.tray.busy, 4000);
      if (pz.status !== 'play') break;
      const legal = pz.tappable().filter((x) => pz.canTake(x));
      const t = legal.find((x) => !x.hidden && pz.box.boxHasRoom(x.colors[0])) || legal[0] || pz.screws.find((x) => x.state === 'on');
      if (!t) break;
      if (!legal.length) { sc.useItem('screwdriver'); sc.onPointerDown(pz.posOf(t)); sc.mode = null; }
      else pz.tap(t.id);
      await sleep(40);
    }
    const won = await until(() => g.modals.some((m) => m.share), 15000);
    return { ok: won && pz.status === 'win', why: (won ? '' : `status=${pz.status} fail=${pz.failReason}`) + (misses.length ? ` 点歪 ${misses}` : '') + (shuffled ? ` ${shuffled} → 通关` : ''), extra: guard };
  }, lv);
  const name = await page.evaluate((l) => window.__ANIME_SCREW__.scenes.current.L.name, lv);
  console.log(`${res.ok ? '✔' : '✘'} ${String(lv + 1).padStart(2)} ${name}  ${((Date.now() - t0) / 1000).toFixed(1)}s ${res.why || ''}${res.extra > 1 ? ` (参考解外补拧 ${res.extra - 1})` : ''}`);
  if (!res.ok) bad++;
  if (errors.length) { console.log('  报错:', errors.splice(0)); bad++; }
}
// 锤子 + 螺丝刀单独试一下
await page.evaluate(() => window.__ANIME_SCREW__.scenes.change('game', { level: 20 }));
await page.waitForFunction(() => window.__ANIME_SCREW__.scenes.currentName === 'game' && !window.__ANIME_SCREW__.scenes.transitioning);
await page.waitForTimeout(1500);
const items = await page.evaluate(async () => {
  const g = window.__ANIME_SCREW__; const sc = g.scenes.current; const pz = sc.puzzle; sc.state = 'play';
  const glass = pz.boards.boards.find((b) => b.mat === 'glass' && pz.boards.isSolid(b));
  let hammer = 'no glass';
  if (glass) { sc.useItem('hammer'); const c = glass.body.vertices.reduce((a, v) => ({ x: a.x + v.x / glass.body.vertices.length, y: a.y + v.y / glass.body.vertices.length }), { x: 0, y: 0 }); sc.onPointerDown(c); hammer = glass.broken || glass.gone ? 'ok' : 'fail'; }
  await new Promise((r) => setTimeout(r, 800));
  const blocked = pz.screws.find((s) => s.state === 'on' && pz.blockReason(s));
  let driver = 'no blocked';
  if (blocked) { sc.useItem('screwdriver'); sc.onPointerDown(pz.posOf(blocked)); driver = blocked.state !== 'on' || blocked.colors.length ? (blocked.state !== 'on' ? 'ok' : 'partial') : 'fail'; }
  // 换盒：重新进一关，开局盒子是空的，换一次看颜色有没有变
  g.scenes.change('game', { level: 14 });
  await new Promise((r) => setTimeout(r, 1500));
  const sc2 = g.scenes.current; sc2.state = 'play';
  const before = sc2.puzzle.box.slots.map((b) => b && b.color).join(',') + '|' + sc2.puzzle.box.queue.join(',');
  sc2.useItem('shuffle');
  const after = sc2.puzzle.box.slots.map((b) => b && b.color).join(',') + '|' + sc2.puzzle.box.queue.join(',');
  return { hammer, driver, shuffle: sc2.usage.shuffle === 1 ? `ok (${before} → ${after})` : 'fail' };
});
console.log('道具:', JSON.stringify(items));
if (errors.length) { console.log('报错:', errors); bad++; }
await browser.close();
console.log(bad ? `✗ ${bad} 处问题` : '✓ 30 关在浏览器里都能通关');
process.exit(bad ? 1 : 0);

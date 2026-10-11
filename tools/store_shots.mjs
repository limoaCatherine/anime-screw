// 商店 / 提审截图 (竖屏 1080×1920)：广告位 ID 为空 (默认配置)，截图里不能出现任何「看广告」入口。
// 每张截图前检查：ads.enabled=false、没有第三盒位广告、当前所有按钮文字都不含「广告」。
// 用法：npm run build && node tools/store_shots.mjs → docs/store/screenshot_*.jpg
import { chromium } from 'playwright';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/store');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href);
const G = (fn, arg) => page.evaluate(fn, arg);
const waitScene = (n) => page.waitForFunction((s) => { const g = window.__ANIME_SCREW__; return g && g.scenes.currentName === s && !g.scenes.transitioning; }, n, { timeout: 10000 });
let bad = 0;
const shot = async (name) => {
  const c = await G(() => {
    const g = window.__ANIME_SCREW__; const sc = g.scenes.current;
    const labels = [...(sc.buttons || []), ...g.modals.flatMap((m) => m.buttons || [])].map((b) => `${b.label || ''}${b.sub || ''}`);
    return { enabled: g.ads.enabled, mode: g.ads.mode, third: !!(sc.tray && sc.tray.thirdOffer), placeholder: !!g.ads.placeholder, adLabels: labels.filter((l) => l.includes('广告')) };
  });
  const ok = !c.enabled && c.mode === 'off' && !c.third && !c.placeholder && c.adLabels.length === 0;
  if (!ok) bad++;
  const png = `/tmp/store_${name}.png`;
  await page.screenshot({ path: png });
  execFileSync('python3', ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=90)', png, path.join(out, `screenshot_${name}.jpg`)]);
  console.log(`${ok ? '✓' : '✗'} screenshot_${name}.jpg  ${JSON.stringify(c)}`);
};

await waitScene('menu'); await sleep(700);
await shot('01_主界面');
// 解锁并跳过提示卡，进带障碍的关卡拧几颗
await G(() => { const g = window.__ANIME_SCREW__; g.save.data.unlocked = 29; g.save.data.tipsSeen = { chain: 1, frost: 1, lock: 1, bomb: 1, hidden: 1, rope: 1, double: 1, screwdriver: 1, hammer: 1, shuffle: 1, glass: 1, cover: 1, holes: 1, basic: 1 }; });
for (const [lv, name, taps] of [[13, '02_锁链与冰冻', 3], [28, '03_满屏挑战', 4]]) {
  await G((l) => window.__ANIME_SCREW__.scenes.change('game', { level: l }), lv);
  await waitScene('game'); await sleep(2400);
  await G(() => { const g = window.__ANIME_SCREW__; g.modals.forEach((m) => m.close()); if (g.scenes.current.state === 'intro') g.scenes.current.state = 'play'; });
  await G((n) => { const sc = window.__ANIME_SCREW__.scenes.current; for (let k = 0; k < n; k++) { const t = sc.puzzle.tappable()[0]; if (t) sc.puzzle.tap(t.id); } }, taps);
  await sleep(1600);
  await shot(name);
}
// 第 1 关按参考解打完 → 揭画
await G(() => window.__ANIME_SCREW__.scenes.change('game', { level: 0 }));
await waitScene('game'); await sleep(1500);
await G(() => { const g = window.__ANIME_SCREW__; g.modals.forEach((m) => m.close()); g.scenes.current.state = 'play'; });
const sol = await G(() => window.__ANIME_SCREW__.scenes.current.L.solution);
for (const id of sol) {
  await page.waitForFunction((sid) => { const sc = window.__ANIME_SCREW__.scenes.current; const s = sc.puzzle.screw(sid); return s.state === 'on' && !sc.puzzle.blockReason(s) && !sc.tray.busy; }, id, { timeout: 15000 });
  await G((sid) => window.__ANIME_SCREW__.scenes.current.puzzle.tap(sid), id);
  await sleep(150);
}
await page.waitForFunction(() => window.__ANIME_SCREW__.modals.length > 0, null, { timeout: 12000 });
await sleep(900);
await shot('04_通关揭画');
await G(() => { const g = window.__ANIME_SCREW__; for (let i = 0; i < 10; i++) g.save.data.fragments[i] = true; g.modals.forEach((m) => m.close()); g.scenes.change('gallery', { chapter: 0 }); });
await waitScene('gallery'); await sleep(700);
await shot('05_画廊');
await browser.close();
if (errors.length) { console.log('页面报错', errors); bad++; }
console.log(bad ? `✗ ${bad} 张有问题` : '✓ 5 张商店截图都在「无广告位」配置下截取，没有任何看广告入口');
process.exit(bad ? 1 : 0);

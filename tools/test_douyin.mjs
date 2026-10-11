// 抖音小游戏构建的模拟运行测试 (Linux 上没有官方抖音开发者工具 / 模拟器)：
// Chromium 里注入 tools/lib/tt-mock.js (只含官方文档核对过的 tt.* 接口，屏蔽 window/document 等浏览器全局)，
// 按抖音的方式从 game.js 启动 douyin/dist/，然后用 tt.onTouch* 触摸事件把第 1 关真的玩一遍：
//   启动 → 分包加载 → 主界面 → 开拆 → 拧完第 1 关 → 过关面板 → 分享通关录屏 → 激励视频 → 侧边栏复访领奖 → 切后台/回前台
// 全程不允许出现运行时错误、未核对接口访问、分包前访问分包资源。
// 用法：npm run build:douyin && node tools/test_douyin.mjs
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'douyin/dist');
const shotDir = path.join(root, 'tools/_shots');
const W = 390; const H = 844; const DPR = 3;

async function walk(dir, base = '') {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walk(path.join(dir, e.name), rel)); else out.push(rel);
  }
  return out;
}

const files = await walk(dist);
const sources = {};
for (const f of files.filter((x) => x.endsWith('.js'))) sources[f] = await fs.readFile(path.join(dist, f), 'utf8');
const gameJson = JSON.parse(await fs.readFile(path.join(dist, 'game.json'), 'utf8'));
const ttCfg = {
  files: Object.fromEntries(files.map((f) => [f, true])),
  gameJson,
  sys: { brand: 'Apple', model: 'iPhone 14', platform: 'ios', system: '17.0', appName: 'Douyin', SDKVersion: '3.80.0', version: '30.0.0',
    screenWidth: W, screenHeight: H, windowWidth: W, windowHeight: H, pixelRatio: DPR,
    safeArea: { left: 0, right: W, top: 47, bottom: H - 34, width: W, height: H - 81 }, deviceScore: { overall: 9 } },
  menu: { width: 87, height: 32, top: 51, bottom: 83, left: W - 94, right: W - 7 },
  launch: { scene: '011004', query: {}, extra: {} },
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
await page.route('http://dy.local/**', async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  if (rel === '' || rel === 'index.html') return route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html><body style="margin:0;background:#000"></body></html>' });
  try { return route.fulfill({ body: await fs.readFile(path.join(dist, rel)) }); } catch (_) { return route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://dy.local/index.html');
await page.evaluate(([cfg, src]) => { window.__TT_CONFIG = cfg; window.__TT_SOURCES = src; }, [ttCfg, sources]);
await page.addScriptTag({ path: path.join(root, 'tools/lib/tt-mock.js') });

const steps = [];
const step = (name, ok, info = '') => { steps.push({ name, ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${info ? `  ${info}` : ''}`); };
const shot = async (name) => { await fs.mkdir(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `douyin_${name}.png`) }); };

// 启动：和抖音一样执行 game.js
await page.evaluate(() => window.__ttRequire('game.js'));
const booted = await page.waitForFunction(() => window.__GG.__ANIME_SCREW__?.scenes.currentName === 'menu', null, { timeout: 20000 }).then(() => true, () => false);
const bootInfo = await page.evaluate(() => ({ subs: [...window.__TT.loadedSubs], view: window.__GG.__ANIME_SCREW__?.view, canvas: [window.__TT.screen.width, window.__TT.screen.height] }));
step('game.js 启动进入主界面', booted, `已加载分包 ${bootInfo.subs.join(',')}  画布 ${bootInfo.canvas.join('x')}  逻辑缩放 ${bootInfo.view && bootInfo.view.scale.toFixed(3)} 偏移 ${bootInfo.view && [bootInfo.view.offX, bootInfo.view.offY]}`);
await page.waitForTimeout(400);
await shot('menu');

// 触摸工具：逻辑坐标 → 屏幕逻辑像素 (官方 Touch 只有 identifier / screenX / screenY)
let touchId = 1;
const tap = async (lx, ly) => {
  await page.evaluate(([x, y, id]) => {
    const g = window.__GG.__ANIME_SCREW__; const v = g.view; const k = g.platform._touchScale;
    const sx = (x * v.scale + v.offX) / k; const sy = (y * v.scale + v.offY) / k;
    const t = { identifier: id, screenX: sx, screenY: sy };
    const T = window.__TT.touches;
    T.start({ touches: [t], changedTouches: [t], timeStamp: Date.now() });
    T.end({ touches: [], changedTouches: [t], timeStamp: Date.now() + 60 });
  }, [lx, ly, touchId++]);
  await page.waitForTimeout(60);
};
const scene = () => page.evaluate(() => window.__GG.__ANIME_SCREW__.scenes.currentName);

// 第一次点击解锁音频；点「开拆」
await tap(270, 742);
const inGame = await page.waitForFunction(() => { const g = window.__GG.__ANIME_SCREW__; return g.scenes.currentName === 'game' && !g.scenes.transitioning; }, null, { timeout: 8000 }).then(() => true, () => false);
step('触摸「开拆」进入第 1 关', inGame, `scene=${await scene()}`);
await page.waitForTimeout(2600);       // 开场关名 + 提示卡
await shot('level1');
// 关掉提示卡 (如有)
for (let i = 0; i < 3; i++) {
  const modal = await page.evaluate(() => { const g = window.__GG.__ANIME_SCREW__; const m = g.topModal; return m ? m.buttons.map((b) => [b.x, b.y, b.label]) : null; });
  if (!modal) break;
  const b = modal[modal.length - 1];
  await tap(b[0], b[1]);
  await page.waitForTimeout(400);
}
// 按参考解逐颗触摸螺丝
const sol = await page.evaluate(() => window.__GG.__ANIME_SCREW__.scenes.current.L.solution);
let taps = 0;
for (const id of sol) {
  const pos = await page.evaluate(async (sid) => {
    const g = window.__GG.__ANIME_SCREW__; const sc = g.scenes.current; const pz = sc.puzzle;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const s = pz.screw(sid);
      if (pz.status !== 'play' || s.state !== 'on') return null;
      if (!pz.blockReason(s) && !sc.tray.busy && !g.topModal) return pz.posOf(s);
      await new Promise((r) => setTimeout(r, 40));
    }
    return { stuck: pz.blockReason(pz.screw(sid)) };
  }, id);
  if (!pos) continue;
  if (pos.stuck) { step(`螺丝 #${id} 等待超时`, false, pos.stuck); break; }
  await tap(pos.x, pos.y);
  taps++;
}
const won = await page.waitForFunction(() => { const g = window.__GG.__ANIME_SCREW__; const sc = g.scenes.current; return sc.puzzle && sc.puzzle.status === 'win'; }, null, { timeout: 10000 }).then(() => true, () => false);
step('用触摸拧完第 1 关', won, `触摸 ${taps} 次 / 参考解 ${sol.length} 颗`);
const panel = await page.waitForFunction(() => { const m = window.__GG.__ANIME_SCREW__.topModal; return m && m.constructor && m.buttons.some((b) => b.label === '分享通关录屏'); }, null, { timeout: 12000 }).then(() => true, () => false);
step('过关面板出现「分享通关录屏」按钮', panel);
await page.waitForTimeout(500);
await shot('win');
const rec = await page.evaluate(() => window.__TT.recorder);
step('录屏：进关 start(duration=300)，揭画后 stop', rec.some((r) => r.op === 'start' && r.d === 300) && rec.some((r) => r.op === 'stop'), JSON.stringify(rec));

// 录屏时长要 ≥3 秒才会留下视频；第 1 关本身就超过 3 秒
await tap(270 - 112, 724);
await page.waitForTimeout(300);
const shares = await page.evaluate(() => window.__TT.shares);
const vs = shares.find((s) => s.channel === 'video');
step('分享通关录屏 → tt.shareAppMessage(channel:video, extra.videoPath)', !!(vs && vs.extra && vs.extra.videoPath), vs ? `${vs.title} / ${vs.extra.videoPath}` : JSON.stringify(shares));

// 激励视频：广告位 ID 还是 YOUR_ 占位 → 不创建广告、所有「看广告」入口隐藏 (免费再试一次 / 每日免费道具)
// 再临时塞一个测试 ID 验证 tt.createRewardedVideoAd 的 onClose(isEnded/count) 流程与入口恢复
const ad = await page.evaluate(async () => {
  const g = window.__GG.__ANIME_SCREW__;
  const r = { mode0: g.ads.mode, enabled0: g.ads.enabled, created0: window.__TT.ads.length };
  r.blocked = await g.ads.showRewardedAd('should-not-run');
  g.scenes.change('game', { level: 0 });
  await new Promise((res) => setTimeout(res, 1200));
  const sc = g.scenes.current; g.modals.forEach((m) => m.close()); sc.state = 'play';
  sc.puzzle.fail('holes');
  await new Promise((res) => setTimeout(res, 1500));
  r.labels0 = g.modals.at(-1) ? g.modals.at(-1).buttons.map((b) => b.label) : [];
  g.modals.forEach((m) => m.close());
  g.ads.ad = window.__tt.createRewardedVideoAd({ adUnitId: 'test-unit' });
  r.enabled1 = g.ads.enabled;
  r.ok = await g.ads.showRewardedAd('test');
  r.shown = window.__TT.ads.length;
  return r;
});
step('广告位 ID 还是 YOUR_ 占位：不建广告，失败面板只有免费「再试一次」、没有任何看广告按钮',
  ad.mode0 === 'off' && !ad.enabled0 && ad.blocked === false && ad.labels0.some((l) => l.startsWith('再试一次')) && !ad.labels0.some((l) => l.includes('广告')),
  `mode=${ad.mode0} 按钮=${ad.labels0.join(' / ')}`);
await shot('fail_free_retry');
step('填了广告位后 → 入口恢复，show() → onClose(isEnded:true,count:1) 发奖励', ad.enabled1 && ad.ok === true && ad.shown === 1);

// 侧边栏复访：回主界面 → 礼包 → 去首页侧边栏 (navigateToScene) → 模拟从侧边栏回来 → 立即领奖
await page.evaluate(() => { const g = window.__GG.__ANIME_SCREW__; g.modals = []; g.scenes.change('menu'); });
await page.waitForFunction(() => { const g = window.__GG.__ANIME_SCREW__; return g.scenes.currentName === 'menu' && !g.scenes.transitioning && g.scenes.current.giftBtn; }, null, { timeout: 8000 }).catch(() => {});
const gift = await page.evaluate(() => !!window.__GG.__ANIME_SCREW__.scenes.current.giftBtn);
step('tt.checkScene(sidebar) isExist → 主界面显示「入口有奖」礼包', gift);
await shot('menu_gift');
const items0 = await page.evaluate(() => ({ ...window.__GG.__ANIME_SCREW__.save.data.items }));
await tap(44, 44);
await page.waitForTimeout(400);
const label1 = await page.evaluate(() => window.__GG.__ANIME_SCREW__.topModal?.main?.label);
await shot('sidebar_panel');
await tap(270 + 90, 690);           // 去首页侧边栏
await page.waitForTimeout(150);
const hiddenNow = await page.evaluate(() => window.__GG.__ANIME_SCREW__.hidden);
await page.waitForTimeout(600);
await tap(44, 44);
await page.waitForTimeout(400);
const label2 = await page.evaluate(() => window.__GG.__ANIME_SCREW__.topModal?.main?.label);
await tap(270 + 90, 690);           // 立即领奖
await page.waitForTimeout(300);
const items1 = await page.evaluate(() => ({ ...window.__GG.__ANIME_SCREW__.save.data.items }));
const sc = await page.evaluate(() => window.__TT.scenes);
step('侧边栏：navigateToScene → onHide 暂停 → onShow(launch_from=homepage, location=sidebar_card) → 立即领奖',
  label1 === '去首页侧边栏' && hiddenNow === true && label2 === '立即领奖' && items1.undo === items0.undo + 1 && items1.addHole === items0.addHole + 1 && items1.shuffle === items0.shuffle + 1,
  `按钮 ${label1} → ${label2}，切后台时 hidden=${hiddenNow}，道具 undo ${items0.undo}→${items1.undo}，调用 ${sc.join(',')}`);

// 生命周期：onHide 暂停主循环、音乐；onShow 恢复
const life = await page.evaluate(async () => {
  const g = window.__GG.__ANIME_SCREW__; const T = window.__TT;
  for (const cb of T.hides) cb();
  const t0 = g.time; await new Promise((r) => setTimeout(r, 400)); const frozen = g.time === t0;
  const bgmPaused = Object.values(g.bgm.players).every((p) => p.el.paused);
  for (const cb of T.shows) cb({ scene: '011004', query: {} });
  await new Promise((r) => setTimeout(r, 400));
  return { frozen, bgmPaused, resumed: g.time > t0 };
});
step('tt.onHide 暂停 / tt.onShow 恢复', life.frozen && life.bgmPaused && life.resumed, JSON.stringify(life));

// 音频：音效 (主包 assets/sfx)、语音 (sub_voice)、音乐 (sub_bgm) 都经 InnerAudioContext 播过
const au = await page.evaluate(() => ({ list: window.__TT.audio.map((a) => a.src), ctx: window.__TT.audioCount }));
const sfx = new Set(au.list.filter((s) => s.startsWith('assets/sfx/')).map((s) => s.slice(11)));
step('InnerAudioContext：音效 / 语音 / 音乐', sfx.size >= 3 && au.list.some((s) => s.startsWith('sub_voice/')) && au.list.some((s) => s.startsWith('sub_bgm/')),
  `音效 ${[...sfx].join(' ')} | 语音 ${au.list.filter((s) => s.startsWith('sub_voice/')).length} 次 | 音乐 ${[...new Set(au.list.filter((s) => s.startsWith('sub_bgm/')))].join(' ')} | 创建 ${au.ctx} 个实例`);

// 抖音版 BGM：mp3 + LoopTrack 两路接力 (不用 loop=true，避开 mp3 编码延迟/补帧造成的循环空白)
const lt = await page.evaluate(() => {
  const b = window.__GG.__ANIME_SCREW__.bgm; const p = b.current && b.players[b.current];
  const el = p && p.el;
  return el ? { looptrack: !!(el.voices && el.voices.length === 2), pre: el.pre, len: el.len, nativeLoop: el.voices ? el.voices.map((v) => v.el._ctx ? v.el._ctx.loop : v.el.loop) : null, src: el.src, playing: !el.paused, seeks: window.__TT.seeks || 0 } : null;
});
step('BGM 用 LoopTrack 两路接力 (mp3 垫片 + seek，不用 loop=true)', !!(lt && lt.looptrack && lt.pre === 0.5 && lt.len > 30 && lt.nativeLoop.every((x) => x === false) && lt.seeks > 0 && /\.mp3$/.test(lt.src)), JSON.stringify(lt));

const save = await page.evaluate(() => Object.keys(window.__TT.storage));
const saved = await page.evaluate(() => { const s = window.__TT.storage; const k = Object.keys(s)[0]; try { return JSON.parse(s[k]).cleared; } catch (_) { return null; } });
step('存档走 tt.setStorageSync', save.length > 0 && saved && saved[0] === true, `key=${save.join(',')} cleared=${JSON.stringify(saved)}`);

const tt = await page.evaluate(() => ({ errors: window.__TT.errors, used: [...new Set(window.__TT.log)].sort() }));
step('没有访问未核对的 tt 接口 / 分包前访问资源', tt.errors.length === 0, tt.errors.slice(0, 5).join(' | '));
step('全程没有运行时错误', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`用到的 tt 接口：${tt.used.join(', ')}`);
await browser.close();
const bad = steps.filter((s) => !s.ok).length;
await fs.writeFile(path.join(root, 'douyin/harness-report.txt'), `${steps.map((s) => `${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.info ? `  — ${s.info}` : ''}`).join('\n')}\n用到的 tt 接口：${tt.used.join(', ')}\n`, 'utf8');
console.log(bad ? `失败 ${bad} 项` : `全部 ${steps.length} 项通过`);
process.exit(bad ? 1 : 0);

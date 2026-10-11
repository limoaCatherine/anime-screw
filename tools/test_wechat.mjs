// 微信小游戏构建的模拟运行测试 (Linux 上没有微信开发者工具 / 模拟器)：
// Chromium 里注入 tools/lib/wx-mock.js (只含微信开放文档核对过的 wx.* 接口，屏蔽 window/document 等浏览器全局，tt 为 undefined)，
// 按微信的方式从 game.js 启动 wechat/dist/，然后用 wx.onTouch* 触摸事件 (clientX/clientY) 把第 1 关真的玩一遍：
//   启动 → 分包加载 → 主界面 → 开拆 → 拧完第 1 关 → 过关面板 → 转发 → 广告位为空的免费「再试一次」→ 激励视频 (填 ID 后) → 切后台/回前台
// 全程不允许出现运行时错误、未核对接口访问、分包前访问分包资源。
// 用法：npm run build:wechat && node tools/test_wechat.mjs
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'wechat/dist');
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
// 微信 subpackages 字段 (game.json 里小写 subpackages)
gameJson.subPackages = gameJson.subpackages || gameJson.subPackages;
const wxCfg = {
  files: Object.fromEntries(files.map((f) => [f, true])),
  gameJson,
  // wx.getWindowInfo 字段：pixelRatio / screenWidth / screenHeight / windowWidth / windowHeight / statusBarHeight / safeArea / screenTop
  win: { pixelRatio: DPR, screenWidth: W, screenHeight: H, windowWidth: W, windowHeight: H, statusBarHeight: 47, screenTop: 0,
    safeArea: { left: 0, right: W, top: 47, bottom: H - 34, width: W, height: H - 81 } },
  sys: { brand: 'iPhone', model: 'iPhone 14', platform: 'ios', system: 'iOS 17.0', SDKVersion: '3.6.0', version: '8.0.50' },
  menu: { width: 87, height: 32, top: 51, bottom: 83, left: W - 94, right: W - 7 },
  launch: { scene: 1001, query: {}, referrerInfo: {} },
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
await page.route('http://wx.local/**', async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  if (rel === '' || rel === 'index.html') return route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html><body style="margin:0;background:#000"></body></html>' });
  try { return route.fulfill({ body: await fs.readFile(path.join(dist, rel)) }); } catch (_) { return route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://wx.local/index.html');
await page.evaluate(([cfg, src]) => { window.__WX_CONFIG = cfg; window.__WX_SOURCES = src; }, [wxCfg, sources]);
await page.addScriptTag({ path: path.join(root, 'tools/lib/wx-mock.js') });

const steps = [];
const step = (name, ok, info = '') => { steps.push({ name, ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${info ? `  ${info}` : ''}`); };
const shot = async (name) => { await fs.mkdir(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `wechat_${name}.png`) }); };

// 启动：和微信一样执行 game.js
await page.evaluate(() => window.__wxRequire('game.js'));
const booted = await page.waitForFunction(() => window.__GG.__ANIME_SCREW__?.scenes.currentName === 'menu', null, { timeout: 20000 }).then(() => true, () => false);
const bootInfo = await page.evaluate(() => ({ subs: [...window.__WX.loadedSubs], view: window.__GG.__ANIME_SCREW__?.view, canvas: [window.__WX.screen.width, window.__WX.screen.height] }));
step('game.js 启动进入主界面', booted, `已加载分包 ${bootInfo.subs.join(',')}  画布 ${bootInfo.canvas.join('x')}  逻辑缩放 ${bootInfo.view && bootInfo.view.scale.toFixed(3)} 偏移 ${bootInfo.view && [bootInfo.view.offX, bootInfo.view.offY]}`);
await page.waitForTimeout(400);
await shot('menu');

// 触摸工具：逻辑坐标 → 屏幕逻辑像素 (微信 Touch: identifier / pageX / pageY / clientX / clientY / force)
let touchId = 1;
const tap = async (lx, ly) => {
  await page.evaluate(([x, y, id]) => {
    const g = window.__GG.__ANIME_SCREW__; const v = g.view; const k = g.platform._touchScale;
    const sx = (x * v.scale + v.offX) / k; const sy = (y * v.scale + v.offY) / k;
    const t = { identifier: id, pageX: sx, pageY: sy, clientX: sx, clientY: sy, force: 1 };
    const T = window.__WX.touches;
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
const panelLabels = await page.waitForFunction(() => { const m = window.__GG.__ANIME_SCREW__.topModal; return m && m.buttons.some((b) => b.label === '给朋友看看这幅画') ? m.buttons.map((b) => b.label) : null; }, null, { timeout: 12000 }).then((h) => h.jsonValue(), () => null);
step('过关面板：「给朋友看看这幅画」，没有抖音专有的「分享通关录屏」', !!panelLabels && !panelLabels.includes('分享通关录屏'), panelLabels ? panelLabels.join(' / ') : '');
await page.waitForTimeout(500);
await shot('win');

// 游戏内转发 → wx.shareAppMessage({ title, imageUrl(5:4), query })
await tap(270, 724);
await page.waitForTimeout(200);
const share = await page.evaluate(() => ({ shares: window.__WX.shares, menu: window.__WX.shareMenu, card: window.__WX.shareListeners.map((f) => f()) }));
const s0 = share.shares[0];
step('转发：wx.shareAppMessage(title, imageUrl, query=chapter=0)', !!(s0 && s0.title && s0.query === 'chapter=0' && s0.imageUrl === 'assets/share.jpg'), JSON.stringify(s0));
step('右上角菜单：wx.showShareMenu([shareAppMessage]) + wx.onShareAppMessage 返回转发卡片', share.menu.length === 1 && share.card.length === 1 && !!share.card[0].title && share.card[0].imageUrl === 'assets/share.jpg', `${JSON.stringify(share.menu)} ${JSON.stringify(share.card)}`);

// 广告位 ID 还是 YOUR_ 占位 → 不创建广告、所有「看广告」入口隐藏 (免费再试一次 / 每日免费道具)
// 再用平台层 createRewardedAd 建一个测试广告，验证 wx onClose({isEnded}) 流程 (看完发奖 / 中途关不发)
const ad = await page.evaluate(async () => {
  const g = window.__GG.__ANIME_SCREW__;
  const r = { mode0: g.ads.mode, enabled0: g.ads.enabled, created0: window.__WX.ads.length };
  r.blocked = await g.ads.showRewardedAd('should-not-run');
  g.scenes.change('game', { level: 0 });
  await new Promise((res) => setTimeout(res, 1200));
  const sc = g.scenes.current; g.modals.forEach((m) => m.close()); sc.state = 'play';
  sc.puzzle.fail('holes');
  await new Promise((res) => setTimeout(res, 1500));
  const m = g.modals.at(-1);
  r.labels0 = m ? m.buttons.map((b) => b.label) : [];
  const retry = m && m.buttons.find((b) => b.label.startsWith('再试一次'));
  r.retryPos = retry ? [retry.x, retry.y] : null;
  return r;
});
step('广告位 ID 还是 YOUR_ 占位：不建广告，失败面板只有免费「再试一次」、没有任何看广告按钮',
  ad.mode0 === 'off' && !ad.enabled0 && ad.blocked === false && ad.created0 === 0 && ad.labels0.some((l) => l.startsWith('再试一次')) && !ad.labels0.some((l) => l.includes('广告')),
  `mode=${ad.mode0} 按钮=${ad.labels0.join(' / ')}`);
await shot('fail_free_retry');
if (ad.retryPos) await tap(ad.retryPos[0], ad.retryPos[1]);
await page.waitForTimeout(800);
const retried = await page.evaluate(() => { const g = window.__GG.__ANIME_SCREW__; const sc = g.scenes.current; return { status: sc.puzzle && sc.puzzle.status, modal: !!g.topModal, label: sc.reviveLimit }; });
step('点免费「再试一次」→ 继续本关 (不看广告)', retried.status === 'play' && !retried.modal, JSON.stringify(retried));
const ad2 = await page.evaluate(async () => {
  const g = window.__GG.__ANIME_SCREW__;
  g.modals.forEach((m) => m.close());
  g.ads.ad = g.platform.createRewardedAd('adunit-test');
  const r = { enabled1: g.ads.enabled, mode1: g.ads.mode };
  r.ok = await g.ads.showRewardedAd('test');
  window.__WX_CONFIG.adEnded = false;
  r.ok2 = await g.ads.showRewardedAd('test-close-early');
  window.__WX_CONFIG.adEnded = true;
  r.shown = window.__WX.ads.length;
  return r;
});
step('填了广告位后 → wx.createRewardedVideoAd，onClose(isEnded:true) 发奖励 / isEnded:false 不发', ad2.enabled1 && ad2.mode1 === 'wechat' && ad2.ok === true && ad2.ok2 === false && ad2.shown === 2, JSON.stringify(ad2));

// 主界面：没有抖音侧边栏礼包
await page.evaluate(() => { const g = window.__GG.__ANIME_SCREW__; g.modals = []; g.scenes.change('menu'); });
await page.waitForFunction(() => { const g = window.__GG.__ANIME_SCREW__; return g.scenes.currentName === 'menu' && !g.scenes.transitioning; }, null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);
const gift = await page.evaluate(() => !!window.__GG.__ANIME_SCREW__.scenes.current.giftBtn);
step('主界面没有抖音专有的侧边栏礼包', !gift);

// 生命周期：onHide 暂停主循环、音乐；onShow 恢复
const life = await page.evaluate(async () => {
  const g = window.__GG.__ANIME_SCREW__; const T = window.__WX;
  for (const cb of T.hides) cb();
  const t0 = g.time; await new Promise((r) => setTimeout(r, 400)); const frozen = g.time === t0;
  const bgmPaused = Object.values(g.bgm.players).every((p) => p.el.paused);
  for (const cb of T.shows) cb({ scene: 1001, query: {}, referrerInfo: {} });
  await new Promise((r) => setTimeout(r, 400));
  return { frozen, bgmPaused, resumed: g.time > t0 };
});
step('wx.onHide 暂停 / wx.onShow 恢复', life.frozen && life.bgmPaused && life.resumed, JSON.stringify(life));

// 音频：音效 (主包 assets/sfx)、语音 (sub_voice)、音乐 (sub_bgm) 都经 InnerAudioContext 播过
const au = await page.evaluate(() => ({ list: window.__WX.audio.map((a) => a.src), ctx: window.__WX.audioCount }));
const sfx = new Set(au.list.filter((s) => s.startsWith('assets/sfx/')).map((s) => s.slice(11)));
step('InnerAudioContext：音效 / 语音 / 音乐', sfx.size >= 3 && au.list.some((s) => s.startsWith('sub_voice/')) && au.list.some((s) => s.startsWith('sub_bgm/')),
  `音效 ${[...sfx].join(' ')} | 语音 ${au.list.filter((s) => s.startsWith('sub_voice/')).length} 次 | 音乐 ${[...new Set(au.list.filter((s) => s.startsWith('sub_bgm/')))].join(' ')} | 创建 ${au.ctx} 个实例`);

// 微信版 BGM：mp3 + LoopTrack 两路接力 (不用 loop=true，避开 mp3 编码延迟/补帧造成的循环空白)
const lt = await page.evaluate(() => {
  const b = window.__GG.__ANIME_SCREW__.bgm; const p = b.current && b.players[b.current];
  const el = p && p.el;
  return el ? { looptrack: !!(el.voices && el.voices.length === 2), pre: el.pre, len: el.len, nativeLoop: el.voices ? el.voices.map((v) => v.el._ctx ? v.el._ctx.loop : v.el.loop) : null, src: el.src, playing: !el.paused, seeks: window.__WX.seeks || 0 } : null;
});
step('BGM 用 LoopTrack 两路接力 (mp3 垫片 + seek，不用 loop=true)', !!(lt && lt.looptrack && lt.pre === 0.5 && lt.len > 30 && lt.nativeLoop.every((x) => x === false) && lt.seeks > 0 && /\.mp3$/.test(lt.src)), JSON.stringify(lt));

const save = await page.evaluate(() => Object.keys(window.__WX.storage));
const saved = await page.evaluate(() => { const s = window.__WX.storage; const k = Object.keys(s)[0]; try { return JSON.parse(s[k]).cleared; } catch (_) { return null; } });
step('存档走 wx.setStorageSync', save.length > 0 && saved && saved[0] === true, `key=${save.join(',')} cleared=${JSON.stringify(saved)}`);

const wxr = await page.evaluate(() => ({ errors: window.__WX.errors, used: [...new Set(window.__WX.log)].sort() }));
step('没有访问未核对的 wx 接口 / 分包前访问资源', wxr.errors.length === 0, wxr.errors.slice(0, 5).join(' | '));
step('全程没有运行时错误', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`用到的 wx 接口：${wxr.used.join(', ')}`);
await browser.close();
const bad = steps.filter((s) => !s.ok).length;
await fs.writeFile(path.join(root, 'wechat/harness-report.txt'), `${steps.map((s) => `${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.info ? `  — ${s.info}` : ''}`).join('\n')}\n用到的 wx 接口：${wxr.used.join(', ')}\n`, 'utf8');
console.log(bad ? `失败 ${bad} 项` : `全部 ${steps.length} 项通过`);
process.exit(bad ? 1 : 0);

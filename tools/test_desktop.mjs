// 桌面版自动化测试：在 Linux 上运行同一份打包应用 (build/linux-x64)，验证和 Windows 版共用的主进程逻辑。
// 用法: npm run pack:linux && xvfb-run -a node tools/test_desktop.mjs
// 检查: 打包模式 / 标题 / 无菜单 / 9:16 / 开发者工具禁用 / 存档目录 AnimeScrew / save.json 写入后重启还在
import { _electron as electron } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'build/linux-x64/anime-screw');
const cfgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'as-cfg-'));   // 独立 appData
const env = { ...process.env, XDG_CONFIG_HOME: cfgHome };
let failures = 0;
const check = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) failures++; };

async function launch() {
  const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'], env });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push(String(e)));
  await win.waitForFunction(() => window.__ANIME_SCREW__ && window.__ANIME_SCREW__.scenes.currentName === 'menu', null, { timeout: 20000 });
  return { app, win, errors };
}

console.log('[desktop] 第一次启动');
let { app, win, errors } = await launch();
const info = await app.evaluate(({ app: a, BrowserWindow, Menu }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const [cw, ch] = w.getContentSize();
  return { packaged: a.isPackaged, title: w.getTitle(), menu: Menu.getApplicationMenu(), size: [cw, ch], userData: a.getPath('userData'),
    devtools: (() => { w.webContents.openDevTools(); return w.webContents.isDevToolsOpened(); })() };
});
check(info.packaged, '打包模式运行');
check(info.title === '拆封绘卷', `窗口标题 ${info.title}`);
check(info.menu === null, '没有菜单栏');
check(Math.abs(info.size[0] / info.size[1] - 9 / 16) < 0.02, `竖屏 9:16 (${info.size.join('x')})`);
check(info.devtools === false, '打包后打不开开发者工具');
check(/AnimeScrew$/.test(info.userData), `存档目录 ${info.userData}`);
const backend = await win.evaluate(() => window.__ANIME_SCREW__.save.backend.name);
check(backend === 'desktop', `存档后端 = ${backend}`);
await win.evaluate(() => { const s = window.__ANIME_SCREW__.save; s.data.cleared[0] = true; s.data.unlocked = 3; s.data.master = 0.7; s.flush(); });
const file = path.join(info.userData, 'save.json');
check(fs.existsSync(file), `写出 ${file}`);
check(errors.length === 0, `无报错 ${errors.join(' | ')}`);
await app.close();

console.log('[desktop] 重启，看存档还在不在');
({ app, win, errors } = await launch());
const st = await win.evaluate(() => { const d = window.__ANIME_SCREW__.save.data; return { u: d.unlocked, c: d.cleared[0], m: d.master }; });
check(st.u === 3 && st.c && Math.abs(st.m - 0.7) < 1e-6, `存档保留 ${JSON.stringify(st)}`);
check(errors.length === 0, `无报错 ${errors.join(' | ')}`);
await app.close();
fs.rmSync(cfgHome, { recursive: true, force: true });
console.log(failures ? `✗ ${failures} 项失败` : '✓ 桌面版测试通过');
process.exit(failures ? 1 : 0);

// 桌面外壳 (Electron 主进程)：在独立窗口中运行 dist/index.html。
// - Windows 下是 GUI 程序，没有控制台窗口
// - 竖屏窗口 (按屏幕大小自适应，保持 9:16)、无菜单栏、ready-to-show 后再显示 (不闪白屏)
// - 单实例：重复双击只会把已经打开的窗口拉到前面
// - 存档写在 %APPDATA%\AnimeScrew\save.json (通过 preload 暴露 window.desktopSave)
// - "给朋友看看这幅画" 在桌面版会把整幅画存到 "图片\拆封绘卷"
const { app, BrowserWindow, Menu, shell, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const TITLE = '拆封绘卷';
const BG = '#f3e6d3';
const ASPECT = 9 / 16;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// 固定用户数据目录 (ASCII 名称，改版本、改 exe 名都不会丢存档)
app.setPath('userData', path.join(app.getPath('appData'), 'AnimeScrew'));
if (process.platform === 'win32') app.setAppUserModelId('com.limao.animescrew');

const saveFile = () => path.join(app.getPath('userData'), 'save.json');

// ---- 存档 (同步 IPC：游戏里存档调用是同步的) ----
ipcMain.on('save:read', (e) => {
  try { e.returnValue = fs.existsSync(saveFile()) ? fs.readFileSync(saveFile(), 'utf8') : null; } catch (err) { e.returnValue = null; }
});
ipcMain.on('save:write', (e, text) => {
  try {
    fs.mkdirSync(path.dirname(saveFile()), { recursive: true });
    const tmp = saveFile() + '.tmp';
    fs.writeFileSync(tmp, String(text), 'utf8');
    fs.renameSync(tmp, saveFile());       // 先写临时文件再改名，断电也不会写坏存档
    e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});
ipcMain.handle('save:image', async (e, name, dataUrl) => {
  try {
    const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl));
    if (!m) return null;
    const dir = path.join(app.getPath('pictures'), '拆封绘卷');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'cg.png').replace(/[\\/:*?"<>|]/g, '_');
    const file = path.join(dir, safe.endsWith('.png') ? safe : safe + '.png');
    fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
    shell.showItemInFolder(file);
    return file;
  } catch (err) { return null; }
});

let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const area = screen.getPrimaryDisplay().workAreaSize;
  const height = Math.round(Math.min(960, area.height * 0.92));
  const width = Math.round(height * ASPECT);

  win = new BrowserWindow({
    width, height, minWidth: 270, minHeight: 480,
    useContentSize: true, center: true, show: false,
    title: TITLE, backgroundColor: BG, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  win.setAspectRatio(ASPECT);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('page-title-updated', (e) => e.preventDefault());

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  if (app.isPackaged) {
    wc.on('before-input-event', (e, input) => {
      const k = (input.key || '').toLowerCase();
      if (k === 'f12' || ((input.control || input.meta) && input.shift && k === 'i')) e.preventDefault();
      if (k === 'f5' || ((input.control || input.meta) && k === 'r')) e.preventDefault();
    });
  }
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => { win = null; });
}

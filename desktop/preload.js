// 预加载脚本：只把存档读写和存图这三个口子暴露给页面，页面本身拿不到 Node。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopSave', {
  read: () => ipcRenderer.sendSync('save:read'),
  write: (text) => ipcRenderer.sendSync('save:write', String(text)),
  saveImage: (name, dataUrl) => ipcRenderer.invoke('save:image', name, dataUrl),
});

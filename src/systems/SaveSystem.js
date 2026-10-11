// 存档系统：进度 (解锁到第几关、每关是否拆过、画册碎片)、道具库存、设置。
// 存储后端自动选择：
//   - Electron 桌面版：window.desktopSave (preload 暴露) → %APPDATA%\AnimeScrew\save.json
//   - 抖音小游戏：tt.getStorageSync / tt.setStorageSync；微信小游戏：wx.getStorageSync / wx.setStorageSync
//   - 浏览器：localStorage
//   - 都不可用 (隐私模式等)：只存在内存里
import { GameConfig } from '../config/GameConfig.js';

export const SAVE_VERSION = 2;

function pickBackend(key) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (g.desktopSave && typeof g.desktopSave.read === 'function') {
    return { name: 'desktop', read: () => g.desktopSave.read(), write: (s) => g.desktopSave.write(s) };
  }
  if (typeof tt !== 'undefined' && tt.getStorageSync) {
    // eslint-disable-next-line no-undef
    return { name: 'tt', read: () => tt.getStorageSync(key) || null, write: (s) => tt.setStorageSync(key, s) };
  }
  // eslint-disable-next-line no-undef
  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    // eslint-disable-next-line no-undef
    return { name: 'wx', read: () => wx.getStorageSync(key) || null, write: (s) => wx.setStorageSync(key, s) };
  }
  try {
    const ls = g.localStorage;
    ls.setItem('__probe', '1'); ls.removeItem('__probe');
    return { name: 'localStorage', read: () => ls.getItem(key), write: (s) => ls.setItem(key, s) };
  } catch (_) {
    let mem = null;
    return { name: 'memory', read: () => mem, write: (s) => { mem = s; } };
  }
}

function defaults() {
  const items = {};
  for (const [k, v] of Object.entries(GameConfig.items)) items[k] = v.start;
  return {
    version: SAVE_VERSION,
    unlocked: 0,          // 已解锁到第几关 (0 起)
    cleared: {},          // { [levelIndex]: true }
    fragments: {},        // { [levelIndex]: true } 画册碎片 (= 拆过的关)
    cgSeen: {},           // { [chapterId]: true } 整幅画揭开动画看过了
    tipsSeen: {},
    items,
    plays: 0,
    master: 1,
    sfxOn: true, voiceOn: true, bgmOn: true,
  };
}

export class SaveSystem {
  constructor(key = GameConfig.storageKey) {
    this.key = key;
    this.backend = pickBackend(key);
    this.data = defaults();
    try {
      const raw = this.backend.read();
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(this.data, parsed);
          this.data.items = { ...defaults().items, ...(parsed.items || {}) };
        }
      }
    } catch (err) {
      console.warn('[SaveSystem] 存档读取失败，使用新存档', err);
    }
    this.sanitize();
  }

  /** 存档体检：字段类型不对 / 数值越界 (手改、旧版本、写坏) 都拉回合法范围；碎片和"拆过"互相补齐 */
  sanitize(total = GameConfig.levelCount || 30) {
    const d = this.data; const def = defaults();
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : (Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [i, x]).filter(([, x]) => x)) : {}));
    for (const k of ['cleared', 'fragments', 'cgSeen', 'tipsSeen']) d[k] = obj(d[k]);
    for (const k of Object.keys(d.cleared)) if (d.cleared[k]) d.fragments[k] = true;
    for (const k of Object.keys(d.fragments)) if (d.fragments[k]) d.cleared[k] = true;
    const maxCleared = Math.max(-1, ...Object.keys(d.cleared).filter((k) => d.cleared[k]).map(Number).filter((n) => n >= 0 && n < total));
    d.unlocked = Math.max(0, Math.min(total - 1, Math.max(Number.isFinite(+d.unlocked) ? Math.floor(+d.unlocked) : 0, maxCleared + 1)));
    d.master = Number.isFinite(+d.master) ? Math.max(0, Math.min(1, +d.master)) : def.master;
    for (const k of ['sfxOn', 'voiceOn', 'bgmOn']) if (typeof d[k] !== 'boolean') d[k] = def[k];
    d.items = obj(d.items);
    for (const k of Object.keys(def.items)) {
      const n = Math.floor(+d.items[k]);
      d.items[k] = Number.isFinite(n) ? Math.max(0, Math.min(99, n)) : def.items[k];
    }
    d.plays = Number.isFinite(+d.plays) ? Math.max(0, Math.floor(+d.plays)) : 0;
    d.version = SAVE_VERSION;
  }

  get(name, def) { return name in this.data ? this.data[name] : def; }

  set(name, value) { this.data[name] = value; this.flush(); }

  flush() {
    try { this.backend.write(JSON.stringify(this.data)); } catch (err) { console.warn('[SaveSystem] 存档写入失败', err); }
  }

  isUnlocked(i) { return i <= this.data.unlocked; }
  isCleared(i) { return !!this.data.cleared[i]; }
  hasFragment(i) { return !!this.data.fragments[i]; }

  /** 通关：记碎片、解锁下一关。返回 { first, chapterComplete } */
  completeLevel(i, total, chapterSize = 10) {
    const first = !this.data.cleared[i];
    this.data.cleared[i] = true;
    this.data.fragments[i] = true;
    this.data.unlocked = Math.min(total - 1, Math.max(this.data.unlocked, i + 1));
    this.data.plays = (this.data.plays || 0) + 1;
    const ch = Math.floor(i / chapterSize);
    let all = true;
    for (let k = ch * chapterSize; k < (ch + 1) * chapterSize; k++) if (!this.data.fragments[k]) all = false;
    this.flush();
    return { first, chapterComplete: all };
  }

  fragmentsOf(chapterIdx, chapterSize = 10) {
    let n = 0;
    for (let k = chapterIdx * chapterSize; k < (chapterIdx + 1) * chapterSize; k++) if (this.data.fragments[k]) n++;
    return n;
  }

  item(k) { return this.data.items[k] || 0; }
  addItem(k, n = 1) { this.data.items[k] = Math.max(0, this.item(k) + n); this.flush(); }

  reset() {
    const keep = { master: this.data.master, sfxOn: this.data.sfxOn, voiceOn: this.data.voiceOn, bgmOn: this.data.bgmOn };
    this.data = { ...defaults(), ...keep };
    this.flush();
  }
}

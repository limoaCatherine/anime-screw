// 资源加载器：预加载图片并汇报进度。加载失败时生成占位图并给出警告，保证游戏可继续。
// 图片 / 画布由平台层创建 (网页 new Image / canvas，抖音 tt.createImage / tt.createCanvas)。
import { platform } from '../platform/index.js';
export class AssetLoader {
  constructor() {
    this.images = new Map();
  }

  getImage(key) {
    return this.images.get(key);
  }

  /**
   * @param {{key:string, src:string, color?:string, label?:string}[]} list
   * @param {(progress:number)=>void} onProgress
   */
  loadImages(list, onProgress = () => {}) {
    let done = 0;
    const total = list.length;
    if (total === 0) { onProgress(1); return Promise.resolve(); }
    return Promise.all(list.map((item) => new Promise((resolve) => {
      const img = platform.createImage();
      try { img.decoding = 'async'; } catch (_) { /* 抖音 Image 没有 decoding */ }
      img.onload = () => {
        this.images.set(item.key, img);
        onProgress(++done / total);
        resolve();
      };
      img.onerror = () => {
        console.warn(`[AssetLoader] 图片加载失败，使用占位图: ${item.src}`);
        this.images.set(item.key, AssetLoader.placeholder(item.color, item.label));
        onProgress(++done / total);
        resolve();
      };
      img.src = platform.assetPath(item.src);
    })));
  }

  static placeholder(color = '#ccc', label = '?') {
    const c = platform.createCanvas(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 72px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 128, 132);
    return c;
  }
}

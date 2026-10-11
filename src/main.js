// 入口：创建游戏实例并启动。画布 / 调试句柄由平台层提供 (网页: DOM；抖音: tt.createCanvas)。
import { Game } from './core/Game.js';
import { platform } from './platform/index.js';

function boot() {
  const game = new Game(platform.getMainCanvas());
  game.start();
  platform.expose(game);   // 调试 / 自动化测试用 (网页 window.__ANIME_SCREW__，抖音 GameGlobal.__ANIME_SCREW__)
}

if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

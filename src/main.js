// 入口：创建游戏实例并启动。
import { Game } from './core/Game.js';

function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  game.start();
  window.__ANIME_SCREW__ = game;   // 调试 / 自动化测试用
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

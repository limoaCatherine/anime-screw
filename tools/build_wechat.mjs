// 微信小游戏构建：npm run build:wechat → wechat/dist/ (交付时放在「微信小游戏」文件夹；实现见 tools/build_mini.mjs，与抖音版共用)
process.argv[2] = 'wechat';
await import('./build_mini.mjs');

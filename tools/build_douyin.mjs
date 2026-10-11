// 抖音小游戏构建：npm run build:douyin → douyin/dist/ (实现见 tools/build_mini.mjs，与微信版共用)
process.argv[2] = 'douyin';
await import('./build_mini.mjs');

// 平台适配层入口。玩法代码只从这里取平台能力 (画布 / 图片 / 时间 / 输入 / 生命周期 / 音频 / 分包 / 分享录屏 / 侧边栏)。
// 默认导出网页 / Electron 实现；抖音构建 (tools/build_douyin.mjs) 在打包时把 ./web/index.js 换成 ./douyin/index.js。
export { platform } from './web/index.js';

// Matter.js 以经典脚本 (vendor/matter.min.js) 方式加载，挂在 window.Matter 上。
// 这里统一导出，其他模块只从这里取 Matter，方便以后替换为 npm 打包方式。
const Matter = typeof window !== 'undefined' ? window.Matter : undefined;
if (!Matter) {
  throw new Error('Matter.js 未加载：请确认 vendor/matter.min.js 存在并在游戏脚本之前引入');
}
export default Matter;

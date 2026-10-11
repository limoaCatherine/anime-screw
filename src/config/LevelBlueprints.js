// 关卡蓝图 (手摆)：板子形状 / 层级 / 材质 / 螺丝位置 / 障碍。
// 两种写法：
//   { boards: [...] }  手摆 (前三关教学关，位置要精确)
//   { gen: {...} }     程序摆板参数：层数 / 钉帽数 / 形状与材质偏好 / 障碍数量，tools/design_levels.mjs 按种子摆出来，
//                      保证每块上层板都压住至少一颗下层螺丝。
// 螺丝颜色、盒子队列、参考解由 tools/design_levels.mjs 跑物理自动配出来，写进 LevelData.js。
// 层级 layer 越大越靠上。材质：oak 浅木 / walnut 深木 / copper 铜板 / steel 钢板 / acrylic 亚克力 / glass 彩窗玻璃
// 画框范围 x 28~512, y 262~856。
import { rect, plank, ngon, disc, trap, corners, along, ring, local, S } from './shapes.js';

const B = (mat, layer, v, s, extra = {}) => ({ mat, layer, v, s, ...extra });

// 各章的形状 / 材质偏好
const CH1 = { shapes: ['plank', 'plank', 'rect', 'trap', 'hex'], mats: ['oak', 'walnut', 'copper'], baseMats: ['oak', 'walnut'], tints: ['#ffd9a8', '#b9e3ff'] };
const CH2 = { shapes: ['rect', 'hex', 'disc', 'plank', 'trap', 'pent'], mats: ['acrylic', 'acrylic', 'oak', 'walnut', 'copper'], baseMats: ['oak', 'walnut'], tints: ['#ffb3d1', '#bfe8c9', '#ffe39a', '#c9d4ff'], glass: 0.22 };
const CH3 = { shapes: ['rect', 'plank', 'disc', 'ticket', 'hex'], mats: ['steel', 'steel', 'acrylic', 'copper', 'walnut'], baseMats: ['steel', 'walnut'], tints: ['#ffd27a', '#9fd8ff', '#ffb3d1'], glass: 0.12 };
/** 程序摆板：层数、钉帽总数 (含双层与挂绳钉)、其他参数 */
const G = (style, layers, screws, o = {}) => ({ gen: { ...style, layers, screws, ...o, ob: o.ob || {} } });


export const BLUEPRINTS = [
  // ======================== 第一间 · 雨后的屋顶 ========================
  { // 1-1 晾衣绳
    boards: [
      B('oak', 0, rect(270, 600, 330, 220), corners(270, 600, 330, 220, 0, 28)),
      B('walnut', 1, plank(110, 522, 430, 522, 58), along(200, 522, 340, 522, 2)),
    ],
  },
  { // 1-2 一角报纸
    boards: [
      B('oak', 0, rect(270, 590, 400, 300), [...corners(270, 590, 400, 300, 0, 30), [270, 590]]),
      B('copper', 1, rect(178, 482, 176, 118, -0.12), local(178, 482, -0.12, [[-30, 0], [56, 0]])),
      B('walnut', 1, rect(366, 700, 186, 108, 0.1), local(366, 700, 0.1, [[-56, 0], [30, 0]])),
    ],
  },
  { // 1-3 晾着的衬衫
    boards: [
      B('oak', 0, rect(270, 612, 420, 340), corners(270, 612, 420, 340, 0, 30)),
      B('copper', 1, rect(270, 560, 250, 150), corners(270, 560, 250, 150, 0, 28)),
      B('walnut', 2, rect(146, 716, 150, 96, 0.22), local(146, 716, 0.22, [[-44, 0], [44, 0]])),
      B('walnut', 2, rect(398, 440, 156, 96, -0.18), local(398, 440, -0.18, [[-46, 0], [46, 0]])),
    ],
  },
  // 1-4 起：程序摆板
  G(CH1, 3, 12, { cover: 0.3 }),                                   // 1-4 瓦片
  G(CH1, 3, 15, { cover: 0.35 }),                                  // 1-5 积水里的天
  G(CH1, 3, 15, { cover: 0.35, glass: 0.5 }),                      // 1-6 天窗 (玻璃板)
  G(CH1, 3, 15, { cover: 0.25, glass: 0.15 }),                     // 1-7 屋檐下的猫 (放松)
  G(CH1, 4, 18, { cover: 0.35, glass: 0.15 }),                     // 1-8 送报的自行车
  G(CH1, 4, 18, { cover: 0.4, glass: 0.15 }),                      // 1-9 烟囱
  G(CH1, 4, 21, { cover: 0.4, glass: 0.2 }),                       // 1-10 全图
  // ======================== 第二间 · 温室 ========================
  G(CH2, 3, 15, { cover: 0.3, glass: 0, ob: { chain: 1 } }),       // 2-1 门口的长椅 (锁链，单独教)
  G(CH2, 4, 18, { cover: 0.35 }),                                  // 2-2 一排小苗
  G(CH2, 4, 18, { cover: 0.35, glass: 0, ob: { frost: 2 } }),      // 2-3 裂了口的花盆 (冰冻，单独教)
  G(CH2, 4, 21, { cover: 0.4, ob: { frost: 2, chain: 1 } }),       // 2-4 喷壶
  G(CH2, 4, 21, { cover: 0.45, ob: { chain: 1, frost: 1 } }),      // 2-5 蔓上来的藤 (难关)
  G(CH2, 3, 15, { cover: 0.25 }),                                  // 2-6 午后的光 (放松)
  G(CH2, 4, 21, { cover: 0.35, ob: { lock: 1 } }),                 // 2-7 给花换盆 (钥匙锁)
  G(CH2, 4, 21, { cover: 0.4, ob: { lock: 1, frost: 1 } }),        // 2-8 花剪
  G(CH2, 5, 24, { cover: 0.4, ob: { chain: 1, frost: 2 } }),       // 2-9 雾气 (锁链 + 冰冻)
  G(CH2, 5, 24, { cover: 0.45, ob: { chain: 1, frost: 1, lock: 1 } }), // 2-10 全图
  // ======================== 第三间 · 夜班电车 ========================
  G(CH3, 4, 18, { cover: 0.35, glass: 0, ob: { bomb: 1 } }),       // 3-1 末班车 (炸弹，单独教)
  G(CH3, 4, 21, { cover: 0.35, glass: 0, ob: { hidden: 3 } }),     // 3-2 车票 (隐色，单独教)
  G(CH3, 5, 24, { cover: 0.4, ob: { bomb: 1, hidden: 2 } }),       // 3-3 窗外的灯
  G(CH3, 5, 24, { cover: 0.4, glass: 0, ropes: 2 }),               // 3-4 吊着的广告牌 (绳吊板，单独教)
  G(CH3, 5, 27, { cover: 0.45, ob: { bomb: 2, lock: 1 } }),        // 3-5 吊环 (难关：炸弹 + 钥匙锁)
  G(CH3, 4, 21, { cover: 0.3, ob: { hidden: 1 } }),                // 3-6 打瞌睡 (放松)
  G(CH3, 5, 27, { cover: 0.4, glass: 0, doubles: 3 }),             // 3-7 票夹 (双层螺丝，单独教)
  G(CH3, 5, 27, { cover: 0.45, doubles: 2, ropes: 1, ob: { frost: 1 } }), // 3-8 对面的车
  G(CH3, 6, 30, { cover: 0.45, doubles: 2, ropes: 1, ob: { chain: 1, frost: 1, lock: 1, bomb: 1, hidden: 2 } }), // 3-9 难关：全机制
  G(CH3, 5, 27, { cover: 0.4, doubles: 1, ropes: 1, ob: { hidden: 1, chain: 1 } }), // 3-10 全图
];

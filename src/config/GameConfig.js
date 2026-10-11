// 全局游戏参数：画面尺寸、界面布局、物理、配色、广告位等。
// 想调手感，优先改这里；关卡与难度分别在 LevelConfig.js / DifficultyConfig.js。
export const GameConfig = {
  title: '拆封绘卷',
  subtitle: 'AnimeScrew',
  version: '1.1.0',
  levelCount: 30,

  // 逻辑分辨率 (9:16 竖屏)，实际显示按窗口等比缩放
  width: 540,
  height: 960,

  // 界面布局 (逻辑像素)
  layout: {
    topBar: 58,
    boxY: 128,          // 收纳盒中心 y
    boxW: 142,
    boxH: 88,
    boxArea: { left: 16, right: 438 },   // 收纳盒所在区域 (右侧留给"下一个")
    nextX: 488,          // "下一个"预览列中心 x
    holeY: 224,          // 临时孔中心 y
    holeGap: 58,
    holeR: 21,
    frame: { left: 28, top: 262, right: 512, bottom: 856 },  // 画框 (板子区域)
    itemY: 908,
    subtitleY: 892,        // 台词气泡 (压在道具栏上，不挡画框)
  },

  screw: {
    radius: 15,          // 钉帽绘制半径
    hitRadius: 25,       // 点击判定半径
    coverRadius: 12.5,   // 遮挡判定半径 (钉帽视为圆)
    minGap: 34,          // 两颗螺丝之间的最小距离 (关卡校验)
    edgeInset: 15,       // 螺丝中心到板边的最小距离 (关卡校验)
  },

  physics: {
    gravityY: 1.25,
    timestep: 1000 / 60,
    maxSubSteps: 5,
    positionIterations: 10,
    velocityIterations: 8,
    constraintIterations: 4,
    frictionAir: 0.032,    // 板子空气阻力：单钉下垂时晃两三下就停
    density: 0.0015,
    pinStiffness: 1,
    pinDamping: 0.05,
    ropeStiffness: 0.92,
    goneY: 1180,           // 板子落到这条线以下就移除
    fallTimeout: 240,      // 拧光的板子最多掉 4 秒 (240 步)，还没出屏就强制移除
    stableTimeout: 5,      // 判负前等板子停稳最多等几秒 (一直微微晃也照样判)
    impactY: 990,          // 板子越过这条线时播放"落地"声
    settleSpeed: 0.06,     // 速度低于该值视为静止
    settleAngular: 0.0016,
  },

  frostRadius: 128,        // 冰冻螺丝：这个范围内每拧下一颗，霜 -1
  comboWindow: 1.2,        // 连续收纳的连击窗口 (秒)，对齐音频策划 9.4

  // 螺丝颜色 = 角色应援色；收纳盒盖上是对应角色的小头像
  screwColors: {
    sky:    { hex: '#3fa9f5', light: '#a8dcff', dark: '#1d6fb3', name: '天蓝', char: 'girl_02', emblem: 'drop' },
    pink:   { hex: '#ff6fa6', light: '#ffc2da', dark: '#c63a73', name: '樱粉', char: 'girl_04', emblem: 'petal' },
    amber:  { hex: '#f4a524', light: '#ffe0a0', dark: '#b06e05', name: '琥珀', char: 'girl_03', emblem: 'ticket' },
    green:  { hex: '#2fae74', light: '#a6e9c8', dark: '#16714a', name: '墨绿', char: 'girl_01', emblem: 'gear' },
    violet: { hex: '#9a6cf0', light: '#d6c4ff', dark: '#5f3db8', name: '藤紫', char: 'girl_06', emblem: 'star' },
    red:    { hex: '#e8483f', light: '#ffb3ad', dark: '#a52219', name: '朱红', char: 'girl_07', emblem: 'knot' },
  },
  colorOrder: ['sky', 'pink', 'amber', 'green', 'violet', 'red'],

  // 道具：单局上限 + 新手初始库存 + 第几关解锁
  items: {
    undo:        { name: '退一步', perLevel: 3, start: 2, unlock: 1 },
    addHole:     { name: '加孔',   perLevel: 2, start: 1, unlock: 1 },
    screwdriver: { name: '螺丝刀', perLevel: 2, start: 0, unlock: 8 },
    hammer:      { name: '小锤',   perLevel: 1, start: 1, unlock: 12 },
    shuffle:     { name: '换盒',   perLevel: 1, start: 1, unlock: 15 },
  },
  itemOrder: ['undo', 'addHole', 'screwdriver', 'hammer', 'shuffle'],
  revivesPerLevel: 2,
  reviveClearHoles: 2,      // 复活时顺手收走临时孔里最早的 2 颗
  bombReviveSteps: 5,       // 炸弹失败复活：所有引信 +5 步

  ads: {
    // 抖音激励视频广告位 ID。填上就走 tt.createRewardedVideoAd；留空则用 5 秒占位倒计时
    douyinRewardedAdUnitId: '',
    placeholderSeconds: 5,
  },

  fontFamily: '"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC",sans-serif',
  serifFamily: '"Songti SC","STSong","Noto Serif CJK SC","Noto Serif SC","SimSun",serif',

  colors: {
    bgTop: '#f3e6d3',
    bgBottom: '#d9c4a6',
    wall: '#5b4636',
    copper: '#c27a45',
    copperDark: '#8a4f27',
    ink: '#3d2b20',
    inkLight: '#7a6250',
    paper: '#fbf4e6',
    green: '#2f5d4a',
    greenLight: '#4f8a6f',
    accent: '#d9673b',
    danger: '#d8453b',
    panel: 'rgba(251,244,230,0.97)',
  },

  storageKey: 'animeScrew.save.v1',
};

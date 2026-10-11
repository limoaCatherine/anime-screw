// 关卡配置：章节、每关的名字/台词/提示 + 生成好的关卡数据 (LevelData.js) + 难度参数 (DifficultyConfig.js)。
// 关卡名格式："画名 · 序号 · 小标题"。所有关卡/难度差异都在这里和 DifficultyConfig 里，系统代码里没有按关卡写的分支。
import { LEVEL_DATA } from './LevelData.js';
import { DIFFICULTY } from './DifficultyConfig.js';

export const CHAPTERS = [
  {
    id: 1, title: '雨后的屋顶', char: 'xm', cg: 'cg_1', bgm: 'roof', theme: { wall: '#7d6a7f', frame: '#6b4a3a', glow: '#ffd7b0' },
    story: '雨刚停，屋顶的积水里有半个夕阳。小满说她每天这个时候都上来，看晾着的衣服什么时候干。其实她是在等那辆送报的自行车。',
  },
  {
    id: 2, title: '温室', char: 'suzhi', cg: 'cg_2', bgm: 'greenhouse', theme: { wall: '#5f7a5f', frame: '#5b4a33', glow: '#fff3c8' },
    story: '温室里一年四季都是春天。苏枝记得每一盆花是哪天种下的，却总记不住花剪放在哪儿。',
  },
  {
    id: 3, title: '夜班电车', char: 'aheng', cg: 'cg_3', bgm: 'tram', theme: { wall: '#3c4266', frame: '#3f3a4a', glow: '#ffd29a' },
    story: '末班车上只剩两个人。阿蘅抱着一本没看完的书，窗外的灯一盏一盏往后退。她说下一站是终点，可她不太想下车。',
  },
];

// 每关：小标题 / 谁开口 / 开场一句 (中文气泡) / 开场语音 (可选) / 新机制提示 (可选)
const META = [
  // 第一章 雨后的屋顶
  { sub: '晾衣绳', who: 'riri', say: '我是铆铆，修画的。这幅画被人钉了好多板子，我们一块块拆下来。', voice: 'riri_hello', tip: 'basic' },
  { sub: '一角报纸', who: 'xm', say: '诶，你就是来拆画的人？太好了，我在这儿等好久了！', voice: 'xm_hello', tip: 'holes' },
  { sub: '晾着的衬衫', who: 'xm', say: '衬衫还没干呢……先不管它，拆！' },
  { sub: '瓦片', who: 'riri', say: '上面压着的板子先拆，下面的螺丝才露得出来。', voice: 'riri_tip', tip: 'cover' },
  { sub: '积水里的天', who: 'xm', say: '屋顶的积水里能看到天。你低头看过吗？', voice: 'xm_start' },
  { sub: '天窗', who: 'xm', say: '这块是玻璃，看得到下面，可还是拧不到哦。', tip: 'glass' },
  { sub: '屋檐下的猫', who: 'xm', say: '屋檐下老有只猫躲雨，我管它叫馒头。' },
  { sub: '送报的自行车', who: 'xm', say: '每天早上那辆自行车都按两下铃，叮叮。', tip: 'screwdriver' },
  { sub: '烟囱', who: 'xm', say: '快了快了，我都能看见自己的头发了！' },
  { sub: '全图', who: 'xm', say: '最后一块！拆完就能看清整幅画了。' },
  // 第二章 温室
  { sub: '门口的长椅', who: 'suzhi', say: '欢迎来温室。门口那张长椅，是我最喜欢的位置。', voice: 'suzhi_hello', tip: 'chain' },
  { sub: '一排小苗', who: 'suzhi', say: '这排小苗上个月才种的，长得比我想的快。', tip: 'hammer' },
  { sub: '裂了口的花盆', who: 'suzhi', say: '有几颗螺丝冻住了。在它旁边多拧几颗，冰自己会裂开。', voice: 'suzhi_start', tip: 'frost' },
  { sub: '喷壶', who: 'suzhi', say: '喷壶别灌太满，会洒一路。' },
  { sub: '蔓上来的藤', who: 'suzhi', say: '藤蔓爬得到处都是，跟这些链子一样难缠。', tip: 'shuffle' },
  { sub: '午后的光', who: 'suzhi', say: '歇一会儿吧，这块简单点。' },
  { sub: '给花换盆', who: 'suzhi', say: '这块板上了锁，钥匙钉在别的板子上，找找看。', tip: 'lock' },
  { sub: '花剪', who: 'suzhi', say: '花剪用完要放回去，不然我又得找半天。' },
  { sub: '雾气', who: 'suzhi', say: '玻璃起雾了，看不太清，你慢慢来。' },
  { sub: '全图', who: 'suzhi', say: '最后一块了。拆完我请你喝茶。' },
  // 第三章 夜班电车
  { sub: '末班车', who: 'aheng', say: '……那个，有颗螺丝在冒烟。上面的数字，是还剩几步。', voice: 'aheng_hello', tip: 'bomb' },
  { sub: '车票', who: 'aheng', say: '车票上的字被磨掉了。有几颗螺丝也是，看不出颜色。', tip: 'hidden' },
  { sub: '窗外的灯', who: 'aheng', say: '窗外的灯，一盏一盏往后跑。', voice: 'aheng_start' },
  { sub: '吊着的广告牌', who: 'aheng', say: '广告牌是拿绳子吊着的。挂钉一拧，整块连螺丝一起掉下来。', tip: 'rope' },
  { sub: '空座位', who: 'aheng', say: '车上本来就剩我一个人。……现在多了你。' },
  { sub: '打瞌睡', who: 'aheng', say: '刚才差点睡着，坐过站就麻烦了。' },
  { sub: '吊环', who: 'aheng', say: '有些螺丝是两层的，得拧两回。', tip: 'double' },
  { sub: '对面的车', who: 'aheng', say: '对面那辆车，也是空的。' },
  { sub: '前一站', who: 'aheng', say: '还有一站。……其实我不太想下车。' },
  { sub: '全图', who: 'aheng', say: '最后一块了。谢谢你，一路陪我坐到这里。' },
];

// 新机制 / 新道具的提示卡 (第一次遇到时弹出)
export const TIPS = {
  basic: { title: '怎么拆', text: '点一颗螺丝，它会自己飞进同色的盒子。\n一块板上的螺丝拧光，板子就掉下去了。', icon: 'screw' },
  holes: { title: '临时孔', text: '颜色对不上的螺丝，先放进下面的临时孔。\n来了同色的盒子，会自己飞过去。孔满了就卡住了。', icon: 'hole' },
  cover: { title: '被压住的螺丝', text: '被别的板子压着的螺丝拧不动。\n先拆上面那块。', icon: 'cover' },
  glass: { title: '玻璃板', text: '玻璃看得见底下的螺丝，\n但一样压着它们。', icon: 'glass' },
  chain: { title: '锁链', text: '被链子拴住的两颗螺丝拧不动。\n先拧掉挂锁那颗，链子就开了。', icon: 'chain' },
  frost: { title: '冰冻', text: '冻住的螺丝拧不动。\n在它附近拧掉别的螺丝，冰会一层层裂开。', icon: 'frost' },
  lock: { title: '钥匙锁', text: '上了锁的板子，螺丝都拧不动。\n把钥匙钉收进盒子锁就开（放进临时孔不算）。', icon: 'lock' },
  bomb: { title: '炸弹', text: '炸弹螺丝上的数字是还剩几步，\n每拧一下少一步。到 0 之前把它拧掉。', icon: 'bomb' },
  hidden: { title: '看不清的螺丝', text: '带问号的螺丝看不出颜色，\n拧下来才知道是什么色。', icon: 'hidden' },
  rope: { title: '吊着的板', text: '这块板拿绳子吊在挂钉上。拧掉挂钉，\n整块板连同上面的螺丝一起收走，孔要留够。', icon: 'rope' },
  double: { title: '双层螺丝', text: '双层螺丝要拧两次：\n先是外面那层颜色，再是里面那层。', icon: 'double' },
  screwdriver: { title: '新道具：螺丝刀', text: '用螺丝刀点一颗螺丝，\n压着、冻着、锁着都能直接拧下来。', icon: 'screwdriver' },
  hammer: { title: '新道具：小锤', text: '用小锤点一块板，整块敲碎，\n上面的螺丝全部收走。', icon: 'hammer' },
  shuffle: { title: '新道具：换盒', text: '盒子颜色不合适？\n换一批，优先换成你现在拧得到的颜色。', icon: 'shuffle' },
};

export const LEVELS = LEVEL_DATA.map((data, i) => {
  const chapter = CHAPTERS[Math.floor(i / 10)];
  const no = (i % 10) + 1;
  const meta = META[i];
  return {
    ...data,
    index: i,
    chapter: chapter.id,
    no,
    sub: meta.sub,
    name: `${chapter.title} · ${no} · ${meta.sub}`,
    who: meta.who,
    say: meta.say,
    voice: meta.voice || null,
    tip: meta.tip || null,
    fragment: no - 1,                       // 这关拆出来的是这幅画的第几块 (2 列 × 5 行)
    thirdBox: !!(DIFFICULTY[i] && DIFFICULTY[i].thirdBox),
  };
});

export const FRAGMENT_GRID = { cols: 2, rows: 5 };

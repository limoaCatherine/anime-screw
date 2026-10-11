# 拆封绘卷 AnimeScrew

二次元拧螺丝解谜小游戏。画框里的插画被一层层木板、铜板、亚克力板钉住了，点螺丝把板子拆下来，最底下露出这一关的那块插画碎片；一幅画 10 块，拼齐了收进画册。

- 纯 Canvas 2D + 原生 ES 模块，物理用 Matter.js 0.19 (vendor/matter.min.js)
- `npm run build` → `dist/index.html`，双击就能玩 (file:// 下可运行，不需要服务器)
- 竖屏 540×960 逻辑分辨率，手机优先，桌面浏览器 / Electron 桌面版同样能玩
- 抖音小游戏：在 `GameConfig.ads.douyinRewardedAdUnitId` 填上激励视频广告位后，`AdService` 自动改走 `tt.createRewardedVideoAd`；没填就是 5 秒占位倒计时

## 玩法

| | |
|---|---|
| 拧螺丝 | 点露在最上面的螺丝。它会飞进同色收纳盒 (同时 2 个盒子，每个 3 格)；没有同色盒子就进临时孔 (5 个) |
| 收纳盒 | 装满 3 颗就合上换下一个；新盒子来了，临时孔里同色的螺丝会自己飞进去 |
| 物理 | 每颗螺丝是一个 Matter 约束；板上只剩 1 颗时板子绕它晃，0 颗时掉出画面 |
| 失败 | 临时孔满了，并且再拧哪颗都放不下 (或者一颗都拧不了) |
| 画册 | 每关最底下是插画的一块碎片，过关揭开，收进画册；一章 10 块拼齐整幅 |

### 障碍

| 障碍 | 首次出现 | 规则 |
|---|---|---|
| 玻璃 | 1-6 | 透明板子，看得见下面的螺丝但照样挡着 |
| 锁链 | 2-1 | 链子两头的螺丝被锁住，拧掉挂锁那颗 (链子中间的锁螺丝) 链子就断 |
| 冰冻 | 2-3 | 螺丝外面一层冰，旁边每拧掉一颗就裂一点，数字归零才能拧 |
| 钥匙锁 | 2-7 | 板子上挂着锁，同色钥匙螺丝进了收纳盒才开 |
| 炸弹 | 3-1 | 倒计时螺丝，每拧一步减 1，归零就输 (可以看广告续 5 步) |
| 隐色 | 3-2 | 灰色问号螺丝，拧下来才知道是什么颜色 |
| 绳吊 | 3-4 | 板子用绳子挂在一颗挂钉上，挂钉一拧，整块板连同上面的螺丝一起掉下来进收纳区 |
| 双层 (加分项) | 3-7 | 一颗螺丝两层钉帽，外层颜色先拧，里面还有一颗 |

### 道具 (每关每种限用次数见 GameConfig.items)

退一步 (1 关起) · 加孔 (1 关起) · 螺丝刀 (8 关起，无视遮挡直接拧一颗) · 小锤 (12 关起，敲碎任意一块板子，上面的螺丝一起收进盒子或临时孔，放不下就不让敲) · 换盒 (15 关起，盒子还空着时，按场上露出来的螺丝和临时孔里的颜色重新换盒)。用完了可以看激励广告拿一次；失败时可以看广告复活 (清出 2 个临时孔)。

## 目录

```
src/
  main.js              入口
  core/                Game (服务装配 / 主循环 / 弹窗栈 / toast)、SceneManager、Scene、EventBus、AssetLoader
  config/              GameConfig 布局与参数、LevelConfig 章节与关卡文字、LevelData 30 关数据 (生成)、
                       LevelBlueprints 关卡蓝图、DifficultyConfig 难度曲线、AudioConfig、VoiceConfig、shapes
  systems/             规则：PuzzleSystem / BoardSystem / BoxSystem / ObstacleSystem / PhysicsSystem (Matter 封装)
                       运行时：AudioSystem (WebAudio 合成音效) / BgmSystem / VoiceSystem / SubtitleSystem /
                       EffectSystem / SaveSystem / AdService / ShareService / InputSystem
  render/              BoardArt (材质贴图缓存) / ScrewArt / TrayView (盒子与飞行动画) / CGView
  scenes/              Boot / Menu / LevelSelect / Game / Gallery
  ui/                  Button / Icons / Panels (设置、制作人员、提示卡、广告占位) / draw
assets/                images/chars 角色立绘、images/cg 三幅插画、audio/voice 语音、audio/bgm 背景音乐、icons
desktop/               Electron 外壳 main.js + preload.js
tools/                 构建、关卡生成与校验、测试、素材生成脚本
vendor/matter.min.js
```

关卡和难度只在 `src/config/` 里改；系统代码里没有按关卡写死的分支。

## 命令

| 命令 | 作用 |
|---|---|
| `npm install` | 装开发依赖 (esbuild / electron / playwright / @electron/packager / resedit) |
| `npm run build` | 打包到 `dist/` |
| `npm run serve` | 本地起个服务器调试 (http://localhost:8766) |
| `npm run levels` | 根据蓝图和难度曲线重新生成 `LevelData.js` |
| `npm run verify` | Node 里无头跑 Matter，验证每关都能解开、板子会正常掉落，写出 `docs/verify_report.txt` |
| `npm test` | Playwright 冒烟测试：打开 dist/index.html，鼠标点完第 1 关，截图到 /workspace/AnimeScrew_shots |
| `npm run test:play` | 浏览器里把 30 关按参考解全部打一遍，顺带试 5 个道具 |
| `npm run desktop` | 用 Electron 直接跑桌面版 |
| `npm run pack:win` | 打 Windows x64 桌面版 → `release/拆封绘卷/拆封绘卷.exe` (Linux 上也能打，不需要 wine) |
| `npm run pack:linux` + `npm run test:desktop` | 打 Linux 版并自动测试桌面外壳 (存档路径、9:16、无菜单等) |
| `npm run voices` | 用本机 VOICEVOX 引擎 (127.0.0.1:50021) 重新生成台词并做 -20 LUFS 响度统一 |
| `npm run bgm` / `art` / `icons` | 重新生成背景音乐 / 插画 / 图标 |

## 声音规范

- 响度：语音 -20 LUFS，BGM -22 LUFS (ffmpeg loudnorm / EBU R128 校准)
- 默认音量：语音 0.3、音效 0.12、BGM 0.15，设置里有总音量滑杆和三个开关
- 说话时 BGM 压到 ×0.55 (150 ms 压下 / 400 ms 回升)
- 台词：同时只说一句，0.6 s 冷却，高优先级打断低优先级，低优先级直接丢弃不排队；每个角色每关最多 2 句
- 音效全部 WebAudio 实时合成：拧出 (3 段 2–4 kHz 带通噪声 + 一声"啵")、拧不动"咔"、进盒五声音阶连击 (1.2 s 窗口内递升，5 连后升八度，最多 10 级)、进孔空心回声、盒满合盖 + 琶音、板子落地按材质 (多块同时落地合并)、揭开插画粉噪声扫频；随机音高、同一音效 60 ms 限频、每帧每类最多 2 个

## 存档

- 桌面版：`%APPDATA%\AnimeScrew\save.json` (preload 暴露 `window.desktopSave`，先写临时文件再改名)
- 抖音：`tt.setStorageSync`；浏览器：`localStorage`；都不可用时只存内存

## 制作人员

角色语音：VOICEVOX:猫使ビィ (铆铆)、VOICEVOX:春日部つむぎ (小满)、VOICEVOX:東北きりたん (苏枝)、VOICEVOX:冥鳴ひまり (阿蘅)。
角色立绘沿用《美少女合成》原创素材；背景音乐、插画背景、音效均为程序生成的原创内容。
Matter.js (MIT)、Electron (MIT)。出品：上海盖姆艾尔网络科技有限公司。

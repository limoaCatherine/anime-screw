# 《拆封绘卷》抖音小游戏工程

出品：狸猫 · v1.2.0

- 源码与网页版、桌面版共用 `src/`。平台差异在 `src/platform/douyin/`。
- 构建：在仓库根目录运行 `npm run build:douyin`，输出到 `douyin/dist/`。这个目录可以直接用抖音开发者工具导入。
- 配置：只有 `douyin.config.json` 一个文件，构建后在 `dist/game-config.js`。里面有：
  - `appid`：抖音开放平台 → 小游戏 → 开发设置 里的 AppID；
  - `rewardedAdUnitId`：激励视频广告位 ID。保持 `YOUR_` 开头或留空，就是首发版没有广告：看广告的按钮全部隐藏，改成免费「再试一次」和每日免费道具；
  - `shareTemplateId`：可选。

## dist/ 结构

| 路径 | 说明 |
|---|---|
| `game.js` | 入口：读 game-config.js、bgm-loops.js，再加载 js/main.js |
| `game.json` | 竖屏、隐藏状态栏、三个分包 |
| `project.config.json` | 开发者工具工程配置 (appid 与 game-config.js 一致) |
| `game-config.js` | **唯一要改的文件**：appid、广告位 ID |
| `bgm-loops.js` | 自动生成，循环曲的垫片信息，不要改 |
| `js/main.js` | 游戏代码，已打入 Matter.js；ES2017 |
| `assets/images/chars/` | 角色头像，用 pngquant 压缩 |
| `assets/sfx/` | 49 个预渲染音效 mp3 |
| `licenses/` | VOICEVOX 各角色规约、引擎许可、Matter.js 许可 |
| `sub_voice/` | 分包：语音 mp3，单声道 64k |
| `sub_bgm/` | 分包：音乐 mp3，96k。循环曲带首尾垫片，播放时由 LoopTrack 两路接力，循环点没有空白 |
| `sub_cg/` | 分包：插画 jpg |

包体和音频审计见 `douyin/size-report.txt`，BGM 无缝循环检查见 `douyin/bgm-loop-report.txt`，模拟环境测试结果见 `douyin/harness-report.txt`。

## 用到的 tt 接口

每个接口都已对照抖音开放平台官方文档核对过：

- 画布与图片：createCanvas、createImage；
- 系统与布局：getSystemInfoSync (safeArea、pixelRatio)、getMenuButtonLayout；
- 触摸：onTouchStart、onTouchMove、onTouchEnd、onTouchCancel；
- 存档：getStorageSync、setStorageSync；
- 音频：createInnerAudioContext；
- 分包：loadSubpackage；
- 广告：createRewardedVideoAd；
- 录屏与分享：getGameRecorderManager、shareAppMessage (channel: video)；
- 侧边栏复访：checkScene、navigateToScene，加上 onShow 里的 launch_from 和 location；
- 前后台与启动：onShow、onHide、getLaunchOptionsSync。

上架流程见 `docs/抖音上架说明.md`。

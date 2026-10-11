# 《拆封绘卷》微信小游戏工程

出品：狸猫 · v1.2.0

- 源码与网页版、桌面版、抖音版共用 `src/`。
  - 微信的平台差异在 `src/platform/wechat/`。
  - 和抖音共用的部分（InnerAudioContext 封装、Matter.js 打包）在 `src/platform/mini/`。
- 构建：在仓库根目录运行 `npm run build:wechat`，输出到 `wechat/dist/`。
  - 交付时这个目录放在 `拆封绘卷\微信小游戏\`，可以直接用微信开发者工具「导入」。
  - 构建脚本 `tools/build_mini.mjs` 与抖音版共用。
- 配置：只有 `wechat.config.json` 一个文件，构建后会生成 `dist/game-config.js` 和 `dist/project.config.json`。里面有：
  - `appid`：MP 后台「开发 → 开发管理 → 开发设置」里的 AppID；
  - `rewardedAdUnitId`：激励视频广告位 ID。保持 `YOUR_` 开头或留空，就是首发无广告版（免费「再试一次」和每日免费道具）；
  - `shareTitle`、`shareImageUrlId`：转发卡片的标题，以及 MP 后台审核通过的转发图片编号（可选）。

## dist/ 结构

| 路径 | 说明 |
|---|---|
| `game.js` | 入口：读 game-config.js、bgm-loops.js，再加载 js/main.js |
| `game.json` | `deviceOrientation: portrait`、`showStatusBar: false`、`subpackages` 三个普通分包 |
| `project.config.json` | `compileType: minigame`（官方文档列出的有效值），appid 占位 `YOUR_APPID` |
| `game-config.js` | **唯一要改的文件**：广告位 ID、转发文案 |
| `bgm-loops.js` | 自动生成，循环曲的垫片信息，不要改 |
| `js/main.js` | 游戏代码，已打入 Matter.js；ES2017 |
| `assets/images/chars/` | 角色头像 |
| `assets/sfx/` | 49 个预渲染音效 mp3 |
| `assets/share.jpg` | 转发卡片图，500×400（官方要求 5:4） |
| `licenses/` | VOICEVOX 各角色规约、引擎许可、Matter.js 许可 |
| `sub_voice/` | 分包：语音 |
| `sub_bgm/` | 分包：音乐（LoopTrack 无缝循环） |
| `sub_cg/` | 分包：插画 |

报告：

- 包体与音频审计：`size-report.txt`。主包 1.02 MB（上限 4 MB），整包 5.44 MB（上限 30 MB）。
- BGM 循环检查：`bgm-loop-report.txt`。
- 模拟环境测试：`harness-report.txt`，16/16 通过。

## 用到的 wx 接口

均已对照 developers.weixin.qq.com/minigame/dev/api 核对：

- createCanvas、createImage；
- onTouchStart / onTouchMove / onTouchEnd / onTouchCancel；
- getWindowInfo（低版本退回 getSystemInfoSync）、getMenuButtonBoundingClientRect；
- getStorageSync、setStorageSync；
- createInnerAudioContext；
- loadSubpackage；
- createRewardedVideoAd（onClose 的 isEnded）；
- showShareMenu、onShareAppMessage、shareAppMessage；
- onShow、onHide、getLaunchOptionsSync。

抖音专有的侧边栏复访和录屏分享，在微信版里不提供，对应按钮会自动隐藏。

上架步骤见 `docs/微信上架说明.md`。

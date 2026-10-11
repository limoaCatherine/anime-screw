# v1.2 进度记录
## 任务
1 出品改「出品：狸猫」+ licenses  2 抖音小游戏构建  3 上架说明/隐私/商店素材  4 v1.2.0 打包测试交付
## 进度
- 15:06 开始
- 15:20 出品改狸猫 (标题/制作人员/README/版本说明/package.json/exe 版本信息/appId)；docs/licenses 完成 (4 角色规约全文+引擎规约/LGPL+MIT)，打包时复制到 exe 旁 licenses/
- 16:00 抖音 API 已核对官方文档 (playwright 渲染 developer.open-douyin.com，存于 /tmp/dy)：navigateToScene/checkScene(sidebar, isExist)、onShow(launch_from=homepage, location=sidebar_card)、Touch(identifier, screenX/screenY)、createInnerAudioContext/InnerAudioContext、GameRecorderManager.start(duration 3~300s)/onStop(videoPath)、shareAppMessage(channel:'video', extra.videoPath)、RewardedVideoAd.onClose(isEnded,count)/show()Promise、getPerformance().now()=微秒、loadSubpackage(name)
- 平台层 src/platform/{web,douyin} 完成；Game/Input/AssetLoader/Bgm/Voice/Audio/Share/Ad/Boot 改为走平台层；AudioSystem 拆出 attach()/synth()，抖音用预渲染 mp3 池
- tools/render_sfx.mjs：49 个音效 → assets/sfx (233 KB)；tools/build_douyin.mjs → douyin/dist (主包 0.98MB / voice 0.43 / bgm 3.52 / cg 0.41 / 整包 5.34MB)
- tools/test_douyin.mjs + tools/lib/tt-mock.js：14 项全过 (触摸玩通第 1 关、录屏分享、激励视频、侧边栏领奖、onHide/onShow、分包、存档)
- 15:30 必接能力页确认：侧边栏复访必接（已接）；客服仅内购必接、敏感词仅自由输入必接 → 本作不涉及。基础信息审核规范：名称 4-20 字符、简介 10-60、详细介绍 120-300、图标无圆角/角标。
- 15:32 写完 docs/抖音上架说明.md、docs/store/{商店简介.md,隐私协议.md,icon_512.png,5 张竖屏截图}。
- 15:40 [steer] 铆铆配音 猫使ビィ → 四国めたん (zunko.jp 音源ガイドライン：商用/非商用、个人/法人均可，署名即可，无事先联络)；6 句重合成 (同情绪参数，styles: あまあま/ツンツン/ノーマル)；修 generate_voices styleId 0 被 || 吞掉的 bug；licenses 换文件、README 写企业商用核对 (つむぎ 已直接从官方页取规约，ひまり 明写法人可用无需申请)。
- 15:45 [steer] 无广告位首发：AdService.enabled=false 时隐藏所有看广告入口；失败面板每关 1 次免费「再试一次」；道具用完每天每种免费领 1 个；第三盒位不出现。smoke 新增 6 项检查全过；devPlaceholder 仅测试用。
- 15:50 [steer] 抖音包音频全 mp3 (构建时审计，发现 ogg/wav 就失败)，语音 -20.6 LUFS / BGM -22.4 LUFS。
- 15:55 [steer] BGM 无缝循环：tools/douyin_bgm.py (ogg 源逐样本 → 前 0.5s/后 1s 垫片 mp3 + 解码拼接检查 → douyin/bgm-loop-report.txt 全 OK)；src/systems/LoopTrack.js 两路接力；tools/test_looptrack.mjs 4 种端仿真 0ms 无声。抖音 harness 16/16。
- 15:58 [steer] 商店截图改由 tools/store_shots.mjs 在广告位为空的配置下重截 (逐张断言无看广告入口)，5 张全过；pack:win 完成 (CompanyName 狸猫，licenses/ 在 exe 旁)；verify 30/30、fuzz 全过、smoke 通过、抖音 16/16、looptrack 4/4；playthrough 进行中。
- 16:00 v1.2 交付 (抖音版+Win+源码)：3 个包 SHA256 一致，tar 解压到 stage，换入 拆封绘卷 (旧版随 _screw_tmp 删)，exe 运行 8 秒正常 (标题 拆封绘卷，FileVersion 1.2.0)，已关闭；save.json 483B 10:47 未动；_screw_tmp 已删。下一步：微信小游戏 + GitHub。
- 15:55 开始微信小游戏：官方文档核对 (分包/game.json/project.config/CLI upload/IAA 发布流程/资质/备案/适龄/隐私/流量主)
- 15:58 微信平台层 src/platform/wechat + 共用 src/platform/mini (MiniAudio/matter-shim)；AdService/ShareService/SaveSystem/Boot/Voice/Bgm 改走 platform.isMini/createRewardedAd/shareMessage；tools/build_mini.mjs (抖音/微信共用) → wechat/dist 主包1.02/整包5.44MB；wx-mock + test_wechat 16/16；抖音回归 16/16
- 16:02 docs/微信上架说明.md、wechat/README.md、docs/README、版本说明已更新；PC 未安装微信开发者工具 (只有微信 4.1.11.52)；smoke 时序偶发 (机器忙) 已加等待，复跑通过

# v1.1 进度记录 (中断后从这里接着做)

## 已完成 (11:40 前)
- A 规则修复：遮挡 (掉落中的板也算遮挡、独立几何复核)、连点去抖、面板/广告期间暂停物理、判负只在 quiet 时、canTake/ropeFull、盒子队列 reconcile、undo 保留已买孔/盒位、复活 clearHoles 不丢钥匙 + _fixLocks、冰层上限、掉落超时强制移除、"倒立"单钉板 unpin 时推一把 (原来会顶着几秒再慢慢倒 → 3-2 参考解失效)、碎裂动画、字幕移到底部、音频 input:up 解锁、存档 sanitize、复活防连点、广告占位按真实时间倒数
- B 语音：36 句全部重新合成 (VOICEVOX，1.12–1.25×，情绪 style，重音词抬高，吸气 + 房间混响)，全部 -20±0.4 LUFS；平均时长 1.97s → 1.55s；VoiceSystem 每关 ≤2 句 + 轮换；字幕按语音时长、开场闲聊排在语音后
- 测试：tools/fuzz_items.mjs (新)、verify_levels 扩展 (遮挡/强制移除/钥匙/冰/障碍首登)、smoke_test v1.1 回归段、playthrough 第 15 关中途换盒
- 已跑：verify 30/30 PASS (12 种子, bot 96)；fuzz 30/30 PASS (24 局/关)；smoke 除碎片计时外全过 (已改成等待)

## 进行中
- 重做 2-9 / 3-8 (BOT_RUNS=96) → /workspace/design5.log

## 待做
1. verify (bot 96, seeds 12) + fuzz 24 → 定稿 docs/verify_report.txt
2. build → smoke (SHOT_PREFIX=v11_ 到 /workspace/AnimeScrew_shots) → playthrough
3. 版本说明 拆封绘卷-v1.1.0-版本说明.txt
4. pack win (+ linux test_desktop)
5. zip 源码/win → split 8M → sha256 → /workspace/screw_chunks/{src,win}
6. 传到 Windows PC，PowerShell 合并校验解压替换，运行 8 秒，删 _screw_tmp

## 11:55 更新
- 2-9 重做后 66%；3-8 重做后实测 82% (生成器报 59%：候选里挑"最接近目标"有赢家诅咒)。
  design_levels.mjs 加了"前 4 名用新种子复测再定稿"；3-8 重做中 → /workspace/design6.log
- 11:59 重做 2-6 (95% 太松) 与 3-9 (目标 55%) → design7.log
- 12:10 2-6/2-7/3-9 重做完；跑最终 verify/fuzz → /workspace/verify_final.log /workspace/fuzz_final.log
- 12:15 verify 30/30, fuzz 30/30 定稿；开始 smoke/playthrough
- 12:20 smoke 通过 (截图 v11_*)；playthrough + pack win 后台中
- 12:35 playthrough 30/30 (第15关换盒后通关)，pack win 完成；跑 linux + test_desktop
- 12:40 zips + chunks 完成 (/workspace/screw_chunks)
- 12:55 交付完成：Windows 上 SHA256 两个包都一致，tar 解压、替换 拆封绘卷 (旧版随 _screw_tmp 一起删除)，exe 运行 8 秒正常 (窗口标题 拆封绘卷)、已关闭，%APPDATA%\AnimeScrew\save.json 未动 (483 字节, 10:47)，_screw_tmp 已删。全部完成。

// 角色与语音台词表。
// 角色：铆铆 (修复师，带着你拆画) + 每章一位画中人。人物立绘沿用 AnimeMerge 的角色素材。
// 每句台词：id / who / text 日文字幕 / zh 中文小字 / tts 合成用文本 / file 语音文件 / priority 优先级
// 语音由 tools/generate_voices.mjs 调 VOICEVOX 引擎生成 (响度统一到 -20 LUFS，峰值 ≤ -1 dBTP)。
// v1.1 起全部台词重新合成 (不再沿用 AnimeMerge 的旧录音)，风格 / 语速 / 抑扬按情绪调。
// 规则 (VoiceSystem)：同一时间只放一句；两句之间至少 0.6 秒；高优先级顶掉低优先级，低优先级直接丢弃不排队；
// 每关最多 2 句 (低优先级只占 1 句)；同一场合几种说法轮着用，最近说过的不重复。

export const CHARACTERS = {
  riri:  { name: '铆铆', key: 'girl_01', color: '#c27a45', role: '修复师', voice: { speaker: '四国めたん', style: 'ノーマル', styleId: 2, styles: { happy: 0, excited: 0, gentle: 0, shy: 0, tease: 6, urgent: 6, calm: 2, sad: 2 } }, credit: 'VOICEVOX:四国めたん' },
  xm:    { name: '小满', key: 'girl_02', color: '#f08a2c', role: '屋顶上的女孩', voice: { speaker: '春日部つむぎ', style: 'ノーマル', styleId: 8 }, credit: 'VOICEVOX:春日部つむぎ' },
  suzhi: { name: '苏枝', key: 'girl_04', color: '#4f9a52', role: '温室的主人', voice: { speaker: '東北きりたん', style: 'ノーマル', styleId: 108 }, credit: 'VOICEVOX:東北きりたん' },
  aheng: { name: '阿蘅', key: 'girl_03', color: '#3d4a8a', role: '末班车的乘客', voice: { speaker: '冥鳴ひまり', style: 'ノーマル', styleId: 14 }, credit: 'VOICEVOX:冥鳴ひまり' },
};

// 优先级：1 开场闲聊 / 2 连击夸奖 / 3 提醒 (孔快满、炸弹、复活) / 4 通关失败 / 5 整幅画完成
// v1.1 语音重做：台词更短更口语 (えっ、よしっ、うそっ…)，每句标情绪 emo，tools/generate_voices.mjs 按情绪选
// 风格 (角色有的话，如四国めたん的 あまあま/ツンツン) 并调语速 (1.15~1.25 倍)、抑扬、句首句尾静音，
// emph 里的词单独抬音高做重音；group 相同的是同一种场合的几种说法，轮着用，不会老听同一句。
// 情绪：happy 开心 / excited 兴奋 / calm 平静 / gentle 温柔 / urgent 着急 / sad 失落 / shy 害羞 / tease 调皮
const L = (id, who, priority, emo, text, zh, extra = {}) => ({
  id, who, priority, emo, text, zh, tts: extra.tts || text, group: extra.group || id,
  file: `assets/audio/voice/${id}.mp3`, ...extra,
});

export const VOICE_LINES = [
  // 铆铆 (修复师，带着你拆画) —— 四国めたん：ノーマル / あまあま / ツンツン (v1.2 起替换猫使ビィ：其条款要求企业商用前先联系)
  L('riri_hello', 'riri', 1, 'happy', 'えへへ、よろしくね！', '嘿嘿，请多关照！', { emph: ['ヨロシク'], breath: true }),
  L('riri_tip', 'riri', 1, 'calm', 'ねえ、上の板からだよ', '喂，先拆上面的板哦', { emph: ['ウエ'] }),
  L('riri_holes', 'riri', 3, 'urgent', 'えっ、穴あと一個だよ！', '诶，孔只剩一个了！', { emph: ['イッコ'], breath: true }),
  L('riri_revive', 'riri', 3, 'excited', 'よしっ、もう一回！', '好嘞，再来一次！', { emph: ['ヨシ'] }),
  L('riri_fail', 'riri', 4, 'sad', 'うーん…詰まっちゃった', '嗯……卡住了', { group: 'riri_fail', tts: 'うーん、、詰まっちゃった' }),
  L('riri_fail_b', 'riri', 4, 'shy', 'あれれ、動けないね', '咦，动不了了呢', { group: 'riri_fail' }),
  // 小满 (第一章，屋顶上的女孩，元气) —— 春日部つむぎ
  L('xm_hello', 'xm', 1, 'excited', 'わぁっ、来てくれたんだ！', '哇，你真的来啦！', { emph: ['キテ'], breath: true }),
  L('xm_start', 'xm', 1, 'happy', 'ねえねえ、水たまり見て！', '欸欸，快看那个水洼！', { emph: ['ミズタマリ'] }),
  L('xm_combo', 'xm', 2, 'excited', 'いいじゃん、それそれ！', '不错嘛，就这样！', { group: 'xm_combo', emph: ['イイジャン'] }),
  L('xm_combo_b', 'xm', 2, 'excited', 'わっ、はやーい！', '哇，好快！', { group: 'xm_combo', emph: ['ハヤ'] }),
  L('xm_bomb', 'xm', 3, 'urgent', 'うそっ、早く早く！', '不会吧，快快快！', { emph: ['ハヤク'], breath: true }),
  L('xm_win', 'xm', 4, 'excited', 'やったぁ、開いたー！', '耶，拆开啦！', { group: 'xm_win', emph: ['ヤッタ'] }),
  L('xm_win_b', 'xm', 4, 'happy', 'えへへ、見えた見えた！', '嘿嘿，看到了看到了！', { group: 'xm_win', emph: ['ミエタ'] }),
  L('xm_win_c', 'xm', 4, 'happy', 'よーし、次いこ！', '好，下一块！', { group: 'xm_win', emph: ['ツギ'] }),
  L('xm_fail', 'xm', 4, 'tease', 'あちゃー、もっかい！', '哎呀，再来一次！', { emph: ['モッカイ'] }),
  L('xm_cg', 'xm', 5, 'excited', 'わぁ…全部そろった！', '哇……全都拼齐了！', { emph: ['ゼンブ'], breath: true, tts: 'わぁ、、全部そろった！' }),
  // 苏枝 (第二章，温室的主人，温柔) —— 東北きりたん
  L('suzhi_hello', 'suzhi', 1, 'gentle', 'いらっしゃい、どうぞ中へ', '欢迎，请进来吧', { emph: ['イラッシャイ'] }),
  L('suzhi_start', 'suzhi', 1, 'calm', 'ふぅ、ちょっと蒸しますね', '呼，有点闷呢', { breath: true }),
  L('suzhi_combo', 'suzhi', 2, 'happy', 'まあ、お上手！', '哎呀，真厉害！', { group: 'suzhi_combo', emph: ['ジョウズ'] }),
  L('suzhi_combo_b', 'suzhi', 2, 'gentle', 'ふふっ、いい感じ', '呵呵，感觉不错', { group: 'suzhi_combo' }),
  L('suzhi_bomb', 'suzhi', 3, 'urgent', 'あっ、それ危ないです！', '啊，那个危险！', { emph: ['アブナイ'], breath: true }),
  L('suzhi_win', 'suzhi', 4, 'happy', 'わぁ、きれいに外れた', '哇，拆得好干净', { group: 'suzhi_win', emph: ['キレイ'] }),
  L('suzhi_win_b', 'suzhi', 4, 'gentle', 'うん、ばっちりです', '嗯，完美', { group: 'suzhi_win', emph: ['バッチリ'] }),
  L('suzhi_win_c', 'suzhi', 4, 'calm', 'はい、お疲れさま', '好啦，辛苦了', { group: 'suzhi_win' }),
  L('suzhi_fail', 'suzhi', 4, 'gentle', '大丈夫、ゆっくりね', '没事，慢慢来', { emph: ['ユックリ'] }),
  L('suzhi_cg', 'suzhi', 5, 'gentle', 'やっと…全部見られた', '终于……看到整幅了', { emph: ['ゼンブ'], breath: true, tts: 'やっと、、全部見られた' }),
  // 阿蘅 (第三章，末班车的乘客，安静) —— 冥鳴ひまり
  L('aheng_hello', 'aheng', 1, 'shy', 'あの…隣、いいですか', '那个……我能坐旁边吗', { breath: true, tts: 'あの、、隣、いいですか？' }),
  L('aheng_start', 'aheng', 1, 'calm', '終電、間に合うかな…', '末班车，还赶得上吗……', { tts: '終電、間に合うかな' }),
  L('aheng_combo', 'aheng', 2, 'gentle', 'ふふ、上手ですね', '呵，真厉害', { group: 'aheng_combo', emph: ['ジョウズ'] }),
  L('aheng_combo_b', 'aheng', 2, 'shy', 'へえ…すごい', '诶……好厉害', { group: 'aheng_combo', tts: 'へえ、、すごい' }),
  L('aheng_bomb', 'aheng', 3, 'urgent', 'まずい、急いで…！', '糟了，快点……！', { emph: ['イソイデ'], breath: true, tts: 'まずい、急いで！' }),
  L('aheng_win', 'aheng', 4, 'gentle', '…この絵、好きかも', '……我好像喜欢这幅画', { group: 'aheng_win', emph: ['スキ'], tts: 'この絵、好きかも' }),
  L('aheng_win_b', 'aheng', 4, 'calm', 'ん、きれい', '嗯，真好看', { group: 'aheng_win' }),
  L('aheng_win_c', 'aheng', 4, 'shy', '…あ、外れた', '……啊，拆下来了', { group: 'aheng_win', tts: 'あ、外れた' }),
  L('aheng_fail', 'aheng', 4, 'gentle', 'ううん、もう一回', '没关系，再来一次', { emph: ['モウイッカイ'] }),
  L('aheng_cg', 'aheng', 5, 'sad', 'ありがとう…最後まで', '谢谢你……陪到最后', { breath: true, tts: 'ありがとう、、最後まで' }),
];

export const VOICE_BY_ID = Object.fromEntries(VOICE_LINES.map((l) => [l.id, l]));
/** 场合 (group) → 这个场合的几种说法 */
export const VOICE_GROUPS = VOICE_LINES.reduce((m, l) => { (m[l.group] = m[l.group] || []).push(l); return m; }, {});

/** 去重后的 VOICEVOX 署名 (制作人员面板) */
export const VOICE_CREDITS = [...new Set(Object.values(CHARACTERS).map((c) => c.credit))];

export const VoiceConfig = {
  volume: 0.3,           // 语音默认音量 (音频规范 9.1)
  cooldown: 0.6,         // 两句之间的最短间隔 (秒)
  perCharacterPerLevel: 2,
  perLevel: 2,           // 每关最多说几句 (开场/连击/提醒这类低优先级的只占 1 句；通关/失败/整幅画各至多 1 句)
  noRepeatWithin: 3,     // 最近说过的几句不重复
  subtitleTime: 2.8,
  speechRate: 1.05,      // 语音文件缺失时用 speechSynthesis 兜底
  speechPitch: 1.4,
};

// 音频配置 (对齐策划案第 9 章音频规范)。
// 默认音量：语音 0.3 / 音效 0.12 / 音乐 0.15，另有总音量 (设置里的滑条)。
// 语音文件 -20 LUFS、BGM 文件 -22 LUFS (tools/generate_voices.mjs / tools/compose_bgm.py 生成时已统一)。
export const AudioConfig = {
  masterVolume: 1.0,
  sfxVolume: 0.12,
  bgmVolume: 0.15,
  // voiceVolume 在 VoiceConfig.volume (0.3)

  sfx: {
    rateLimit: 0.06,        // 同一个音效 60ms 内只响一次
    maxPerFrame: 2,         // 同一类音效每帧最多 2 个声部
    pitchJitter: 0.04,      // 每次随机 ±4% 音高，避免机械重复
    comboWindow: 1.2,       // 进盒连击窗口 (秒)
    comboOctaveAt: 5,       // 连击到第 5 下升八度
    comboMax: 10,           // 连击音阶最多升到第 10 级
  },

  bgm: {
    tracks: {
      gallery:    { title: '画廊大厅', file: 'bgm_gallery' },
      roof:       { title: '雨后的屋顶', file: 'bgm_roof' },
      greenhouse: { title: '温室', file: 'bgm_greenhouse' },
      tram:       { title: '夜班电车', file: 'bgm_tram' },
    },
    sting: { title: '揭开', file: 'bgm_reveal' },
    dir: 'assets/audio/bgm/',
    duck: 0.55,             // 台词播放时 BGM 压到 55%
    duckAttack: 0.15,       // 压下去 150ms
    duckRelease: 0.4,       // 回来 400ms
    crossfade: 1.2,         // 换曲交叉淡化 (秒)
    stingDuck: 0.25,        // 揭画短曲播放时主 BGM 压到 25%
    maxDuckTime: 8,
  },
};

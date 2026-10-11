"""语音后期：把 VOICEVOX 合成的干声做得更像真人录音。
- 首尾静音裁掉 (留一点点气口)
- 可选：句前加一口轻轻的吸气声 (带通噪声 + 起伏包络)，让开口不那么"机械地开始"
- 很小的房间混响 (合成脉冲响应，RT60 ≈ 0.35 s，湿声约 9%)，去掉"贴着耳朵念"的干涩感
- 轻微高通 (80 Hz) + 极短淡入淡出
响度 (-20 LUFS / -1.5 dBTP) 由 generate_voices.mjs 用 ffmpeg 两遍 loudnorm 统一。
用法: python3 tools/voice_post.py in.wav out.wav [--breath] [--seed N]
"""
import sys, wave
import numpy as np

def read(path):
    with wave.open(path, 'rb') as w:
        sr = w.getframerate(); ch = w.getnchannels(); n = w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1: x = x.reshape(-1, ch).mean(axis=1)
    return x, sr

def write(path, x, sr):
    y = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((y * 32767).astype(np.int16).tobytes())

def onepole_lp(x, fc, sr):
    a = np.exp(-2 * np.pi * fc / sr); y = np.empty_like(x); z = 0.0
    for i in range(len(x)): z = (1 - a) * x[i] + a * z; y[i] = z
    return y

def bandpass_noise(n, lo, hi, sr, rng):
    w = rng.standard_normal(n).astype(np.float32)
    spec = np.fft.rfft(w); f = np.fft.rfftfreq(n, 1 / sr)
    shape = np.where((f > lo) & (f < hi), 1.0, 0.0) * (1 / np.sqrt(np.maximum(f, 50) / 400))  # 偏粉噪
    y = np.fft.irfft(spec * shape, n)
    return (y / (np.abs(y).max() + 1e-9)).astype(np.float32)

def trim(x, sr, thr_db=-48):
    thr = 10 ** (thr_db / 20)
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx): return x
    a = max(0, idx[0] - int(0.015 * sr)); b = min(len(x), idx[-1] + int(0.06 * sr))
    return x[a:b]

def main():
    args = sys.argv[1:]
    src, dst = args[0], args[1]
    breath = '--breath' in args
    seed = int(args[args.index('--seed') + 1]) if '--seed' in args else 1
    rng = np.random.default_rng(seed)
    x, sr = read(src)
    x = trim(x, sr)
    peak = np.abs(x).max() + 1e-9
    if breath:
        n = int(0.24 * sr)
        t = np.linspace(0, 1, n)
        env = np.sin(np.pi * t) ** 2 * (0.6 + 0.4 * t)          # 吸气：慢慢起，收尾略强
        b = bandpass_noise(n, 500, 3200, sr, rng) * env * peak * 0.07
        gap = np.zeros(int(0.05 * sr), dtype=np.float32)
        x = np.concatenate([b, gap, x])
    # 小房间混响：早期反射 + 指数衰减的低通噪声尾巴
    ir_len = int(0.45 * sr)
    tt = np.arange(ir_len) / sr
    tail = rng.standard_normal(ir_len).astype(np.float32) * np.exp(-tt * 6.9 / 0.35)
    tail = onepole_lp(tail, 4200, sr)
    ir = tail * 0.5
    for d, g in ((0.011, 0.45), (0.017, 0.33), (0.023, 0.25), (0.031, 0.18)):
        ir[int(d * sr)] += g
    ir /= np.sqrt((ir ** 2).sum()) + 1e-9
    pad = np.concatenate([x, np.zeros(ir_len, dtype=np.float32)])
    n_fft = 1 << int(np.ceil(np.log2(len(pad) + ir_len)))
    wet = np.fft.irfft(np.fft.rfft(pad, n_fft) * np.fft.rfft(ir, n_fft), n_fft)[:len(pad)].astype(np.float32)
    wet *= (np.abs(pad).max() / (np.abs(wet).max() + 1e-9))
    y = pad * 0.91 + wet * 0.09
    # 混响尾巴只留 0.18 s，淡出
    end = len(x) + int(0.18 * sr)
    y = y[:end]
    f = int(0.008 * sr); y[:f] *= np.linspace(0, 1, f)
    f2 = int(0.06 * sr); y[-f2:] *= np.linspace(1, 0, f2)
    # 80 Hz 高通 (一阶)
    hp = y - onepole_lp(y, 80, sr)
    write(dst, hp, sr)

main()

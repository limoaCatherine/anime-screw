#!/usr/bin/env python3
"""
compose_bgm.py — 程序化作曲并渲染《拆封绘卷》的背景音乐 (全部原创，无第三方素材)。
沿用 AnimeMerge 的做法 (numpy 合成 + FFT 混响 + 尾音叠回开头做无缝循环)，扩展成 4 首 + 1 段揭画短曲：

  gallery   画廊大厅   主界面/选关/画册   72 BPM  C 大调  电钢琴 + 铺底，几乎没有鼓
  roof      雨后的屋顶 第一章            86 BPM  F 大调  八音盒 + lo-fi 鼓
  greenhouse温室       第二章            80 BPM  D 大调  拇指琴 (kalimba) + 沙锤
  tram      夜班电车   第三章            74 BPM  A 小调  电钢琴 + 轻鼓 + 车轮节奏
  reveal    揭开       整幅画完成时       10 秒   不循环

响度：按 EBU R128 测量后整体增益到 -22 LUFS (策划案 9.1)，真峰值 ≤ -1 dBTP。
用法 (需要 numpy 与 ffmpeg)：python3 tools/compose_bgm.py [--only roof,tram]
"""
import argparse, os, re, subprocess, tempfile, wave
import numpy as np

SR = 44100
TAIL = 5.0
TARGET_LUFS = -22.0
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------------------------------------------------------- 音色
def adsr(n, attack, tau, rel_start, rel=0.12):
    t = np.arange(n) / SR
    env = np.minimum(1.0, t / max(attack, 1e-4)) * np.exp(-t / tau)
    r = np.clip((t - rel_start) / rel, 0, 1)
    return env * (1 - r)

def music_box(f, dur, vel):
    n = int((dur + 1.6) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, tau in ((1.0, 1.0, 0.9), (3.0, 0.22, 0.25), (5.2, 0.07, 0.10)):
        for det in (-0.0012, 0.0012):
            out += amp * np.sin(2 * np.pi * f * ratio * (1 + det) * t) * np.exp(-t / tau)
    return out * np.minimum(1.0, t / 0.0015) * vel * 0.5

def kalimba(f, dur, vel):
    n = int((dur + 1.4) * SR); t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.7)
    out += 0.35 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.06)
    out += 0.15 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.3)
    return out * np.minimum(1.0, t / 0.002) * vel * 0.6

def epiano(f, dur, vel, bright=1.1):
    n = int((dur + 1.2) * SR); t = np.arange(n) / SR
    idx = bright * np.exp(-t / 0.35) + 0.15
    out = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    out += 0.12 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.3)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 4.2 * t)
    return out * adsr(n, 0.004, 1.3, dur, 0.25) * vel * trem

def bass(f, dur, vel):
    n = int((dur + 0.3) * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    x = np.tanh(1.4 * x) / np.tanh(1.4)
    return x * adsr(n, 0.008, 0.9, dur, 0.08) * vel

def pad(notes, dur, vel, att=0.7):
    n = int((dur + 1.0) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        f = mtof(m + 12)
        for det in (-0.003, 0.0, 0.003):
            for k in range(1, 6):
                out += np.sin(2 * np.pi * f * k * (1 + det) * t + k) / k ** 1.8
    env = np.minimum(1.0, t / att) * (1 - np.clip((t - dur) / 0.9, 0, 1))
    return out * env * vel / (len(notes) * 3)

def noise_hit(n_sec, tau, hp=True, seed=0):
    r = np.random.default_rng(seed)
    n = int(n_sec * SR); t = np.arange(n) / SR
    x = r.standard_normal(n)
    if hp: x = np.diff(x, prepend=0)
    x *= np.minimum(1, t / 0.004) * np.exp(-t / tau)
    return x / np.max(np.abs(x))

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 48 + 70 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)

def rim():
    n = int(0.14 * SR); t = np.arange(n) / SR
    x = noise_hit(0.14, 0.03, seed=2) * 0.6 + 0.6 * np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.018)
    return x / np.max(np.abs(x))

def shaker(): return noise_hit(0.07, 0.018, seed=3)

def clack():
    """电车车轮过轨缝的"咔哒" (低沉)"""
    n = int(0.2 * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.05) + 0.3 * noise_hit(0.2, 0.02, hp=False, seed=5)
    return x / np.max(np.abs(x))

# ---------------------------------------------------------------- 和声
NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
QUAL = {'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], '7': [0, 4, 7, 10], 'sus': [0, 5, 7, 10], 'add9': [0, 4, 7, 14],
        'm9': [0, 3, 7, 14], '6': [0, 4, 7, 9], '': [0, 4, 7, 12], 'm': [0, 3, 7, 12]}

def chord(name):
    m = re.match(r'([A-G]b?)(.*)', name)
    root = NOTE[m.group(1)]; q = QUAL[m.group(2)]
    rootm = 36 + root if root >= 4 else 48 + root   # 贝斯根音 E2..D#3
    notes = [52 + ((root + iv - 4) % 12) for iv in q]  # 和弦收在 E3..D#4
    return sorted(notes), rootm, [(root + iv) % 12 for iv in q]

TRACKS = {
    'gallery': dict(title='画廊大厅', bpm=72, key=0, prog=['Cmaj7', 'Am7', 'Fmaj7', 'G6', 'Em7', 'Am7', 'Dm7', 'Gsus'],
                    lead='epiano', drums='none', reps=3, seed=11, swing=0.0, density=0.45, lead_oct=12),
    'roof': dict(title='雨后的屋顶', bpm=86, key=5, prog=['Fmaj7', 'Am7', 'Bbmaj7', 'C7', 'Dm7', 'Gm7', 'Bbmaj7', 'Csus'],
                 lead='box', drums='lofi', reps=3, seed=23, swing=0.08, density=0.7, lead_oct=12),
    'greenhouse': dict(title='温室', bpm=80, key=2, prog=['Dmaj7', 'Bm7', 'Gmaj7', 'Aadd9', 'Em7', 'Gmaj7', 'Bm7', 'A7'],
                       lead='kalimba', drums='shaker', reps=3, seed=37, swing=0.05, density=0.65, lead_oct=12),
    'tram': dict(title='夜班电车', bpm=74, key=9, prog=['Am9', 'Fmaj7', 'Dm9', 'E7', 'Am9', 'Cmaj7', 'Fmaj7', 'E7'],
                 lead='epiano', drums='tram', reps=3, seed=53, swing=0.06, density=0.55, lead_oct=12),
}

def scale_of(key, minor=False):
    base = [0, 2, 4, 5, 7, 9, 11]
    if minor: base = [0, 2, 3, 5, 7, 8, 10]
    return sorted({(key + s) % 12 for s in base})

RHYTHMS = [  # (拍位, 时值)
    [(0, 1), (1, .5), (1.5, .5), (2, 1.5), (3.5, .5)],
    [(0, 1.5), (1.5, .5), (2, 2)],
    [(0, .5), (.5, .5), (1, 1), (2, 1), (3, 1)],
    [(0, 2), (2.5, .5), (3, 1)],
    [(0, 1), (1, 1), (2, 1), (3, 1)],
    [(.5, .5), (1, 1.5), (2.5, .5), (3, 1)],
    [(0, 3)],
]

def make_melody(spec, rng):
    """A A' B A 结构：同一段落的旋律重复出现，听起来是"一首歌"而不是随机音符"""
    minor = spec['key'] == 9
    sc = scale_of(spec['key'], minor)
    prog = spec['prog']
    def phrase(seed, sparse):
        r = np.random.default_rng(seed)
        out = []; prev = 72
        for b, name in enumerate(prog):
            _, _, tones = chord(name)
            pats = RHYTHMS if not sparse else RHYTHMS[1:2] + RHYTHMS[3:4] + RHYTHMS[6:]
            pat = pats[r.integers(len(pats))] if b % 4 != 3 else [(0, 2.5)]
            bar = []
            for k, (off, d) in enumerate(pat):
                strong = off in (0, 2)
                pool = [m for m in range(64, 86) if (m % 12) in (tones if strong else sc)]
                pool.sort(key=lambda m: abs(m - prev) + r.random() * 3)
                m = pool[0] if r.random() < 0.6 else pool[min(len(pool) - 1, 1 + r.integers(2))]
                if r.random() > spec['density'] and k > 0: continue
                bar.append((off, m, d)); prev = m
            out.append(bar)
        return out
    A = phrase(spec['seed'] * 7 + 1, False)
    B = phrase(spec['seed'] * 7 + 2, False)
    Q = phrase(spec['seed'] * 7 + 3, True)
    return [Q, A, B, A][:spec['reps']] if spec['reps'] == 4 else [A, B, A]

def render(name):
    spec = TRACKS[name]
    rng = np.random.default_rng(spec['seed'])
    BEAT = 60.0 / spec['bpm']; BAR = 4 * BEAT
    sw = lambda beat: beat + spec['swing'] if abs(beat % 1 - 0.5) < 1e-6 else beat
    sections = make_melody(spec, rng)
    nbars = len(spec['prog']) * len(sections)
    L = nbars * BAR
    N = int((L + TAIL) * SR)
    dry = {k: np.zeros((N, 2)) for k in ('lead', 'ep', 'bass', 'pad', 'drums')}

    def put(bus, sig, t0, pan=0.0, gain=1.0):
        i = int(round(t0 * SR)); j = min(N, i + len(sig))
        if j <= i: return
        s = sig[:j - i] * gain
        dry[bus][i:j, 0] += s * np.cos((pan + 1) * np.pi / 4)
        dry[bus][i:j, 1] += s * np.sin((pan + 1) * np.pi / 4)

    lead = {'box': music_box, 'kalimba': kalimba, 'epiano': lambda f, d, v: epiano(f, d, v * 0.8, 0.7)}[spec['lead']]
    K, R, S, C = kick(), rim(), shaker(), clack()
    for b in range(nbars):
        sec, inbar = divmod(b, len(spec['prog']))
        t_bar = b * BAR
        notes, root, _ = chord(spec['prog'][inbar])
        # 和弦
        hits = [(0, 1.8, 0.5), (2.5, 1.3, 0.34)] if spec['drums'] != 'none' else [(0, 3.6, 0.42)]
        for off, d, v in hits:
            for k, m in enumerate(notes):
                put('ep', epiano(mtof(m), d * BEAT, v * (0.9 + 0.2 * rng.random())), t_bar + sw(off) * BEAT + k * 0.014, pan=-0.25)
        put('pad', pad(notes, 4 * BEAT, 1.0), t_bar)
        bl = [(0, root, 1.7, 0.9), (2, root, 0.9, 0.65), (3, root + 7, 0.9, 0.55)] if spec['drums'] != 'none' else [(0, root, 3.5, 0.7)]
        for off, m, d, v in bl:
            put('bass', bass(mtof(m), d * BEAT, v), t_bar + off * BEAT)
        # 旋律
        for off, m, d in sections[sec][inbar]:
            v = 0.72 + 0.2 * rng.random()
            put('lead', lead(mtof(m + spec['lead_oct'] - 12), d * BEAT, v), t_bar + sw(off) * BEAT, pan=0.18)
            if sec == len(sections) - 1 and spec['lead'] != 'epiano':
                put('lead', lead(mtof(m + spec['lead_oct']), d * BEAT, v * 0.2), t_bar + sw(off) * BEAT + 0.007, pan=0.45)
        # 打击
        intro = (sec == 0 and inbar < 2)
        dr = spec['drums']
        if dr in ('lofi', 'shaker', 'tram'):
            for e in range(8):
                g = (0.55 if e % 2 == 0 else 0.35) * (0.5 if intro else 1.0) * (0.85 + 0.3 * rng.random())
                if dr == 'tram' and e % 2: continue
                put('drums', S, t_bar + sw(e / 2) * BEAT, pan=0.35, gain=g)
        if dr == 'lofi' and not intro:
            for off, gk in ((0, 1.0), (2.5, 0.7)): put('drums', K, t_bar + sw(off) * BEAT, gain=gk)
            for off in (1, 3): put('drums', R, t_bar + off * BEAT, pan=-0.1, gain=0.7)
        if dr == 'shaker' and not intro:
            put('drums', K, t_bar, gain=0.55)
            put('drums', R, t_bar + 3 * BEAT, pan=-0.2, gain=0.45)
        if dr == 'tram':
            for off, gk in ((0, 0.8), (0.25, 0.5)): put('drums', C, t_bar + off * BEAT, pan=-0.3, gain=gk * 0.6)
            for off, gk in ((2, 0.8), (2.25, 0.5)): put('drums', C, t_bar + off * BEAT, pan=0.3, gain=gk * 0.6)
            if not intro:
                put('drums', K, t_bar, gain=0.7)
                put('drums', R, t_bar + 2 * BEAT, gain=0.5)
        if dr == 'none' and inbar % 2 == 1:
            put('drums', S, t_bar + 3.5 * BEAT, pan=0.4, gain=0.18)

    mix = dry['lead'] * 0.32 + dry['ep'] * 0.2 + dry['bass'] * 0.3 + dry['pad'] * 0.06 + dry['drums'] * 0.2
    ir_len = int(2.4 * SR); t = np.arange(ir_len) / SR
    ir = rng.standard_normal((ir_len, 2)) * np.exp(-t / 0.55)[:, None]
    for c in range(2): ir[:, c] = np.convolve(ir[:, c], np.ones(6) / 6, mode='same')
    ir /= np.sqrt(np.sum(ir ** 2, axis=0))
    send = dry['lead'] * 0.32 + dry['ep'] * 0.2 + dry['pad'] * 0.06 + dry['drums'] * 0.04
    nfft = 1 << int(np.ceil(np.log2(N + ir_len)))
    for c in range(2):
        mix[:, c] += np.fft.irfft(np.fft.rfft(send[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:N] * 0.38
    noise = rng.standard_normal(N) * 0.0010
    if name == 'roof':   # 屋檐滴水声：远处、极轻的水滴
        for k in range(int(L * 1.2)):
            i = rng.integers(0, N - SR)
            f = 1400 + rng.random() * 900
            tt = np.arange(int(0.08 * SR)) / SR
            drop = np.sin(2 * np.pi * (f + 2500 * tt) * tt) * np.exp(-tt / 0.02) * 0.02
            noise[i:i + len(drop)] += drop
    mix += noise[:, None]
    Ls = int(round(L * SR))
    out = mix[:Ls].copy()
    out[:N - Ls] += mix[Ls:]
    return out, L, True

def render_reveal():
    """揭开整幅画：上行琶音 + 和弦铺开 + 闪光，10 秒，结尾自然衰减"""
    rng = np.random.default_rng(99)
    N = int(10 * SR); out = np.zeros((N, 2))
    def put(sig, t0, pan=0.0, gain=1.0):
        i = int(t0 * SR); j = min(N, i + len(sig)); s = sig[:j - i] * gain
        out[i:j, 0] += s * np.cos((pan + 1) * np.pi / 4); out[i:j, 1] += s * np.sin((pan + 1) * np.pi / 4)
    arp = [60, 64, 67, 71, 72, 76, 79, 83, 84]
    for k, m in enumerate(arp):
        put(music_box(mtof(m + 12), 0.4, 0.8), 0.15 + k * 0.11, pan=-0.4 + k * 0.1, gain=0.5)
    for m in [48, 55, 60, 64, 67, 71, 74]:
        put(epiano(mtof(m), 4.5, 0.4), 1.2, gain=0.35)
    put(pad([52, 55, 59, 62], 6.0, 1.0, att=1.2), 0.8, gain=1.6)
    put(bass(mtof(36), 4.0, 0.9), 1.2, gain=0.6)
    for k in range(24):
        put(music_box(mtof(84 + int(rng.choice([0, 4, 7, 11, 12, 16]))), 0.2, 0.5), 1.4 + k * 0.17 + rng.random() * 0.05, pan=rng.uniform(-0.8, 0.8), gain=0.14 * (1 - k / 26))
    ir_len = int(2.6 * SR); t = np.arange(ir_len) / SR
    ir = rng.standard_normal((ir_len, 2)) * np.exp(-t / 0.7)[:, None]; ir /= np.sqrt(np.sum(ir ** 2, axis=0))
    nfft = 1 << int(np.ceil(np.log2(N + ir_len)))
    for c in range(2):
        out[:, c] += np.fft.irfft(np.fft.rfft(out[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:N] * 0.35
    fade = np.clip((10 - np.arange(N) / SR) / 1.5, 0, 1)
    return out * fade[:, None], 10.0, False

def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

def measure(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])
    P = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)[-1])
    return I, P

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets/audio/bgm'))
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    names = list(TRACKS) + ['reveal']
    if a.only: names = [n for n in names if n in a.only.split(',')]
    for name in names:
        x, L, loop = render_reveal() if name == 'reveal' else render(name)
        x /= max(1e-9, np.max(np.abs(x))) * 1.2
        with tempfile.TemporaryDirectory() as td:
            wav = os.path.join(td, 'a.wav'); write_wav(wav, x)
            I, P = measure(wav)
            gain = 10 ** ((TARGET_LUFS - I) / 20)
            x = x * gain
            peak = np.max(np.abs(x))
            lim = 10 ** (-1.5 / 20)
            if peak > lim:   # 柔和限幅，保持真峰值 ≤ -1 dBTP
                x = np.tanh(x / lim) * lim
            write_wav(wav, x)
            I2, P2 = measure(wav)
            ogg = os.path.join(a.out, f'bgm_{name}.ogg'); mp3 = os.path.join(a.out, f'bgm_{name}.mp3')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', ogg], check=True)
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
        title = TRACKS[name]['title'] if name in TRACKS else '揭开'
        print(f'[bgm] {name:<10} {title}  {L:.1f}s  {"循环" if loop else "单次"}  {I2:.1f} LUFS  峰值 {P2:.1f} dBFS')

if __name__ == '__main__':
    main()

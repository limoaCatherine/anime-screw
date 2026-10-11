#!/usr/bin/env python3
"""抖音版 BGM：无缝循环的 mp3 (抖音 iOS 不能播 ogg)。

问题：mp3 编码器会在文件头加 encoder delay (LAME 约 1105 样本)、文件尾补齐到整帧 (padding)。
抖音 InnerAudioContext 的 loop=true 从文件头重新解码，会把这段静音一起播出来，循环点就有一段空白。
不同解码器是否按 LAME/Xing 头裁掉 delay 也不一样，所以靠裁剪不可靠。

做法 (编码侧 + 播放侧配合)：
  1. 源用 .ogg 解码 (Vorbis 带 granule position，解出来与作曲时的循环长度 L 逐样本一致)
  2. 写成 [循环尾部 PRE 秒] + [完整一圈 L] + [循环头部 POST 秒] 再编 mp3
     → 文件头尾的编码静音都落在 PRE/POST 垫片之外，真正要播的 [PRE, PRE+L] 区间完全是音乐
  3. 播放侧 (src/systems/LoopTrack.js) 不用 loop=true，用两个 InnerAudioContext 接力：
     当前一路播到 PRE+L 附近时，另一路 seek 到对应位置 (PRE 附近) 起播，短交叉淡化后停掉前一路。
     接力点两边的内容在垫片里是同一段音乐，所以起播延迟只会让时间轴挪几十毫秒，不会出现空白；
     解码器有没有裁 encoder delay 对两路是同样的偏移，互相抵消。
  4. 本脚本解码生成的 mp3，按播放器的接力方式拼接，检查接力点附近没有空白 / 断点，写报告。

用法：python3 tools/douyin_bgm.py <src_dir> <out_dir> <report.txt> <loops.json> loop1,loop2,... [oneshot1,...]
"""
import json, subprocess, sys, os
import numpy as np

SR = 44100
PRE, POST = 0.5, 1.0
BITRATE = '96k'

def decode(path, raw=False):
    r = subprocess.run(['ffmpeg', '-v', 'error', *(['-flags2', '+skip_manual'] if raw else []), '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype='<f4').reshape(-1, 2).copy()

def encode(x, path):
    pcm = np.clip(x, -1, 1).astype('<f4').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-codec:a', 'libmp3lame', '-b:a', BITRATE, path], input=pcm, check=True)

def rms_windows(x, win):
    m = x.mean(axis=1); n = len(m) // win
    return np.sqrt((m[:n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)

def find_offset(dec, ref, search=4096):
    """dec 相对 ref 的样本偏移 (解码器是否裁掉 encoder delay)"""
    a = dec[SR:SR + 8192, 0]; best, bo = -1, 0
    for o in range(-search, search + 1, 1):
        s = SR + o
        if s < 0 or s + 8192 > len(ref): continue
        b = ref[s:s + 8192, 0]
        c = float(np.dot(a, b)) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
        if c > best: best, bo = c, o
    return -bo, best

def splice_check(dec, x, off, Ls, P, jitter):
    """模拟两路接力：A 播到 P+L 处停，B 从 P+jitter 起播 (jitter: 起播延迟造成的错位)，硬切换 (最坏情况，不淡化)。
    返回接力点前后 60ms 内，每 10ms 窗口 实际响度 / 源文件同一段内容的响度 的最小值 (≈1 = 没有空白)"""
    n = SR // 4; win = int(0.01 * SR)
    a_end = P + off + Ls; b0 = P + off + jitter
    y = np.concatenate([dec[a_end - n:a_end], dec[b0:b0 + n]])
    src = np.concatenate([x[Ls - n:Ls], x[jitter % Ls:][:n] if jitter >= 0 else np.concatenate([x[Ls + jitter:], x[:n + jitter]])])
    ry, rs = rms_windows(y, win), rms_windows(src, win)
    k = n // win
    sl = slice(k - 6, k + 6)
    return float(np.min(ry[sl] / np.maximum(rs[sl], 1e-6))), float(np.min(rs[sl]))

def naive_gap(path):
    """对照：直接把一圈编成 mp3 再 loop=true，用不裁 delay 的方式解码时首尾的近静音长度 (ms)"""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-flags2', '+skip_manual', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True)
    m = np.frombuffer(r.stdout, dtype='<f4')
    if not len(m): return None
    thr = 1e-4
    nz = np.nonzero(np.abs(m) > thr)[0]
    if not len(nz): return None
    return round(nz[0] / SR * 1000, 1), round((len(m) - 1 - nz[-1]) / SR * 1000, 1)

def main():
    src, out, report, loops_json, loops = sys.argv[1:6]
    oneshots = sys.argv[6].split(',') if len(sys.argv) > 6 and sys.argv[6] else []
    os.makedirs(out, exist_ok=True)
    meta, lines = {}, [f'BGM 无缝循环检查 (mp3 {BITRATE}，垫片 前 {PRE}s / 后 {POST}s，源 = ogg 逐样本解码)']
    ok_all = True
    P = int(PRE * SR); Q = int(POST * SR)
    for name in [n for n in loops.split(',') if n]:
        x = decode(os.path.join(src, f'{name}.ogg'))
        Ls = len(x)
        padded = np.concatenate([x[-P:], x, x[:Q]])
        dst = os.path.join(out, f'{name}.mp3')
        encode(padded, dst)
        dec = decode(dst)
        off, corr = find_offset(dec, padded)
        # 1) 循环区间 [P, P+L] 内没有静音段 (编码静音都在垫片外)
        body = dec[P + off:P + off + Ls]
        rb, rx = rms_windows(body, int(0.01 * SR)), rms_windows(x, int(0.01 * SR))
        loud = rx > 1e-3
        min_ratio = float(np.min(rb[loud] / rx[loud]))   # 循环区每 10ms 与源的响度比，最低值 (≈1)
        # 2) 接力点：起播错位 0 / ±20 / ±50 / 120 ms 都不出现空白
        worst = 9.0; src_floor = 9.0
        for jms in (0, 20, -20, 50, -50, 120):
            ratio, fl = splice_check(dec, x, off, Ls, P, int(jms / 1000 * SR))
            worst = min(worst, ratio); src_floor = min(src_floor, fl)
        # 2b) 模拟不按 LAME 头裁 encoder delay 的解码器：整条时间轴后移，两路偏移相同，接力仍无空白
        dec_raw = decode(dst, raw=True)
        off_raw, _ = find_offset(dec_raw, padded)
        worst_raw = min(splice_check(dec_raw, x, off_raw, Ls, P, int(j / 1000 * SR))[0] for j in (0, 50, 120))
        worst = min(worst, worst_raw)
        # 3) 接力点 0 错位时，拼接结果与原始循环 (x[-n:] + x[:n]) 的误差
        n = SR // 4
        a_end = P + off + Ls
        y = np.concatenate([dec[a_end - n:a_end], dec[P + off:P + off + n]])
        ref = np.concatenate([x[-n:], x[:n]])
        err = float(np.sqrt(np.mean((y - ref) ** 2)) / (np.sqrt(np.mean(ref ** 2)) + 1e-9))
        ng = naive_gap(os.path.join(src, f'{name}.mp3')) if os.path.exists(os.path.join(src, f'{name}.mp3')) else None
        good = min_ratio > 0.5 and worst > 0.7 and err < 0.2 and corr > 0.98
        ok_all &= good
        meta[name] = {'pre': round(P / SR, 6), 'len': round(Ls / SR, 6), 'post': round(Q / SR, 6)}
        lines.append(f"{'OK ' if good else 'NG '} {name:<16} 一圈 {Ls / SR:7.3f}s  解码偏移 {off:+d} 样本  循环区 10ms 响度/源 最低 {min_ratio:.2f}  "
                     f"接力点 10ms 响度/源 最低 {worst:.2f} (起播错位 0/±20/±50/120ms，硬切换；不裁 delay 的解码器偏移 {off_raw:+d} 样本时 {worst_raw:.2f})  接力误差 {err * 100:.1f}%"
                     + (f"  | 对照：旧做法(直接编一圈) 首 {ng[0]}ms / 尾 {ng[1]}ms 近静音" if ng else ''))
    for name in oneshots:
        dst = os.path.join(out, f'{name}.mp3')
        encode(decode(os.path.join(src, f'{name}.ogg')), dst)
        lines.append(f'--  {name:<16} 单次播放 (不循环)，直接转 mp3')
    lines.append('结论：' + ('全部通过，循环点没有空白' if ok_all else '有曲目没通过，见上'))
    open(report, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    open(loops_json, 'w', encoding='utf-8').write(json.dumps(meta, ensure_ascii=False, indent=2))
    print('\n'.join(lines))
    sys.exit(0 if ok_all else 4)

if __name__ == '__main__':
    main()

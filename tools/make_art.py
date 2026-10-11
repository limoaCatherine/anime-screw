# 生成三章的"画"(通关后拆出来的插画) 与界面背景。
# 背景是程序画的 (PIL + numpy)，人物来自 assets/images/source/cut_XX.png
# (AnimeMerge 角色原图用 rembg isnet-anime 抠出来的透明 PNG)。
#   python3 tools/make_art.py
import math, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageChops

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/images/cg'
SRC = ROOT / 'assets/images/source'
W, H = 726, 891   # 与画框 484x594 同比例 (1.5 倍)


def grad(h, w, stops):
    """竖直渐变 stops=[(t,(r,g,b)),...]"""
    t = np.linspace(0, 1, h)[:, None]
    out = np.zeros((h, w, 3), np.float32)
    ts = [s[0] for s in stops]
    for c in range(3):
        col = np.interp(t[:, 0], ts, [s[1][c] for s in stops])
        out[:, :, c] = col[:, None]
    return out


def to_img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def layer(size=(W, H)):
    return Image.new('RGBA', size, (0, 0, 0, 0))


def blur(im, r):
    return im.filter(ImageFilter.GaussianBlur(r))


def over(base, top):
    return Image.alpha_composite(base, top)


def glow(base, cx, cy, r, color, alpha=0.6):
    g = layer()
    d = ImageDraw.Draw(g)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (int(255 * alpha),))
    return Image.alpha_composite(base, blur(g, r * 0.6))


def place_char(base, idx, scale, cx, bottom, tint=(255, 255, 255), tint_k=0.0, rim=None):
    ch = Image.open(SRC / f'cut_{idx:02d}.png').convert('RGBA')
    bb = ch.getbbox()
    ch = ch.crop(bb)
    w, h = int(ch.width * scale), int(ch.height * scale)
    ch = ch.resize((w, h), Image.LANCZOS)
    if tint_k > 0:
        rgb = Image.new('RGB', ch.size, tint)
        mixed = ImageChops.multiply(ch.convert('RGB'), rgb)
        mixed = Image.blend(ch.convert('RGB'), mixed, tint_k)
        mixed.putalpha(ch.getchannel('A'))
        ch = mixed
    x, y = int(cx - w / 2), int(bottom - h)
    # 软阴影
    sh = layer()
    a = ch.getchannel('A').point(lambda v: int(v * 0.45))
    shadow = Image.new('RGBA', ch.size, (20, 10, 30, 0))
    shadow.putalpha(a)
    sh.paste(shadow, (x + 14, y + 10), shadow)
    base = over(base, blur(sh, 14))
    if rim:
        # 轮廓光：把 alpha 外扩一点再减去本体
        a = ch.getchannel('A')
        big = a.filter(ImageFilter.MaxFilter(7))
        edge = ImageChops.subtract(big, a).filter(ImageFilter.GaussianBlur(3))
        rl = Image.new('RGBA', ch.size, rim)
        rl.putalpha(edge.point(lambda v: int(v * 0.8)))
        tmp = layer(); tmp.paste(rl, (x, y), rl); base = over(base, tmp)
    tmp = layer(); tmp.paste(ch, (x, y), ch)
    return over(base, tmp)


def finish(im, vignette=0.35, bloom=0.25, warm=(1.0, 1.0, 1.0)):
    rgb = im.convert('RGB')
    if bloom:
        b = rgb.filter(ImageFilter.GaussianBlur(18))
        rgb = ImageChops.screen(rgb, ImageEnhance.Brightness(b).enhance(bloom))
    a = np.asarray(rgb).astype(np.float32)
    a *= np.array(warm, np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.45) / (H * 0.62)) ** 2)
    a *= (1 - vignette * np.clip(d - 0.55, 0, 1) ** 1.4)[:, :, None]
    # 极轻的纸张颗粒
    rng = np.random.default_rng(3)
    a += rng.normal(0, 3.0, a.shape[:2])[:, :, None]
    return to_img(a)


# ------------------------------------------------------------------ 第一章：雨后的屋顶 (小满)
def cg_roof():
    rnd = random.Random(11)
    sky = grad(H, W, [(0, (122, 150, 214)), (0.35, (236, 170, 178)), (0.55, (252, 205, 160)), (1, (250, 220, 190))])
    base = to_img(sky).convert('RGBA')
    base = glow(base, 520, 470, 150, (255, 226, 170), 0.9)
    # 云
    cl = layer(); d = ImageDraw.Draw(cl)
    for _ in range(26):
        cx, cy = rnd.uniform(-60, W + 60), rnd.uniform(40, 360)
        for k in range(5):
            rx, ry = rnd.uniform(40, 110), rnd.uniform(14, 32)
            ox = cx + rnd.uniform(-70, 70); oy = cy + rnd.uniform(-12, 12)
            col = (255, rnd.randint(214, 236), rnd.randint(214, 230), rnd.randint(90, 170))
            d.ellipse([ox - rx, oy - ry, ox + rx, oy + ry], fill=col)
    base = over(base, blur(cl, 9))
    # 远处的屋顶剪影 (两层)
    for depth, (col, y0, amp) in enumerate([((150, 118, 150, 230), 455, 70), ((104, 82, 112, 255), 500, 90)]):
        sil = layer(); d = ImageDraw.Draw(sil)
        x = -20
        while x < W + 20:
            w = rnd.uniform(50, 120); top = y0 - rnd.uniform(0, amp)
            if rnd.random() < 0.5:
                d.polygon([(x, H), (x, top + 26), (x + w / 2, top), (x + w, top + 26), (x + w, H)], fill=col)
            else:
                d.rectangle([x, top, x + w, H], fill=col)
                if rnd.random() < 0.5:
                    d.rectangle([x + w * 0.6, top - 34, x + w * 0.6 + 12, top], fill=col)
            for wy in range(int(top) + 20, 620, 26):
                for wx in range(int(x) + 10, int(x + w) - 12, 22):
                    if rnd.random() < 0.18:
                        d.rectangle([wx, wy, wx + 8, wy + 11], fill=(255, 214, 150, 200 - depth * 30))
            x += w + rnd.uniform(-8, 10)
        base = over(base, blur(sil, 2.2 - depth))
    # 晾衣绳 + 衣服
    ln = layer(); d = ImageDraw.Draw(ln)
    pts = [(x, 300 + 0.00028 * (x - 360) ** 2 * 1.0 + 40) for x in range(-10, W + 10, 6)]
    d.line(pts, fill=(70, 50, 60, 255), width=3)
    clothes = [(90, (240, 240, 248)), (160, (130, 180, 230)), (520, (250, 196, 206)), (610, (246, 236, 200))]
    for cx, col in clothes:
        cy = 300 + 0.00028 * (cx - 360) ** 2 + 40
        w = rnd.uniform(48, 64); h = rnd.uniform(60, 80)
        d.polygon([(cx - w / 2, cy), (cx + w / 2, cy), (cx + w / 2 + 6, cy + h), (cx - w / 2 - 6, cy + h)], fill=col + (255,))
        d.polygon([(cx - w / 2, cy), (cx - w / 2 - 22, cy + 22), (cx - w / 2 - 12, cy + 30), (cx - w / 2 + 2, cy + 18)], fill=col + (255,))
        d.polygon([(cx + w / 2, cy), (cx + w / 2 + 22, cy + 22), (cx + w / 2 + 12, cy + 30), (cx + w / 2 - 2, cy + 18)], fill=col + (255,))
        d.line([(cx - w / 2 - 6, cy + h), (cx + w / 2 + 6, cy + h)], fill=tuple(int(v * 0.8) for v in col) + (255,), width=3)
        d.rectangle([cx - 3, cy - 8, cx + 3, cy + 6], fill=(200, 140, 90, 255))
    base = over(base, ln)
    # 近处湿屋顶 (反光)
    roof = Image.new('RGBA', (W, H - 640), (0, 0, 0, 0))
    refl = base.crop((0, 640 - (H - 640), W, 640)).transpose(Image.FLIP_TOP_BOTTOM)
    refl = ImageEnhance.Brightness(refl).enhance(0.62)
    roof.paste(refl, (0, 0))
    rd = ImageDraw.Draw(roof)
    for y in range(0, H - 640, 18):
        rd.line([(0, y), (W, y)], fill=(60, 50, 70, 90), width=2)
    roof = blur(roof, 1.2)
    tmp = layer(); tmp.paste(roof, (0, 640)); base = over(base, tmp)
    base = place_char(base, 2, 0.76, W * 0.5, H + 6, tint=(255, 220, 200), tint_k=0.12, rim=(255, 220, 170, 255))
    # 栏杆 (前景)
    fg = layer(); d = ImageDraw.Draw(fg)
    d.rectangle([0, 760, W, 772], fill=(66, 52, 60, 255))
    for x in range(10, W, 46):
        d.rectangle([x, 760, x + 7, H], fill=(66, 52, 60, 235))
    base = over(base, blur(fg, 0.6))
    # 水珠闪光
    sp = layer(); d = ImageDraw.Draw(sp)
    for _ in range(60):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = rnd.uniform(1.5, 4)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 250, 240, rnd.randint(80, 200)))
    base = over(base, blur(sp, 1))
    return finish(base, vignette=0.32, bloom=0.22, warm=(1.03, 1.0, 0.97))


# ------------------------------------------------------------------ 第二章：温室 (苏枝)
def leaf(d, x, y, l, w, ang, col):
    pts = []
    for t in np.linspace(0, 1, 18):
        pts.append((t * l, math.sin(t * math.pi) * w))
    for t in np.linspace(1, 0, 18):
        pts.append((t * l, -math.sin(t * math.pi) * w))
    ca, sa = math.cos(ang), math.sin(ang)
    d.polygon([(x + px * ca - py * sa, y + px * sa + py * ca) for px, py in pts], fill=col)
    d.line([(x, y), (x + l * ca, y + l * sa)], fill=tuple(min(255, int(c * 1.15)) for c in col[:3]) + (col[3],), width=1)


def cg_greenhouse():
    rnd = random.Random(23)
    base = to_img(grad(H, W, [(0, (226, 240, 222)), (0.5, (204, 228, 196)), (1, (150, 186, 140))])).convert('RGBA')
    base = glow(base, 560, 120, 220, (255, 246, 210), 0.95)
    # 玻璃框架 (拱顶 + 竖格)
    fr = layer(); d = ImageDraw.Draw(fr)
    for x in range(-30, W + 60, 92):
        d.line([(x, 0), (x, H)], fill=(250, 252, 246, 230), width=6)
        d.line([(x + 3, 0), (x + 3, H)], fill=(170, 190, 170, 120), width=2)
    for y in range(120, H, 150):
        d.line([(0, y), (W, y)], fill=(250, 252, 246, 210), width=5)
    for k in range(4):
        d.arc([-200 + k * 20, -380 + k * 40, W + 200 - k * 20, 420 - k * 20], 180, 360, fill=(250, 252, 246, 220), width=6)
    base = over(base, blur(fr, 1.2))
    # 光柱
    lt = layer(); d = ImageDraw.Draw(lt)
    for k in range(5):
        x = 150 + k * 130
        d.polygon([(x, 0), (x + 60, 0), (x - 160, H), (x - 260, H)], fill=(255, 250, 220, 38))
    base = over(base, blur(lt, 20))
    # 远景植物 (模糊)
    pl = layer(); d = ImageDraw.Draw(pl)
    for _ in range(140):
        x, y = rnd.uniform(-40, W + 40), rnd.uniform(380, H)
        g = rnd.randint(110, 170)
        leaf(d, x, y, rnd.uniform(40, 90), rnd.uniform(10, 22), rnd.uniform(-math.pi, 0), (60, g, 80, 200))
    base = over(base, blur(pl, 5))
    # 花盆架
    sh = layer(); d = ImageDraw.Draw(sh)
    d.rectangle([0, 600, W, 616], fill=(150, 104, 70, 255))
    for x in [40, 150, 560, 650]:
        d.polygon([(x, 600), (x + 70, 600), (x + 60, 540), (x + 10, 540)], fill=(196, 110, 70, 255))
        d.rectangle([x + 4, 532, x + 66, 544], fill=(176, 96, 60, 255))
        for k in range(6):
            leaf(d, x + 35, 535, rnd.uniform(30, 60), rnd.uniform(8, 14), rnd.uniform(-math.pi * 0.95, -math.pi * 0.05), (70, rnd.randint(130, 170), 80, 255))
        if rnd.random() < 0.7:
            fx, fy = x + 35 + rnd.uniform(-10, 10), 490
            for p in range(5):
                a = p * 2 * math.pi / 5
                d.ellipse([fx + math.cos(a) * 7 - 6, fy + math.sin(a) * 7 - 6, fx + math.cos(a) * 7 + 6, fy + math.sin(a) * 7 + 6], fill=(255, 170, 190, 255))
            d.ellipse([fx - 4, fy - 4, fx + 4, fy + 4], fill=(255, 220, 120, 255))
    base = over(base, blur(sh, 0.8))
    base = place_char(base, 4, 0.76, W * 0.5, H + 6, tint=(220, 255, 220), tint_k=0.08, rim=(255, 252, 220, 255))
    # 前景大叶子 (失焦)
    fg = layer(); d = ImageDraw.Draw(fg)
    for (x, y, ang) in [(-20, 120, 0.4), (-30, 250, 0.1), (W + 20, 80, math.pi - 0.5), (W + 30, 700, math.pi + 0.3), (-20, 800, -0.3), (W + 10, 300, math.pi - 0.1)]:
        for k in range(3):
            leaf(d, x, y + k * 26, rnd.uniform(130, 190), rnd.uniform(30, 44), ang + rnd.uniform(-0.25, 0.25), (40, rnd.randint(96, 130), 60, 245))
    base = over(base, blur(fg, 4))
    # 漂浮的光尘
    sp = layer(); d = ImageDraw.Draw(sp)
    for _ in range(70):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, H * 0.8), rnd.uniform(1.2, 3.2)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 230, rnd.randint(70, 180)))
    base = over(base, blur(sp, 1))
    return finish(base, vignette=0.28, bloom=0.3, warm=(1.02, 1.02, 0.95))


# ------------------------------------------------------------------ 第三章：夜班电车 (阿蘅)
def cg_tram():
    rnd = random.Random(37)
    base = to_img(grad(H, W, [(0, (36, 40, 74)), (0.5, (52, 58, 98)), (1, (30, 30, 52))])).convert('RGBA')
    # 车窗带
    win = layer(); d = ImageDraw.Draw(win)
    d.rectangle([0, 150, W, 520], fill=(18, 22, 50, 255))
    base = over(base, win)
    bok = layer(); d = ImageDraw.Draw(bok)
    for _ in range(90):
        x, y, r = rnd.uniform(0, W), rnd.uniform(170, 500), rnd.uniform(6, 26)
        col = rnd.choice([(255, 196, 120), (255, 140, 120), (140, 200, 255), (255, 236, 180), (200, 150, 255)])
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (rnd.randint(60, 150),))
    # 动态拖影
    bok = bok.filter(ImageFilter.BoxBlur(3))
    bok = blur(bok, 5)
    streak = bok.transform(bok.size, Image.AFFINE, (1, 0, 14, 0, 1, 0))
    bok = Image.blend(bok, streak, 0.5)
    base = over(base, bok)
    # 窗框
    fr = layer(); d = ImageDraw.Draw(fr)
    for x in [0, 250, 480, W]:
        d.rectangle([x - 14, 140, x + 14, 530], fill=(196, 200, 210, 255))
        d.rectangle([x - 4, 140, x + 4, 530], fill=(150, 156, 170, 255))
    d.rectangle([0, 132, W, 150], fill=(206, 210, 220, 255))
    d.rectangle([0, 520, W, 540], fill=(206, 210, 220, 255))
    # 车厢墙与座椅
    d.rectangle([0, 540, W, H], fill=(214, 206, 188, 255))
    d.rectangle([0, 680, W, H], fill=(76, 108, 150, 255))
    for x in range(0, W, 120):
        d.rectangle([x + 4, 690, x + 112, 704], fill=(96, 130, 176, 255))
    d.rectangle([0, 0, W, 132], fill=(226, 222, 210, 255))
    # 顶灯
    for x in [120, 360, 600]:
        d.rounded_rectangle([x - 70, 28, x + 70, 48], 8, fill=(255, 250, 230, 255))
    base = over(base, blur(fr, 0.7))
    for x in [120, 360, 600]:
        base = glow(base, x, 40, 90, (255, 240, 200), 0.55)
    # 窗玻璃反光
    gl = layer(); d = ImageDraw.Draw(gl)
    for x in [60, 300, 520]:
        d.polygon([(x, 150), (x + 50, 150), (x - 80, 520), (x - 130, 520)], fill=(255, 255, 255, 26))
    base = over(base, blur(gl, 6))
    base = place_char(base, 3, 0.76, W * 0.5, H + 6, tint=(210, 210, 255), tint_k=0.14, rim=(255, 210, 150, 255))
    # 前景吊环
    fg = layer(); d = ImageDraw.Draw(fg)
    d.rectangle([0, 0, W, 16], fill=(170, 170, 180, 255))
    for x in [60, 200, 540, 680]:
        d.rectangle([x - 5, 0, x + 5, 120], fill=(236, 236, 240, 250))
        d.rounded_rectangle([x - 26, 110, x + 26, 196], 26, outline=(250, 250, 252, 250), width=11)
    base = over(base, blur(fg, 2.5))
    return finish(base, vignette=0.4, bloom=0.32, warm=(1.0, 0.98, 1.04))


def menu_bg():
    """主界面背景：铆铆的修复工作台 (用于菜单/选关，540x960)"""
    w, h = 540, 960
    rnd = random.Random(5)
    a = grad(h, w, [(0, (238, 222, 196)), (0.6, (222, 196, 160)), (1, (160, 116, 82))])
    im = to_img(a).convert('RGBA')
    d = ImageDraw.Draw(im)
    # 木纹桌面
    for y in range(600, h, 3):
        c = 150 + 20 * math.sin(y * 0.08 + math.sin(y * 0.013) * 3)
        d.line([(0, y), (w, y)], fill=(int(c), int(c * 0.7), int(c * 0.46), 255))
    im = blur(im, 1)
    return im.convert('RGB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in [('cg_1', cg_roof), ('cg_2', cg_greenhouse), ('cg_3', cg_tram)]:
        img = fn()
        img.save(OUT / f'{name}.jpg', quality=90, optimize=True, progressive=True)
        print('写入', OUT / f'{name}.jpg', img.size)
    sheet = Image.new('RGB', (W * 3 // 2, H // 2))
    for i in range(3):
        sheet.paste(Image.open(OUT / f'cg_{i + 1}.jpg').resize((W // 2, H // 2)), (i * W // 2, 0))
    sheet.save('/tmp/cg_sheet.jpg')


if __name__ == '__main__':
    main()

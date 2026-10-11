"""生成应用图标：assets/icons/app.ico (16~256 多尺寸)、app.png (512)、favicon.png (64)。
造型：一颗铜色十字螺丝 (钉帽是画框里的铆铆头像)。用法: python3 tools/make_icons.py
"""
import os, math
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)
S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
# 投影
sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(sh).ellipse([40, 52, 472, 484], fill=(40, 20, 10, 140))
img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(14)))
# 铜色垫圈 (径向渐变)
ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(ring)
for r in range(220, 0, -2):
    t = r / 220
    c = (int(150 + 90 * (1 - t) ** 0.5), int(86 + 70 * (1 - t) ** 0.6), int(44 + 40 * (1 - t)), 255)
    d.ellipse([256 - r - 8, 256 - r - 8, 256 + r - 8, 256 + r - 8], fill=c)
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).ellipse([36, 36, 476, 476], fill=255)
img.paste(ring, (0, 0), mask)
# 十字槽
cross = Image.new('RGBA', (S, S), (0, 0, 0, 0))
cd = ImageDraw.Draw(cross)
cd.rounded_rectangle([96, 236, 416, 276], 18, fill=(60, 30, 14, 200))
cd.rounded_rectangle([236, 96, 276, 416], 18, fill=(60, 30, 14, 200))
img = Image.alpha_composite(img, cross)
# 中心头像
face = Image.open(os.path.join(ROOT, 'assets', 'images', 'chars', 'girl_01.png')).convert('RGBA').resize((300, 300), Image.LANCZOS)
fm = Image.new('L', (300, 300), 0)
ImageDraw.Draw(fm).ellipse([0, 0, 299, 299], fill=255)
bg = Image.new('RGBA', (316, 316), (0, 0, 0, 0))
ImageDraw.Draw(bg).ellipse([0, 0, 315, 315], fill=(251, 244, 230, 255))
img.alpha_composite(bg, (98, 98))
img.paste(face, (106, 106), fm)
# 高光
hl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(hl).ellipse([110, 70, 300, 150], fill=(255, 255, 255, 70))
img = Image.alpha_composite(img, hl.filter(ImageFilter.GaussianBlur(10)))
img.save(os.path.join(OUT, 'app.png'))
sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
ims = [img.resize((s, s), Image.LANCZOS) for s in sizes]
ims[-1].save(os.path.join(OUT, 'app.ico'), format='ICO', sizes=[(s, s) for s in sizes], append_images=ims[:-1])
img.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'))
print('ok', sizes)

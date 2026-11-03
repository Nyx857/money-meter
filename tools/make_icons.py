from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

S = 1024
img = Image.new("RGB", (S, S), (10, 11, 14))

# 背景：中心暖光 + 边缘压暗
bg = Image.new("RGB", (S, S), (8, 9, 11))
d = ImageDraw.Draw(bg)
for i in range(120, 0, -1):
    r = int(S * 0.72 * i / 120)
    a = i / 120
    col = (int(14 + 10 * a), int(16 + 10 * a), int(20 + 8 * a))
    d.ellipse([S/2 - r, S*0.42 - r, S/2 + r, S*0.42 + r], fill=col)
bg = bg.filter(ImageFilter.GaussianBlur(S//40))
img.paste(bg)

# 金色光晕
glow = Image.new("L", (S, S), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse([S*0.16, S*0.16, S*0.84, S*0.84], fill=150)
glow = glow.filter(ImageFilter.GaussianBlur(S//10))
img.paste(Image.new("RGB", (S, S), (247, 201, 72)), (0, 0), glow.point(lambda v: int(v*0.22)))

# ¥ 字形
font = None
for path in ["/System/Library/Fonts/PingFang.ttc",
             "/System/Library/Fonts/HelveticaNeue.ttc",
             "/System/Library/Fonts/Helvetica.ttc"]:
    if os.path.exists(path):
        try:
            font = ImageFont.truetype(path, int(S*0.62))
            break
        except Exception:
            continue
if font is None:
    font = ImageFont.load_default()

mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
text = "¥"
bbox = md.textbbox((0, 0), text, font=font)
tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
md.text(((S-tw)/2 - bbox[0], (S-th)/2 - bbox[1] - S*0.02), text, font=font, fill=255)

# 金色渐变字
grad = Image.new("RGB", (S, S))
gp = grad.load()
for y in range(S):
    t = y / S
    r = int(255 - 20*t)
    g = int(232 - 60*t)
    b = int(138 - 60*t)
    for x in range(S):
        gp[x, y] = (r, g, b)
img.paste(grad, (0, 0), mask)

# 字上面一层高光
hi = Image.new("L", (S, S), 0)
hd = ImageDraw.Draw(hi)
hd.rectangle([0, 0, S, S*0.42], fill=60)
hi = hi.filter(ImageFilter.GaussianBlur(S//14))
hi = Image.composite(hi, Image.new("L", (S, S), 0), mask)
img.paste(Image.new("RGB", (S, S), (255, 255, 255)), (0, 0), hi.point(lambda v: int(v*0.35)))

os.makedirs("icons", exist_ok=True)
img.save("icons/icon-1024.png")
for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")]:
    img.resize((size, size), Image.LANCZOS).save(name, optimize=True)
print("icons done")

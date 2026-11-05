# Genera el GIF del isotipo (red -> sólido -> red) para el correo y el PNG del avatar.
# Geometría leída de apps/improvement/components/brand/Isotipo.tsx. Uso (desde la raíz del repo):
#   python blueprints/improvement/isotipo-correo.py apps/improvement/components/brand/Isotipo.tsx apps/improvement/public/brand
import re, sys, math
from PIL import Image, ImageDraw, ImageChops

src = open(sys.argv[1], encoding="utf-8").read()
out = sys.argv[2]
SIL = re.search(r'SILUETA = "([^"]+)"', src).group(1)
NODOS = eval(re.search(r"NODOS: \[number, number\]\[\] = (\[.*?\]);", src).group(1))
ARISTAS = eval(re.search(r"ARISTAS: \[number, number\]\[\] = (\[.*?\]);", src).group(1))

C1, C2 = (0x1F, 0xBE, 0x79), (0x98, 0xE3, 0x3B)
CARD = (0x0B, 0x0D, 0x12)

def path_pts():
    toks = re.findall(r"[MCZ]|-?\d+\.?\d*", SIL)
    pts, i, cur = [], 0, None
    while i < len(toks):
        t = toks[i]
        if t == "M":
            cur = (float(toks[i+1]), float(toks[i+2])); pts.append(cur); i += 3
        elif t == "C":
            i += 1
            while i < len(toks) and toks[i] not in "MCZ":
                a, b, c = [(float(toks[i+k]), float(toks[i+k+1])) for k in (0, 2, 4)]
                for s in range(1, 13):
                    u = s / 12
                    x = (1-u)**3*cur[0] + 3*(1-u)**2*u*a[0] + 3*(1-u)*u*u*b[0] + u**3*c[0]
                    y = (1-u)**3*cur[1] + 3*(1-u)**2*u*a[1] + 3*(1-u)*u*u*b[1] + u**3*c[1]
                    pts.append((x, y))
                cur = c; i += 6
        else:
            i += 1
    return pts

PTS = path_pts()

def mix(a, b, t):
    return tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))

def render(size, t, bg, pad=0.12):
    """t=0 red, t=1 sólido. Supersampling x4."""
    S = size * 4
    span = max(104, 94.14)
    esc = S * (1 - 2 * pad) / span
    ox = (S - 104 * esc) / 2 + 2 * esc
    oy = (S - 94.14 * esc) / 2 + 2 * esc
    P = lambda x, y: (ox + x * esc, oy + y * esc)
    grad = Image.new("RGB", (S, S))
    gd = ImageDraw.Draw(grad)
    for k in range(2 * S):  # degradado diagonal 135°
        gd.line([(k, 0), (0, k)], fill=mix(C1, C2, k / (2 * S)), width=2)
    img = Image.new("RGB", (S, S), bg)
    sil = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sil).polygon([P(*p) for p in PTS], fill=255)
    # relleno: 10% (red) -> 100% (sólido)
    img.paste(grad, mask=sil.point(lambda v: v * (0.1 + 0.9 * t)))
    # contorno
    borde = Image.new("L", (S, S), 0)
    ImageDraw.Draw(borde).line([P(*p) for p in PTS] + [P(*PTS[0])], fill=255, width=max(1, round(2.4 * esc)), joint="curve")
    img.paste(grad, mask=borde)
    # red: color del degradado (red) -> calada en color del fondo (sólido)
    red = Image.new("L", (S, S), 0)
    rd = ImageDraw.Draw(red)
    w = max(1, round((1 + 0.3 * t) * esc))
    for a, b in ARISTAS:
        rd.line([P(*NODOS[a]), P(*NODOS[b])], fill=round(255 * (0.7 + 0.15 * t)), width=w)
    r = (1.9 - 0.2 * t) * esc
    for x, y in NODOS:
        cx, cy = P(x, y)
        rd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    color_red = Image.blend(grad, Image.new("RGB", (S, S), bg), t)
    img.paste(color_red, mask=ImageChops.multiply(red, sil) if t > 0.5 else red)
    return img.resize((size, size), Image.LANCZOS)

def ease(u):
    return 0.5 - 0.5 * math.cos(math.pi * u)

frames, dur = [], []
A, B = render(160, 0, CARD), render(160, 1, CARD)
def hold(t, ms): frames.append(Image.blend(A, B, t)); dur.append(ms)
hold(0, 1400)
for k in range(1, 15): hold(ease(k / 15), 50)
hold(1, 1400)
for k in range(14, 0, -1): hold(ease(k / 15), 50)
frames[0].save(f"{out}/isotipo-correo.gif", save_all=True, append_images=frames[1:], duration=dur, loop=0, optimize=True)
render(512, 1, (0, 0, 0), pad=0.2).save(f"{out}/isotipo-avatar.png")
render(512, 0, (0, 0, 0), pad=0.2).save(f"{out}/isotipo-avatar-red.png")
print("ok", len(frames), "frames")

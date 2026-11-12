#!/usr/bin/env python3
"""VOIDSTATION boot art: one pixel-art scene shared by the Plymouth splash and
the rEFInd boot menu.

The scene is drawn at 320x180 logical pixels. Exports scale it up by whole
numbers (x6 for 1920x1080, x8 for 2560x1440) so every pixel stays sharp.
No dependencies beyond the Python standard library.

    voidstation.py plymouth OUT_DIR [--scales 6,8]   theme files for Plymouth
    voidstation.py preview THEME_DIR OUT_DIR         composite exported frames
    voidstation.py refind OUT_DIR --width W --height H  rEFInd theme
    voidstation.py still --scale N OUT.png           one full frame

Prototype and design decisions: .scratch/voidstation-boot/.
"""
import argparse
import math
import random
import struct
import sys
import zlib
from pathlib import Path

W, H = 320, 180
FPS = 20
LOOP = 24 * FPS  # every periodic motion divides this


def hx(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


# palette.json, plus ramps derived from it
BG = hx("#1B1D24")
SURFACE = hx("#272A34")
INSET = hx("#20232B")
RULE = hx("#3B404E")
FG = hx("#DCDDE5")
MUTED = hx("#A0A4B5")
JADE = hx("#64D6A5")
ROSE = hx("#F7768E")
AMBER = hx("#E0AF68")
PALE_AMBER = hx("#F2D3A0")
JADE_LIGHT = hx("#9DE8C6")

JADE_RAMP = [hx("#1F2B2D"), hx("#21433D"), hx("#2E6957"), hx("#46A07F"), JADE, JADE_LIGHT]

# TokyoNight Night (Leo's terminal theme; rose/amber/moss in palette.json come
# from it) widens the palette beyond jade.
def ramp(*c):
    return [hx(v) for v in c]


AMBER_R = ramp("#2A2226", "#4A3030", "#7A5040", "#B07A52", "#E0AF68", "#F2D3A0")
ORANGE_R = ramp("#2A2024", "#4A2C2C", "#8A4A3A", "#C8704A", "#FF9E64", "#FFC9A3")
ROSE_R = ramp("#2A2030", "#482838", "#7A3A50", "#B5566A", "#F7768E", "#FBB4C0")
VIOLET_R = ramp("#22202E", "#2F2A48", "#4A3F73", "#7A68B0", "#BB9AF7", "#DCCBFB")
BLUE_R = ramp("#1E2133", "#26304F", "#3D59A1", "#5A7FD0", "#7AA2F7", "#B4CBFB")
CYAN_R = ramp("#1C2430", "#1F3A4A", "#2A6A80", "#4BA3C0", "#7DCFFF", "#BDE8FF")
SLATE_R = ramp("#1E2030", "#292E42", "#3B4261", "#545C7E", "#737AA2", "#A9B1D6")
SAND_R = ramp("#2A2826", "#3E3A34", "#5E5648", "#8A7D62", "#B8A77E", "#D9CBA3")

# "ember": warm planet, cool rings and nebula; jade marks the brand.
THEME = dict(bands=(AMBER_R, ORANGE_R), storm=ROSE_R, ring=SLATE_R, nebula=VIOLET_R)
HULL_RAMP = SLATE_R
WING_RAMP = BLUE_R

LIGHT = (-0.62, -0.48, 0.62)
_l = math.sqrt(sum(c * c for c in LIGHT))
LIGHT = tuple(c / _l for c in LIGHT)


def shade(ramp, value, x, y, band=0.12):
    """value 0..1 -> ramp colour. Flat steps, with a narrow checkerboard
    dither only where two steps meet."""
    v = max(0.0, min(0.999, value)) * (len(ramp) - 1)
    i = int(v)
    frac = v - i
    if frac > 0.5 + band:
        i += 1
    elif frac > 0.5 - band and (x + y) & 1:
        i += 1
    return ramp[min(i, len(ramp) - 1)]


def mix(a, b, t):
    return tuple(int(x * (1 - t) + y * t) for x, y in zip(a, b))


# ---------------------------------------------------------------- title
GLYPHS = {
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
}


def title_pixels(text, scale, gap):
    px = {}
    width = len(text) * 5 * scale + (len(text) - 1) * gap
    x0 = (W - width) // 2
    rows = 7 * scale
    for n, ch in enumerate(text):
        g = GLYPHS[ch]
        gx = x0 + n * (5 * scale + gap)
        for r, row in enumerate(g):
            for c, bit in enumerate(row):
                if bit != "1":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        x, y = gx + c * scale + dx, r * scale + dy
                        top = dy == 0 and (r == 0 or g[r - 1][c] != "1")
                        # jade face, lit top edges, lower third a step darker
                        if top:
                            col = JADE_LIGHT
                        elif y >= rows * 0.62:
                            col = JADE_RAMP[3]
                        else:
                            col = JADE
                        px[(x, y)] = col
    out = {}
    for (x, y) in px:
        for s, col in ((1, JADE_RAMP[1]), (2, JADE_RAMP[0])):
            if (x + s, y + s) not in px:
                out.setdefault((x + s, y + s), col)
    out.update(px)
    return out


TITLE = title_pixels("VOIDSTATION", 3, 3)
TITLE_Y = 14

# ---------------------------------------------------------------- stars
rng = random.Random(7)
STARS = []
for _ in range(150):
    x, y = rng.randrange(W), rng.randrange(H)
    k = rng.random()
    tint = rng.choice([SLATE_R, SLATE_R, BLUE_R, VIOLET_R, AMBER_R, JADE_RAMP, CYAN_R])
    base = RULE if k < 0.5 else tint[2] if k < 0.85 else tint[3]
    twinkle = tint if rng.random() < 0.2 else None
    period = rng.choice([LOOP // 2, LOOP // 3, LOOP // 4, LOOP // 6])
    STARS.append((x, y, base, twinkle, period, rng.random()))
BIG_STARS = [(24, 60, LOOP // 4, 0.0, BLUE_R), (300, 32, LOOP // 6, 0.4, VIOLET_R),
             (196, 160, LOOP // 4, 0.7, JADE_RAMP), (40, 150, LOOP // 8, 0.2, AMBER_R)]


def _nebula():
    """Faint static clouds: two dark tints of the theme's nebula colour."""
    neb = THEME["nebula"]
    c1, c2 = mix(BG, neb[2], 0.22), mix(BG, neb[2], 0.42)
    out = {}
    blobs = [(262, 34, 70, 34), (46, 150, 70, 30), (200, 168, 40, 14)]
    for y in range(H):
        for x in range(W):
            m = 0.0
            for bx, by, rx, ry in blobs:
                d = ((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2
                m = max(m, math.exp(-d * 1.6))
            n = (math.sin(x * 0.11 + math.sin(y * 0.07) * 2.0) + math.sin(y * 0.13 - x * 0.05)
                 + 0.5 * math.sin((x + y) * 0.23)) / 2.5
            v = m * (0.75 + 0.45 * n)
            if v > 0.62 or (v > 0.56 and (x + y) & 1):
                out[(x, y)] = c2
            elif v > 0.34 or (v > 0.29 and (x + y) & 1):
                out[(x, y)] = c1
    return out


NEBULA = _nebula()

# ---------------------------------------------------------------- planet + ring
PCX, PCY, PR = 116, 100, 33
TILT = -0.30
COS_T, SIN_T = math.cos(TILT), math.sin(TILT)
RING_INCL = 0.24
RING_IN, RING_OUT = 42, 62
PLANET_PERIOD = LOOP  # one turn per 24 s

_RR = THEME["ring"]
RING_STRIPES = [_RR[1], _RR[2], _RR[3], _RR[4], _RR[5], _RR[4], _RR[3], _RR[4], _RR[3], None, None,
                _RR[3], _RR[4], _RR[4], _RR[3], _RR[2], _RR[1]]
RING_DARKER = {_RR[i]: _RR[max(i - 1, 0)] for i in range(len(_RR))}


def plane_to_screen(p, q, incl, cx=PCX, cy=PCY):
    a, b = p, q * incl
    return cx + a * COS_T - b * SIN_T, cy + a * SIN_T + b * COS_T


def ring_at(x, y):
    a = (x - PCX) * COS_T + (y - PCY) * SIN_T
    b = -(x - PCX) * SIN_T + (y - PCY) * COS_T
    p, q = a, b / RING_INCL
    rr = math.hypot(p, q)
    if not (RING_IN <= rr < RING_OUT):
        return None
    t = (rr - RING_IN) / (RING_OUT - RING_IN)
    c = RING_STRIPES[min(int(t * len(RING_STRIPES)), len(RING_STRIPES) - 1)]
    if c is None:
        return None
    front = q > 0
    if not front:
        c = RING_DARKER[c]
        if abs(p + 14) < 24 and q < -8:
            c = RING_DARKER[c]
    return c, front


def planet_at(x, y, t):
    nx, ny = (x + 0.5 - PCX) / PR, (y + 0.5 - PCY) / PR
    d2 = nx * nx + ny * ny
    if d2 > 1.0:
        return None
    nz = math.sqrt(1.0 - d2)
    lam = max(0.0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2])
    lat = -nx * SIN_T + ny * COS_T
    lon = math.atan2(nx * COS_T + ny * SIN_T, nz) + t * 2 * math.pi
    wobble = 0.09 * math.sin(lon * 3.0 + lat * 6.0) + 0.04 * math.sin(lon * 7.0)
    b = math.sin((lat + wobble) * 11.0) + 0.6 * math.sin((lat - wobble) * 23.0 + 1.3)
    ramp = THEME["bands"][0] if b > -0.2 else THEME["bands"][1]
    sl, slon = lat - 0.32, ((lon - 1.0) % (2 * math.pi)) - math.pi
    if sl * sl * 30 + slon * slon * 6 < 1.0 and nz > 0.1:
        ramp = THEME["storm"]
    v = 0.08 + 0.85 * lam ** 0.9
    if d2 > 0.86 and lam > 0.15:
        v = min(1.0, v + 0.3)
    return shade(ramp, v, x, y)


# ---------------------------------------------------------------- station
SCX, SCY = 262, 104
ST_R, ST_r = 24.0, 3.2
ST_ALPHA = 0.78   # tilt of the ring plane towards the viewer
ST_ROLL = -0.20   # roll on screen, same lean as the planet's rings
ST_SCALE = 1.0
ST_SPIN_PERIOD = LOOP * 2  # half a turn per loop; 4-fold symmetric, so it loops
CA, SA = math.cos(ST_ALPHA), math.sin(ST_ALPHA)
CR, SR = math.cos(ST_ROLL), math.sin(ST_ROLL)


def st_xf(x, y, z):
    """station-local -> screen-space (x right, y down, z towards viewer)."""
    y, z = y * CA - z * SA, y * SA + z * CA
    x, y = x * CR - y * SR, x * SR + y * CR
    return x * ST_SCALE, y * ST_SCALE, z * ST_SCALE


def st_splat(zb, cb, lx, ly, lz, nx, ny, nz, colour_fn):
    X, Y, Z = st_xf(lx, ly, lz)
    px, py = int(round(SCX + X)), int(round(SCY + Y))
    if not (0 <= px < W and 0 <= py < H):
        return
    i = py * W + px
    if Z <= zb[i]:
        return
    nX, nY, nZ = st_xf(nx, ny, nz)
    lam = max(0.0, nX * LIGHT[0] + nY * LIGHT[1] + nZ * LIGHT[2])
    zb[i] = Z
    cb[i] = colour_fn(lam, px, py)


def hull(lam, x, y):
    return shade(HULL_RAMP, 0.15 + 0.85 * lam, x, y)


def _cyl(pts, axis, a0, a1, rad, step=0.4, ring=None):
    """Cylinder along local axis 'x' or 'y' from a0 to a1."""
    n = ring or max(8, int(2 * math.pi * (rad(a0) if callable(rad) else max(rad, 4.6)) / 0.45))
    k = 0
    while a0 + k * step <= a1:
        t = a0 + k * step
        r = rad(t) if callable(rad) else rad
        for j in range(n):
            a = 2 * math.pi * j / n
            c, s_ = math.cos(a), math.sin(a)
            if axis == "y":
                pts.append((r * c, t, r * s_, c, 0.0, s_, "hull"))
            else:
                pts.append((t, TRUSS_Y + r * c, r * s_, 0.0, c, s_, "hull"))
        k += 1


def _disc(pts, y, rad, ny):
    for r10 in range(int(rad * 3) + 1):
        rr = r10 / 3
        n = max(6, int(2 * math.pi * rr / 0.45))
        for j in range(n):
            a = 2 * math.pi * j / n
            pts.append((rr * math.cos(a), y, rr * math.sin(a), 0.0, ny, 0.0, "hull"))


TRUSS_Y = 7.0
WING_X0, WING_X1, WING_Z = 31.0, 47.0, 6.5


def build_static_station():
    """Hub, spine, docking module, mast, truss and solar wings: no spin."""
    pts = []

    def spine_r(t):
        if -15 <= t < -9:
            return 3.2   # docking module
        if -4.5 <= t <= 4.5:
            return 4.6   # hub
        return 1.8

    _cyl(pts, "y", -15, TRUSS_Y + 2, spine_r)
    _disc(pts, -15, 3.2, -1.0)
    _disc(pts, -9, 3.2, 1.0)
    _cyl(pts, "y", -25, -15, 0.5, ring=8)          # antenna mast
    for xx10 in range(-35, 36):
        pts.append((xx10 / 10, -21.0, 0.0, 0.0, 0.0, 1.0, "hull"))
    _cyl(pts, "x", -WING_X1 - 1, WING_X1 + 1, 0.9, ring=10)  # truss
    # solar wings parallel to the ring plane, beyond the ring on both sides
    for side in (-1, 1):
        nx = int((WING_X1 - WING_X0) / 0.35)
        nz = int(2 * WING_Z / 0.35)
        for ix in range(nx + 1):
            xx = side * (WING_X0 + ix * 0.35)
            cell = (ix * 0.35) % 4.0
            for iz in range(nz + 1):
                zz = -WING_Z + iz * 0.35
                grid = cell < 0.7 or iz in (0, nz) or abs(zz) < 0.35
                pts.append((xx, TRUSS_Y + (0.02 if grid else 0.0), zz, 0.0, 1.0, 0.0,
                            "grid" if grid else "panel"))
    return pts


STATIC_PTS = build_static_station()


def draw_station(buf, f):
    zb = [-1e9] * (W * H)
    cb = [None] * (W * H)
    spin = 2 * math.pi * f / ST_SPIN_PERIOD
    glint = (f // 2) % 60

    def panel(lam, x, y):
        return WING_RAMP[3]

    def grid(lam, x, y):
        return WING_RAMP[1]

    for lx, ly, lz, nx, ny, nz, kind in STATIC_PTS:
        fn = hull if kind == "hull" else grid if kind == "grid" else panel
        st_splat(zb, cb, lx, ly, lz, nx, ny, nz, fn)

    # torus with 8 bulging habitat modules
    for iu in range(440):
        u = 2 * math.pi * iu / 440
        uu = u + spin
        module = math.cos(8 * u) > 0.55
        r = ST_r * (1.35 if module else 1.0)
        cu, su = math.cos(uu), math.sin(uu)
        for iv in range(30):
            v = 2 * math.pi * iv / 30
            cv, sv = math.cos(v), math.sin(v)
            x = (ST_R + r * cv) * cu
            z = (ST_R + r * cv) * su
            y = r * sv
            window = abs(sv) < 0.25 and cv > 0 and (iu % 11 in (5, 6))  # 440 / 11: repeats every quarter turn and not module
            if window:
                fn = lambda lam, px, py: AMBER if lam > 0.05 else hx("#B08A52")
            else:
                fn = hull
            st_splat(zb, cb, x, y, z, cv * cu, sv, cv * su, fn)

    # four spokes
    for k in range(4):
        uu = spin + math.pi / 2 * k + math.pi / 4
        cu, su = math.cos(uu), math.sin(uu)
        for s in range(40):
            d = 4.2 + s * 0.5
            for j in range(10):
                a = 2 * math.pi * j / 10
                oy, oo = 0.9 * math.cos(a), 0.9 * math.sin(a)
                x = d * cu - oo * su
                z = d * su + oo * cu
                st_splat(zb, cb, x, oy, z, -math.sin(a) * su, math.cos(a), math.sin(a) * cu, hull)

    for i, c in enumerate(cb):
        if c is not None:
            buf[i] = c

    def light(lx, ly, lz, col):
        X, Y, Z = st_xf(lx, ly, lz)
        px, py = int(round(SCX + X)), int(round(SCY + Y))
        if 0 <= px < W and 0 <= py < H and Z >= zb[py * W + px] - 1.0:
            buf[py * W + px] = col

    # sun glint sweeping across the solar wings
    gx = WING_X0 + (glint % 30) * 0.6
    if gx < WING_X1:
        for side in (-1, 1):
            for zz in (-WING_Z + 1, -WING_Z + 1.5):
                light(side * gx, TRUSS_Y + 0.1, zz, WING_RAMP[5])
    # beacons: top and wingtips blink alternately, docking lights chase
    if f % FPS < 3:
        light(0, -25.5, 0, ROSE)
    if (f + FPS // 2) % FPS < 3:
        light(-WING_X1 - 1.5, TRUSS_Y, 0, ROSE)
        light(WING_X1 + 1.5, TRUSS_Y, 0, ROSE)
    chase = (f // 4) % 4
    for k in range(4):
        a = math.pi / 2 * k
        light(3.3 * math.cos(a), -12.0, 3.3 * math.sin(a), JADE_LIGHT if k == chase else JADE_RAMP[2])


# ---------------------------------------------------------------- ship
SHIP_A, SHIP_E, SHIP_INCL = 74.0, 0.2, 0.36
SHIP_B = SHIP_A * math.sqrt(1 - SHIP_E ** 2)
SHIP_PERIOD = LOOP
SHIP_M0 = 1.2
BURN_LEN = 34
RCS_FRAMES = {int(LOOP * 0.78) + k for k in (0, 1, 6, 7)}

SHIP_SCALE = 1.35
HULL_POLY = [(6.5, 0), (3, -1.6), (-3.5, -2.1), (-5, -1.2), (-5, 1.2), (-3.5, 2.1), (3, 1.6)]
WING_POLY = [(0.5, -1.6), (-3.2, -4.6), (-5, -4.6), (-4.2, -1.6)]
WING_POLY_B = [(x, -y) for x, y in WING_POLY]


def ship_state(fr):
    M = 2 * math.pi * fr / SHIP_PERIOD + SHIP_M0
    E = M
    for _ in range(6):
        E = E - (E - SHIP_E * math.sin(E) - M) / (1 - SHIP_E * math.cos(E))
    p = SHIP_A * (math.cos(E) - SHIP_E)
    q = SHIP_B * math.sin(E)
    x, y = plane_to_screen(p, q, SHIP_INCL)
    return x, y, q > 0


def ship_heading(fr):
    x0, y0, _ = ship_state(fr - 0.5)
    x1, y1, _ = ship_state(fr + 0.5)
    a = math.atan2(y1 - y0, x1 - x0)
    step = 2 * math.pi / 16
    return round(a / step) * step


def _pick_burn():
    """First frame where the whole burn happens on the near side, left of the
    planet, so the flame is not dimmed or hidden."""
    for f in range(LOOP):
        ok = all(ship_state(f + k)[2] and ship_state(f + k)[0] < PCX - 45 for k in range(BURN_LEN + 20))
        if ok:
            return f
    raise SystemExit("no burn window")


BURN_START = _pick_burn()


def in_poly(pt, poly):
    x, y = pt
    inside = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def flicker(f, k):
    return ((f * 73 + k * 151) * 2654435761 >> 7) % 1000 / 1000.0


def draw_ship(buf, f, front_layer):
    sx, sy, front = ship_state(f)
    if front != front_layer:
        return
    dim = 0.0 if front else 0.35
    h = ship_heading(f)
    ch, shh = math.cos(h), math.sin(h)
    burning = BURN_START <= f % LOOP < BURN_START + BURN_LEN

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            buf[y * W + x] = mix(c, BG, dim) if dim else c

    # exhaust particles left behind by the burn
    for age in range(1, 40):
        fe = f - age
        if not (BURN_START <= fe % LOOP < BURN_START + BURN_LEN) or fe % 2:
            continue
        ex, ey, _ = ship_state(fe)
        eh = ship_heading(fe)
        drift = 0.28 * age
        jit = (flicker(fe, 3) - 0.5) * 0.12 * age
        px = ex - math.cos(eh) * (8 + drift) - math.sin(eh) * jit
        py = ey - math.sin(eh) * (8 + drift) + math.cos(eh) * jit
        c = AMBER if age < 8 else ROSE if age < 18 else hx("#8A4A5A") if age < 28 else RULE
        put(int(round(px)), int(round(py)), c)

    for py in range(int(sy) - 12, int(sy) + 13):
        for px in range(int(sx) - 12, int(sx) + 13):
            dx, dy = (px + 0.5 - sx) / SHIP_SCALE, (py + 0.5 - sy) / SHIP_SCALE
            lx = dx * ch + dy * shh
            ly = -dx * shh + dy * ch
            c = None
            if (lx - 2.6) ** 2 + ly ** 2 < 0.8:
                c = JADE_LIGHT
            elif in_poly((lx, ly), HULL_POLY):
                c = HULL_RAMP[4] if ly < -0.6 else HULL_RAMP[3] if ly < 0.9 else HULL_RAMP[2]
            elif in_poly((lx, ly), WING_POLY) or in_poly((lx, ly), WING_POLY_B):
                c = JADE_RAMP[3] if abs(ly) < 3.2 else JADE_RAMP[2]
            elif burning and lx < -5:
                L = 4.5 + 4.0 * flicker(f, 1)
                d = -5 - lx
                if d < L and abs(ly) < 1.5 * (1 - d / L) + 0.3:
                    t = d / L
                    c = PALE_AMBER if t < 0.25 else AMBER if t < 0.6 else ROSE
            elif (f % LOOP) in RCS_FRAMES and 3 < lx < 5.5 and 2.0 < abs(ly) < 3.2:
                c = JADE_LIGHT
            if c:
                put(px, py, c)


# ---------------------------------------------------------------- prompt
LOCK = ["0011100", "0100010", "0100010", "1111111", "1110111", "1110111", "1111111"]
BOX_W, BOX_H = 104, 11
BOX_X, BOX_Y = (W - BOX_W) // 2 + 6, 156


def draw_prompt(buf, dots, f):
    for r, row in enumerate(LOCK):
        for c, bit in enumerate(row):
            if bit == "1":
                buf[(BOX_Y + 2 + r) * W + BOX_X - 12 + c] = JADE
    for x in range(BOX_X, BOX_X + BOX_W):
        for y in range(BOX_Y, BOX_Y + BOX_H):
            edge = x in (BOX_X, BOX_X + BOX_W - 1) or y in (BOX_Y, BOX_Y + BOX_H - 1)
            corner = x in (BOX_X, BOX_X + BOX_W - 1) and y in (BOX_Y, BOX_Y + BOX_H - 1)
            if corner:
                continue
            buf[y * W + x] = JADE_RAMP[2] if edge else INSET
    for i in range(dots):
        x0 = BOX_X + 4 + i * 5
        for dx in range(3):
            for dy in range(3):
                buf[(BOX_Y + 4 + dy) * W + x0 + dx] = JADE
    if (f // 10) % 2 == 0:
        x0 = BOX_X + 4 + dots * 5
        for dy in range(5):
            buf[(BOX_Y + 3 + dy) * W + x0] = JADE_LIGHT


# ---------------------------------------------------------------- layers
# Everything below turns the scene into separately animated layers. Ticks run
# at FPS; the whole scene repeats every LOOP ticks.
PLANET_STEP = 3          # planet frame every 3 ticks: 160 frames per loop
STATION_LOOP = LOOP // 2  # wheel is 4-fold symmetric: 12 s loop
STATION_STEP = 2          # station frame every 2 ticks: 120 frames
SHIP_CANVAS = 65          # ship + flame + exhaust trail, centred on the ship
SHIP_HALF = SHIP_CANVAS // 2

Z_BG, Z_STARS, Z_STATION, Z_SHIP_BACK = -100, -90, -50, -40
Z_RING_BACK, Z_PLANET, Z_RING_FRONT, Z_SHIP_FRONT, Z_PROMPT = -30, -20, -10, 0, 10


def blank():
    return [None] * (W * H)


def _under_title(x, y):
    return (x, y - TITLE_Y) in TITLE


TWINKLERS = [(x, y, tw, period, ph) for x, y, base, tw, period, ph in STARS
             if tw and not _under_title(x, y)]


def layer_bg():
    """Nebula, steady stars and the title: everything that never changes."""
    buf = [BG] * (W * H)
    for (x, y), c in NEBULA.items():
        buf[y * W + x] = c
    for x, y, base, tw, period, ph in STARS:
        if not tw:
            buf[y * W + x] = base
    for (x, y), c in TITLE.items():
        buf[(TITLE_Y + y) * W + x] = c
    return buf


def layer_ring(front):
    buf = blank()
    for y in range(max(0, PCY - 40), min(H, PCY + 40)):
        for x in range(max(0, PCX - 70), min(W, PCX + 71)):
            r = ring_at(x, y)
            if r and r[1] == front:
                buf[y * W + x] = r[0]
    return buf


def layer_planet(tick):
    buf = blank()
    t = tick / PLANET_PERIOD
    for y in range(max(0, PCY - PR - 1), min(H, PCY + PR + 2)):
        for x in range(max(0, PCX - PR - 1), min(W, PCX + PR + 2)):
            c = planet_at(x, y, t)
            if c:
                buf[y * W + x] = c
    return buf


def layer_station(tick):
    buf = blank()
    draw_station(buf, tick)
    return buf


def ship_anchor(tick):
    sx, sy, front = ship_state(tick)
    return int(round(sx)) - SHIP_HALF, int(round(sy)) - SHIP_HALF, front


def layer_ship(tick):
    """The ship at this tick, cut to its canvas. Returns (pixels, x, y, front)."""
    buf = blank()
    _, _, front = ship_state(tick)
    draw_ship(buf, tick, front)
    x0, y0, _ = ship_anchor(tick)
    return crop(buf, x0, y0, SHIP_CANVAS, SHIP_CANVAS), x0, y0, front


def crop(buf, x0, y0, w, h):
    out = [None] * (w * h)
    for y in range(h):
        sy = y0 + y
        if not 0 <= sy < H:
            continue
        for x in range(w):
            sx = x0 + x
            if 0 <= sx < W:
                out[y * w + x] = buf[sy * W + sx]
    return out


def bbox(bufs):
    x0, y0, x1, y1 = W, H, -1, -1
    for buf in bufs:
        for i, c in enumerate(buf):
            if c is not None:
                x, y = i % W, i // W
                x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def small(rows, colours):
    """Tiny sprite from a list of strings; each character indexes colours."""
    h, w = len(rows), len(rows[0])
    return [colours.get(ch) for row in rows for ch in row], w, h


def big_star_sprite(tint, large):
    rows = ["..2..", "..1..", "21012", "..1..", "..2.."] if large else \
           [".....", "..1..", ".101.", "..1..", "....."]
    return small(rows, {"0": tint[5], "1": tint[3], "2": tint[1]})


LOCK_SPRITE = small([r.replace("0", ".") for r in LOCK], {"1": JADE})


def box_sprite():
    px = []
    for y in range(BOX_H):
        for x in range(BOX_W):
            edge_x, edge_y = x in (0, BOX_W - 1), y in (0, BOX_H - 1)
            px.append(None if edge_x and edge_y else JADE_RAMP[2] if edge_x or edge_y else INSET)
    return px, BOX_W, BOX_H


BULLET_SPRITE = small(["000"] * 3, {"0": JADE})
CURSOR_SPRITE = small(["0"] * 5, {"0": JADE_LIGHT})
BULLET_MAX = (BOX_W - 8) // 5


# ---------------------------------------------------------------- PNG
def write_png(path, pixels, w, h, scale, alpha=True, canvas=None, fill=BG):
    """Write pixels (RGB tuples, None = transparent) scaled by a whole number.
    Repeated rows use the PNG 'Up' filter, so they compress to almost nothing.
    canvas=(width, height) centres the scaled image on a larger image filled
    with the fill colour."""
    bpp = 4 if alpha else 3
    clear = b"\0\0\0\0" if alpha else bytes(3)
    cw, ch = canvas or (w * scale, h * scale)
    left, top = (cw - w * scale) // 2, (ch - h * scale) // 2
    right = cw - w * scale - left
    pad = bytes(fill) + (b"\xff" if alpha else b"")
    zero_row = b"\x02" + bytes(cw * bpp)
    fill_row = b"\x00" + pad * cw
    rows = [fill_row] + [zero_row] * (top - 1) if top > 0 else []
    for y in range(h):
        parts = [pad * left]
        for x in range(w):
            c = pixels[y * w + x]
            px = clear if c is None else bytes(c) + (b"\xff" if alpha else b"")
            parts.append(px * scale)
        parts.append(pad * right)
        rows.append(b"\x00" + b"".join(parts))
        rows.extend([zero_row] * (scale - 1))
    bottom = ch - h * scale - top
    if bottom > 0:
        rows += [fill_row] + [zero_row] * (bottom - 1)
    w, h, scale = cw, ch, 1

    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6 if alpha else 2, 0, 0, 0)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                           + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


def read_png(path):
    """Read back a PNG written by write_png (filters 0 and 2 only)."""
    data = Path(path).read_bytes()
    pos, idat = 8, b""
    w = h = ctype = None
    while pos < len(data):
        n = struct.unpack(">I", data[pos:pos + 4])[0]
        kind, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, _, ctype = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    bpp = 4 if ctype == 6 else 3
    raw = zlib.decompress(idat)
    stride = w * bpp
    prev = bytearray(stride)
    out = []
    for y in range(h):
        f = raw[y * (stride + 1)]
        row = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        if f == 2:
            row = bytearray((a + b) & 0xFF for a, b in zip(row, prev))
        elif f != 0:
            raise ValueError(f"unsupported PNG filter {f}")
        out.append(bytes(row))
        prev = row
    return w, h, bpp, out


# ---------------------------------------------------------------- Plymouth
def rgb_float(c):
    return ", ".join(f"{v / 255:.4f}" for v in c)


def build_layers():
    """Render every layer once at 1x. Returns a dict the exporters share."""
    print("rendering layers at 1x...", file=sys.stderr)
    planets = [layer_planet(i * PLANET_STEP) for i in range(LOOP // PLANET_STEP)]
    stations = [layer_station(i * STATION_STEP) for i in range(STATION_LOOP // STATION_STEP)]
    ships = [layer_ship(t) for t in range(LOOP)]
    ring_back, ring_front = layer_ring(False), layer_ring(True)

    colours = []
    for _, _, tw, _, _ in TWINKLERS:
        for c in (RULE, tw[3], tw[4]):
            if c not in colours:
                colours.append(c)
    return dict(bg=layer_bg(), planets=planets, stations=stations, ships=ships,
                ring_back=ring_back, ring_front=ring_front, dot_colours=colours)


def export_plymouth(out, scales):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    L = build_layers()
    pb = bbox(L["planets"])
    sb = bbox(L["stations"])
    rbb, rfb = bbox([L["ring_back"]]), bbox([L["ring_front"]])

    def cropped(buf, b):
        return crop(buf, b[0], b[1], b[2], b[3]), b[2], b[3]

    for s in scales:
        print(f"writing x{s} assets...", file=sys.stderr)
        p = out / f"x{s}-"
        write_png(f"{p}bg.png", L["bg"], W, H, s, alpha=False)
        write_png(f"{p}ring-back.png", *cropped(L["ring_back"], rbb), s)
        write_png(f"{p}ring-front.png", *cropped(L["ring_front"], rfb), s)
        for i, buf in enumerate(L["planets"]):
            write_png(f"{p}planet-{i}.png", *cropped(buf, pb), s)
        for i, buf in enumerate(L["stations"]):
            write_png(f"{p}station-{i}.png", *cropped(buf, sb), s)
        for t, (px, _, _, _) in enumerate(L["ships"]):
            write_png(f"{p}ship-{t}.png", px, SHIP_CANVAS, SHIP_CANVAS, s)
        for i, c in enumerate(L["dot_colours"]):
            write_png(f"{p}dot-{i}.png", [c], 1, 1, s)
        for i, (_, _, _, _, tint) in enumerate(BIG_STARS):
            write_png(f"{p}bigstar-{i}-0.png", *big_star_sprite(tint, False), s)
            write_png(f"{p}bigstar-{i}-1.png", *big_star_sprite(tint, True), s)
        write_png(f"{p}lock.png", *LOCK_SPRITE, s)
        write_png(f"{p}box.png", *box_sprite(), s)
        write_png(f"{p}bullet.png", *BULLET_SPRITE, s)
        write_png(f"{p}cursor.png", *CURSOR_SPRITE, s)

    (out / "voidstation.script").write_text(plymouth_script(L, scales, pb, sb, rbb, rfb))
    (out / "voidstation.plymouth").write_text(PLYMOUTH_THEME)
    print(f"wrote theme to {out}", file=sys.stderr)


PLYMOUTH_DIR = "/usr/share/plymouth/themes/voidstation"
PLYMOUTH_THEME = f"""[Plymouth Theme]
Name=VOIDSTATION
Description=Pixel-art ringed planet, space station and orbiting ship
ModuleName=script

[script]
ImageDir={PLYMOUTH_DIR}
ScriptFile={PLYMOUTH_DIR}/voidstation.script
"""


# Plymouth script callbacks. Inside functions every global is named with
# "global." so reads and writes never fall into a function-local variable.
PROMPT_AND_ANIMATION = """\
prompt_on = 0;
bullets_shown = 0;

fun show_prompt(on) {{
  global.prompt_on = on;
  global.lock.SetOpacity(on);
  global.box.SetOpacity(on);
  global.cursor.SetOpacity(on);
  for (i = 0; i < {bullet_max}; i++) {{
    if (on && i < global.bullets_shown) {{
      global.bullet[i].SetOpacity(1);
    }} else {{
      global.bullet[i].SetOpacity(0);
    }}
  }}
}}

fun password_cb(prompt, bullets) {{
  n = bullets;
  if (n > {bullet_max}) {{
    n = {bullet_max};
  }}
  global.bullets_shown = n;
  show_prompt(1);
  global.cursor.SetX(global.ox + ({cur_x} + n * 5) * global.S);
}}

fun normal_cb() {{
  global.bullets_shown = 0;
  show_prompt(0);
}}

show_prompt(0);
Plymouth.SetDisplayPasswordFunction(password_cb);
Plymouth.SetDisplayNormalFunction(normal_cb);

// Animation: Plymouth calls refresh 50 times a second; the scene runs at
// {fps} ticks a second and loops every {loop} ticks.
refreshes = 0;
last_tick = -1;
planet_frame = 0;
station_frame = 0;

fun update(tick) {{
  pf = Math.Int(tick / {planet_step});
  if (pf != global.planet_frame) {{
    global.planet_frame = pf;
    global.planet.SetImage(Image(global.P + "planet-" + pf + ".png"));
  }}
  sf = Math.Int(mod(tick, {station_loop}) / {station_step});
  if (sf != global.station_frame) {{
    global.station_frame = sf;
    global.station.SetImage(Image(global.P + "station-" + sf + ".png"));
  }}
  global.ship.SetImage(Image(global.P + "ship-" + tick + ".png"));
  place(global.ship, global.ship_x[tick], global.ship_y[tick], global.ship_z[tick]);
  for (i = 0; i < global.ntw; i++) {{
    s = Math.Sin(2 * Math.Pi * (tick / global.tw_period[i] + global.tw_phase[i]));
    st = 0;
    if (s > -0.2) {{ st = 1; }}
    if (s > 0.7) {{ st = 2; }}
    if (st != global.tw_state[i]) {{
      global.tw_state[i] = st;
      global.tw[i].SetImage(global.dot[global.tw_img[i * 3 + st]]);
    }}
  }}
  for (i = 0; i < global.nbig; i++) {{
    s = Math.Sin(2 * Math.Pi * (tick / global.big_period[i] + global.big_phase[i]));
    st = 0;
    if (s > 0.3) {{ st = 1; }}
    if (st != global.big_state[i]) {{
      global.big_state[i] = st;
      global.big[i].SetImage(global.big_img[i * 2 + st]);
    }}
  }}
  if (global.prompt_on) {{
    global.cursor.SetOpacity(1 - mod(Math.Int(tick / 10), 2));
  }}
}}

fun refresh_cb() {{
  global.refreshes = global.refreshes + 1;
  tick = mod(Math.Int(global.refreshes * {fps} / 50), {loop});
  if (tick != global.last_tick) {{
    global.last_tick = tick;
    update(tick);
  }}
}}

update(0);
Plymouth.SetRefreshFunction(refresh_cb);"""


def plymouth_script(L, scales, pb, sb, rbb, rfb):
    """Generate the Plymouth script. Positions are in logical pixels; the
    script multiplies by the chosen scale and centres the 320x180 scene."""
    o = []
    w = o.append
    w("// VOIDSTATION Plymouth theme. Generated by voidstation.py: do not edit.")
    w("// Logical scene: 320x180 pixels, scaled by a whole number and centred.")
    w(f"Window.SetBackgroundTopColor({rgb_float(BG)});")
    w(f"Window.SetBackgroundBottomColor({rgb_float(BG)});")
    w("")
    w("fun mod(a, b) { return a - Math.Int(a / b) * b; }")
    w("")
    w("// Largest exported scale that fits the screen.")
    for i, s in enumerate(scales):
        w(f"scales[{i}] = {s};")
    w(f"nscales = {len(scales)};")
    w("sw = Window.GetWidth();")
    w("sh = Window.GetHeight();")
    w("S = scales[0];")
    w("for (i = 0; i < nscales; i++) {")
    w(f"  if ({W} * scales[i] <= sw && {H} * scales[i] <= sh) {{ S = scales[i]; }}")
    w("}")
    w(f"ox = Window.GetX() + Math.Int((sw - {W} * S) / 2);")
    w(f"oy = Window.GetY() + Math.Int((sh - {H} * S) / 2);")
    w('P = "x" + S + "-";')
    w("")
    w("fun place(sprite, x, y, z) {")
    w("  sprite.SetX(global.ox + x * global.S);")
    w("  sprite.SetY(global.oy + y * global.S);")
    w("  sprite.SetZ(z);")
    w("}")
    w("")
    w('bg = Sprite(Image(P + "bg.png"));')
    w(f"place(bg, 0, 0, {Z_BG});")
    w('ring_back = Sprite(Image(P + "ring-back.png"));')
    w(f"place(ring_back, {rbb[0]}, {rbb[1]}, {Z_RING_BACK});")
    w('ring_front = Sprite(Image(P + "ring-front.png"));')
    w(f"place(ring_front, {rfb[0]}, {rfb[1]}, {Z_RING_FRONT});")
    w('planet = Sprite(Image(P + "planet-0.png"));')
    w(f"place(planet, {pb[0]}, {pb[1]}, {Z_PLANET});")
    w('station = Sprite(Image(P + "station-0.png"));')
    w(f"place(station, {sb[0]}, {sb[1]}, {Z_STATION});")
    w('ship = Sprite(Image(P + "ship-0.png"));')
    w("")
    w("// Ship canvas position and layer for every tick of the loop.")
    for t, (_, x, y, front) in enumerate(L["ships"]):
        w(f"ship_x[{t}] = {x}; ship_y[{t}] = {y}; ship_z[{t}] = {Z_SHIP_FRONT if front else Z_SHIP_BACK};")
    w("")
    w("// Twinkling stars: three brightness steps each.")
    cols = L["dot_colours"]
    for i, c in enumerate(cols):
        w(f'dot[{i}] = Image(P + "dot-{i}.png");')
    for i, (x, y, tw, period, ph) in enumerate(TWINKLERS):
        a, b, c = cols.index(RULE), cols.index(tw[3]), cols.index(tw[4])
        w(f"tw_img[{i * 3}] = {a}; tw_img[{i * 3 + 1}] = {b}; tw_img[{i * 3 + 2}] = {c};")
        w(f"tw_period[{i}] = {period}; tw_phase[{i}] = {ph:.4f}; tw_state[{i}] = -1;")
        w(f"tw[{i}] = Sprite(dot[{a}]); place(tw[{i}], {x}, {y}, {Z_STARS});")
    w(f"ntw = {len(TWINKLERS)};")
    for i, (x, y, period, ph, _) in enumerate(BIG_STARS):
        w(f'big_img[{i * 2}] = Image(P + "bigstar-{i}-0.png"); big_img[{i * 2 + 1}] = Image(P + "bigstar-{i}-1.png");')
        w(f"big_period[{i}] = {period}; big_phase[{i}] = {ph:.4f}; big_state[{i}] = -1;")
        w(f"big[{i}] = Sprite(big_img[{i * 2}]); place(big[{i}], {x - 2}, {y - 2}, {Z_STARS});")
    w(f"nbig = {len(BIG_STARS)};")
    w("")
    w("// Passphrase prompt, hidden until a disk asks for it.")
    w('lock = Sprite(Image(P + "lock.png"));')
    w(f"place(lock, {BOX_X - 12}, {BOX_Y + 2}, {Z_PROMPT});")
    w('box = Sprite(Image(P + "box.png"));')
    w(f"place(box, {BOX_X}, {BOX_Y}, {Z_PROMPT});")
    w('cursor = Sprite(Image(P + "cursor.png"));')
    w(f"place(cursor, {BOX_X + 4}, {BOX_Y + 3}, {Z_PROMPT + 2});")
    w('bullet_img = Image(P + "bullet.png");')
    w(f"for (i = 0; i < {BULLET_MAX}; i++) {{")
    w("  bullet[i] = Sprite(bullet_img);")
    w(f"  place(bullet[i], {BOX_X + 4} + i * 5, {BOX_Y + 4}, {Z_PROMPT + 1});")
    w("}")
    w(PROMPT_AND_ANIMATION.format(
        bullet_max=BULLET_MAX, cur_x=BOX_X + 4, cur_y=BOX_Y + 3, zc=Z_PROMPT + 2,
        fps=FPS, loop=LOOP, planet_step=PLANET_STEP, station_loop=STATION_LOOP,
        station_step=STATION_STEP))
    return "\n".join(o) + "\n"


# ---------------------------------------------------------------- preview
def preview(theme_dir, out_dir, ticks, scale):
    """Composite exported PNGs with the same positions and layers the script
    uses, to check the export without booting. Writes one PNG per tick."""
    theme_dir, out_dir = Path(theme_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pb = sb = rbb = rfb = None
    for line in (theme_dir / "voidstation.script").read_text().splitlines():
        for name in ("ring_back", "ring_front", "planet", "station"):
            if line.startswith(f"place({name}, "):
                x, y = (int(v) for v in line[len(f"place({name}, "):].split(",")[:2])
                if name == "ring_back":
                    rbb = (x, y)
                elif name == "ring_front":
                    rfb = (x, y)
                elif name == "planet":
                    pb = (x, y)
                else:
                    sb = (x, y)
    p = theme_dir / f"x{scale}-"
    for tick in ticks:
        canvas = [list(BG) * (W * scale) for _ in range(H * scale)]

        def paste(path, lx, ly):
            w, h, bpp, rows = read_png(path)
            for y, row in enumerate(rows):
                cy = ly * scale + y
                if not 0 <= cy < H * scale:
                    continue
                line = canvas[cy]
                for x in range(w):
                    cx = lx * scale + x
                    if not 0 <= cx < W * scale:
                        continue
                    if bpp == 4 and row[x * 4 + 3] == 0:
                        continue
                    line[cx * 3:cx * 3 + 3] = row[x * bpp:x * bpp + 3]

        _, sx, sy, front = layer_ship(tick)
        layers = [(Z_BG, f"{p}bg.png", 0, 0),
                  (Z_STATION, f"{p}station-{(tick % STATION_LOOP) // STATION_STEP}.png", *sb),
                  (Z_SHIP_FRONT if front else Z_SHIP_BACK, f"{p}ship-{tick}.png", sx, sy),
                  (Z_RING_BACK, f"{p}ring-back.png", *rbb),
                  (Z_PLANET, f"{p}planet-{tick // PLANET_STEP}.png", *pb),
                  (Z_RING_FRONT, f"{p}ring-front.png", *rfb)]
        for _, path, x, y in sorted(layers, key=lambda l: l[0]):
            paste(path, x, y)
        flat = [tuple(row[i:i + 3]) for row in canvas for i in range(0, len(row), 3)]
        write_png(out_dir / f"preview-{tick}.png", flat, W * scale, H * scale, 1, alpha=False)
        print(f"wrote preview-{tick}.png", file=sys.stderr)


# ---------------------------------------------------------------- still
def render_still(tick):
    """Full scene at 1x, no prompt (the rEFInd background)."""
    buf = layer_bg()
    for x, y, tw, period, ph in TWINKLERS:
        buf[y * W + x] = tw[3]
    for x, y, period, ph, tint in BIG_STARS:
        px, w, h = big_star_sprite(tint, True)
        for i, c in enumerate(px):
            if c is not None:
                buf[(y - 2 + i // w) * W + x - 2 + i % w] = c
    ship_px, sx, sy, front = layer_ship(tick)

    def over(layer):
        for i, c in enumerate(layer):
            if c is not None:
                buf[i] = c

    def over_ship():
        for i, c in enumerate(ship_px):
            x, y = sx + i % SHIP_CANVAS, sy + i // SHIP_CANVAS
            if c is not None and 0 <= x < W and 0 <= y < H:
                buf[y * W + x] = c

    over(layer_station(tick))
    if not front:
        over_ship()
    over(layer_ring(False))
    over(layer_planet(tick))
    over(layer_ring(True))
    if front:
        over_ship()
    return buf


# ---------------------------------------------------------------- rEFInd
# rEFInd centres the row of OS icons vertically, with the tools row and the
# selected entry's label below. Its highlight tile is 9/8 of the big icon and
# 4/3 of the small one, so icons of 24 and 12 logical pixels give tiles of 27
# and 16: whole logical pixels at every scale. The menu background moves the
# planet left so the centre stays clear for the icons.
BIG_ICON, SMALL_ICON = 24, 12
MENU_PCX = 52
MENU_SHIP_AT = (66, 152)
FONT_FILES = ("drdos8x8.psfu.gz", "default8x9.psfu.gz")
FONT_DIR = Path("/usr/share/kbd/consolefonts")


def render_menu_scene():
    """The scene for the boot menu: planet on the left, station on the right,
    the ship mid-burn below the planet."""
    global PCX
    buf = layer_bg()
    for x, y, tw, period, ph in TWINKLERS:
        buf[y * W + x] = tw[3]
    for x, y, period, ph, tint in BIG_STARS:
        px, w, h = big_star_sprite(tint, True)
        for i, c in enumerate(px):
            if c is not None:
                buf[(y - 2 + i // w) * W + x - 2 + i % w] = c

    def over(layer):
        for i, c in enumerate(layer):
            if c is not None:
                buf[i] = c

    over(layer_station(0))
    saved, PCX = PCX, MENU_PCX
    try:
        over(layer_ring(False))
        over(layer_planet(int(LOOP * 0.3)))
        over(layer_ring(True))
    finally:
        PCX = saved
    ship_px, _, _, _ = layer_ship(BURN_START + 14)
    x0, y0 = MENU_SHIP_AT[0] - SHIP_HALF, MENU_SHIP_AT[1] - SHIP_HALF
    for i, c in enumerate(ship_px):
        x, y = x0 + i % SHIP_CANVAS, y0 + i // SHIP_CANVAS
        if c is not None and 0 <= x < W and 0 <= y < H:
            buf[y * W + x] = c
    return buf


def icon_arch():
    """Arch logo in TokyoNight blue, lit from the upper left."""
    n = BIG_ICON
    px = [None] * (n * n)
    for y in range(n):
        half = (y + 1) * 0.5
        for x in range(n):
            dx = x + 0.5 - n / 2
            if abs(dx) > half:
                continue
            # rounded arch cut into the base, about 45% of its width
            if y >= 14 and abs(dx) < 5.4 * math.sqrt((y - 13) / 10):
                continue
            edge_l = dx - 1 < -half
            edge_r = dx + 1 > half
            px[y * n + x] = BLUE_R[5] if edge_l else BLUE_R[3] if edge_r else BLUE_R[4]
    return px, n, n


def icon_windows():
    """Four panes in palette colours: rose, moss, blue, amber."""
    n = BIG_ICON
    px = [None] * (n * n)
    green = ramp("#1F2B22", "#2E4A2A", "#4D7A3A", "#76A852", "#9ECE6A", "#C9E6A8")
    panes = [(2, 2, ROSE_R), (13, 2, green), (2, 13, BLUE_R), (13, 13, AMBER_R)]
    for ox, oy, r in panes:
        for y in range(9):
            for x in range(9):
                c = r[5] if y == 0 or x == 0 else r[3] if y == 8 or x == 8 else r[4]
                px[(oy + y) * n + ox + x] = c
    return px, n, n


SMALL_ICONS = {
    # 12x12, one colour plus a lighter top edge
    "func_shutdown": (ROSE_R, [
        "............",
        ".....##.....",
        "..#..##..#..",
        ".##..##..##.",
        ".#...##...#.",
        "#....##....#",
        "#..........#",
        "#..........#",
        ".#........#.",
        ".##......##.",
        "..########..",
        "....####....",
    ]),
    "func_reset": (AMBER_R, [
        "............",
        "....####.#..",
        "..##....###.",
        ".#.....####.",
        ".#..........",
        "#...........",
        "#..........#",
        "#..........#",
        ".#........#.",
        ".##......##.",
        "..########..",
        "....####....",
    ]),
    "func_firmware": (VIOLET_R, [
        "............",
        "..#.#..#.#..",
        ".##########.",
        "#.#......#.#",
        ".##.####.##.",
        "#.#.#..#.#.#",
        ".##.#..#.##.",
        "#.#.####.#.#",
        ".##......##.",
        "#.########.#",
        "..#.#..#.#..",
        "............",
    ]),
}


def small_icon(name):
    r, rows = SMALL_ICONS[name]
    px = []
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != "#":
                px.append(None)
            elif y == 0 or rows[y - 1][x] != "#":
                px.append(r[5])
            else:
                px.append(r[4])
    return px, SMALL_ICON, SMALL_ICON


def selection(n, arm):
    """Jade corner brackets, transparent inside."""
    px = [None] * (n * n)
    for y in range(n):
        for x in range(n):
            ex, ey = min(x, n - 1 - x), min(y, n - 1 - y)
            if (ex == 0 and ey < arm) or (ey == 0 and ex < arm):
                px[y * n + x] = JADE_LIGHT if ex == 0 and ey == 0 else JADE
    return px, n, n


def load_console_font():
    """8-pixel-wide bitmap font from the kbd console fonts (PSF1, PSF2 or
    raw), so labels match the pixel art."""
    import gzip
    for name in FONT_FILES:
        path = FONT_DIR / name
        if not path.exists():
            continue
        d = gzip.open(path).read() if name.endswith(".gz") else path.read_bytes()
        if d[:2] == b"\x36\x04":
            h = d[3]
            return [d[4 + i * h:4 + (i + 1) * h] for i in range(256)], h
        if d[:4] == b"\x72\xb5\x4a\x86":
            hs, _, n, cs, h, w = struct.unpack("<IIIIII", d[8:32])
            if w == 8:
                return [d[hs + i * cs:hs + (i + 1) * cs] for i in range(n)], h
    raise SystemExit(f"no usable console font in {FONT_DIR} ({', '.join(FONT_FILES)})")


def refind_font(fs):
    """rEFInd font strip: glyphs 32..126 plus one for anything else, 8 pixels
    wide, each font pixel fs screen pixels. rEFInd inverts font colours on a
    dark background, so the strip stores the inverse of jade (and of the
    shadow) to come out jade."""
    glyphs, gh = load_console_font()
    cell_h = gh + 1
    cols = 96 * 8
    px = [None] * (cols * cell_h)
    inv = lambda c: tuple(255 - v for v in c)
    for i in range(96):
        g = glyphs[32 + i] if i < 95 else None
        for y in range(gh):
            bits = g[y] if g else (0xFF if y in (0, gh - 1) else 0x81)
            for x in range(8):
                if bits & (0x80 >> x):
                    px[y * cols + i * 8 + x] = inv(JADE)
                    sx, sy = i * 8 + x + 1, y + 1
                    if x < 7 and px[sy * cols + sx] is None:
                        px[sy * cols + sx] = inv(INSET)
    return px, cols, cell_h


def export_refind(out, width, height):
    """rEFInd theme for one screen size: background, icons, selection
    brackets and font. Returns the icon sizes for refind.conf."""
    out = Path(out)
    (out / "icons").mkdir(parents=True, exist_ok=True)
    s = max(1, min(width // W, height // H))
    fs = max(1, round(s / 3))
    write_png(out / "background.png", render_menu_scene(), W, H, s, alpha=False, canvas=(width, height))
    write_png(out / "icons" / "os_arch.png", *icon_arch(), s)
    write_png(out / "icons" / "os_win.png", *icon_windows(), s)
    for name in SMALL_ICONS:
        write_png(out / "icons" / f"{name}.png", *small_icon(name), s)
    write_png(out / "selection-big.png", *selection(BIG_ICON * 9 // 8, 6), s)
    write_png(out / "selection-small.png", *selection(SMALL_ICON * 4 // 3, 4), s)
    write_png(out / "font.png", *refind_font(fs), fs)
    sizes = {"big_icon_size": BIG_ICON * s, "small_icon_size": SMALL_ICON * s}
    (out / "sizes.conf").write_text("".join(f"{k} {v}\n" for k, v in sizes.items()))
    print(f"wrote rEFInd theme for {width}x{height} (scale {s}) to {out}", file=sys.stderr)
    return sizes


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("plymouth", help="write the Plymouth theme")
    a.add_argument("out")
    a.add_argument("--scales", default="6,8", help="comma-separated whole-number scales")
    a = sub.add_parser("preview", help="composite exported frames into PNGs")
    a.add_argument("theme_dir")
    a.add_argument("out")
    a.add_argument("--scale", type=int, default=6)
    a.add_argument("--ticks", default="0,60,120,240,300,420")
    a = sub.add_parser("refind", help="write the rEFInd theme for one screen size")
    a.add_argument("out")
    a.add_argument("--width", type=int, required=True)
    a.add_argument("--height", type=int, required=True)
    a = sub.add_parser("still", help="one full frame, no prompt")
    a.add_argument("out")
    a.add_argument("--scale", type=int, default=8)
    a.add_argument("--tick", type=int, default=None)
    args = ap.parse_args(argv)

    if args.cmd == "plymouth":
        export_plymouth(args.out, sorted({int(s) for s in args.scales.split(",")}))
    elif args.cmd == "refind":
        export_refind(args.out, args.width, args.height)
    elif args.cmd == "preview":
        preview(args.theme_dir, args.out, [int(t) for t in args.ticks.split(",")], args.scale)
    else:
        tick = BURN_START + 14 if args.tick is None else args.tick
        write_png(args.out, render_still(tick), W, H, args.scale, alpha=False)


if __name__ == "__main__":
    main()

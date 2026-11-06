"""
Builds Molbhav web + iOS logo assets from one geometry (kept in step with
src/components/brand/logo.tsx).

Usage: python3 scripts/logo/generate.py <out_dir>
Then:  node scripts/logo/raster.mjs <out_dir>
Copy web/ → src/app/, brand/ → public/brand/, ios/ → Xcode asset catalog.
"""
import os
import sys

OUT = sys.argv[1]
INDIGO, MARIGOLD, EMERALD, WHITE = "#222d78", "#f5a524", "#047857", "#ffffff"

# Mark geometry in 64-unit space; its box is x 8–56, y 12–47 (centre 32, 29.5).
LEFT = "M24 12a16 16 0 1 1 -5 31.2L8 47l4-10A16 16 0 0 1 24 12z"
RIGHT = "M40 12a16 16 0 1 0 5 31.2L56 47l-4-10A16 16 0 0 0 40 12z"
LENS = "M32 14.14A16 16 0 0 1 32 41.86A16 16 0 0 1 32 14.14Z"
CHECK = "M27.6 28.4l3.2 3.2 5.6-6.6"


def mark(cx, cy, scale, left=WHITE, right=MARIGOLD, lens=EMERALD, tick=WHITE, stroke=2.6):
    return (
        f'<g transform="translate({cx} {cy}) scale({scale}) translate(-32 -29.5)">'
        f'<path d="{LEFT}" fill="{left}"/><path d="{RIGHT}" fill="{right}"/>'
        f'<path d="{LENS}" fill="{lens}"/>'
        f'<path d="{CHECK}" fill="none" stroke="{tick}" stroke-width="{stroke}" '
        f'stroke-linecap="round" stroke-linejoin="round"/></g>'
    )


def svg(w, h, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}">{body}</svg>'
    )


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(text)


tile = lambda rx, s=1.08: svg(
    64, 64, f'<rect width="64" height="64" rx="{rx}" fill="{INDIGO}"/>' + mark(32, 32, s)
)

write(f"{OUT}/web/icon.svg", tile(14))
write(f"{OUT}/brand/molbhav-icon.svg", tile(14))
write(f"{OUT}/brand/molbhav-mark.svg", svg(48, 36, mark(24, 18, 1, left="#2b3a8f")))
write(
    f"{OUT}/brand/molbhav-mark-dark.svg",
    svg(48, 36, mark(24, 18, 1, left=WHITE, right="#fbbf24", lens="#10b981", tick="#10132a")),
)

# App Store / Xcode: 1024×1024 opaque (no transparency, no rounded corners — iOS masks).
write(
    f"{OUT}/ios/AppIcon-1024.svg",
    svg(1024, 1024, f'<rect width="1024" height="1024" fill="{INDIGO}"/>' + mark(512, 512, 14)),
)

# Launch splash: deep indigo field, mark centred (2732 covers @3x iPad Pro).
write(
    f"{OUT}/ios/splash-2732.svg",
    svg(2732, 2732, f'<rect width="2732" height="2732" fill="{INDIGO}"/>' + mark(1366, 1366, 18)),
)

print("ok")

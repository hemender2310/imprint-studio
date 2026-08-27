"""
IMPRINT — hero frame analysis.

Measures the properties that decide whether the frames read as macro ink on paper rather than
as a texture swatch: feature scale, size distribution, paper warmth, cyan misregistration, and
— the ones metrics usually miss — how unevenly the ink is distributed across the frame and
whether there is any clean paper left to breathe.

Usage: python scripts/analyse_frames.py [frame_number ...]
"""

from __future__ import annotations

import os
import sys
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES = os.path.join(ROOT, "public", "frames")

PAPER = np.array([0xF2, 0xEE, 0xE6], dtype=np.float32)


def label(mask: np.ndarray):
    """4-neighbour connected components. Returns (labels, [(size, w, h), ...] by id-1)."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    stats = []
    nxt = 1
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or labels[sy, sx]:
                continue
            q = deque([(sy, sx)])
            labels[sy, sx] = nxt
            n = 0
            x0 = x1 = sx
            y0 = y1 = sy
            while q:
                y, x = q.popleft()
                n += 1
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for ny, nx_ in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx_ < w and mask[ny, nx_] and not labels[ny, nx_]:
                        labels[ny, nx_] = nxt
                        q.append((ny, nx_))
            stats.append((n, x1 - x0 + 1, y1 - y0 + 1))
            nxt += 1
    return labels, stats


def largest_rect(binary: np.ndarray) -> int:
    """Area of the largest all-True axis-aligned rectangle (histogram-stack method).

    A connected-component measure is too permissive here: clean tiles thread between blots
    as one winding network, so it reports ~50% however busy the frame is. A rectangle is
    what actually corresponds to an open area you can see.
    """
    h, w = binary.shape
    heights = [0] * w
    best = 0
    for row in binary:
        for i in range(w):
            heights[i] = heights[i] + 1 if row[i] else 0
        stack: list[int] = []
        for i in range(w + 1):
            cur = heights[i] if i < w else 0
            while stack and heights[stack[-1]] >= cur:
                ht = heights[stack.pop()]
                left = stack[-1] + 1 if stack else 0
                best = max(best, ht * (i - left))
            stack.append(i)
    return best


def analyse(path: str) -> None:
    img = Image.open(path).convert("RGB")
    W, H = img.size
    a = np.asarray(img, dtype=np.float32)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    # ── paper warmth: the lightest decile should sit on #F2EEE6, not neutral grey
    light = a[lum >= np.percentile(lum, 90)]
    mean_light = light.mean(axis=0)
    warmth = mean_light[0] - mean_light[2]
    delta = float(np.sqrt(sum((mean_light[i] - PAPER[i]) ** 2 for i in range(3))))
    hexs = "#" + "".join(f"{int(round(v)):02x}" for v in mean_light)

    # ── feature scale, measured at half resolution (1 px here == 2 px in the frame)
    small = np.asarray(img.resize((W // 2, H // 2), Image.LANCZOS).convert("L"), dtype=np.float32)
    ink = small < 110
    labels, stats = label(ink)
    coverage = float(ink.mean())

    widths = sorted((s[1] * 2 / W * 100 for s in stats), reverse=True)
    biggest = widths[0] if widths else 0.0
    band_18_24 = sum(1 for x in widths if 18 <= x <= 24)
    band_8_12 = sum(1 for x in widths if 8 <= x <= 12)
    small_ct = sum(1 for x in widths if x < 8)

    # ── distribution across the frame: a 4x4 grid. Near-zero variance is leopard print.
    gh, gw = ink.shape[0] // 4, ink.shape[1] // 4
    cells = [
        float(ink[j * gh:(j + 1) * gh, i * gw:(i + 1) * gw].mean())
        for j in range(4) for i in range(4)
    ]
    cmin, cmax, cstd = min(cells), max(cells), float(np.std(cells))

    # ── clean paper: the largest CONTIGUOUS AREA containing no blot wider than 4 px.
    # Taking connected components of the complement does not measure this — paper threads
    # between blots as one connected sea, so that always returns ~80% however busy the
    # frame is. Instead tile the frame, mark a tile clean only if it holds no big ink, and
    # find the largest connected run of clean tiles.
    big_ids = {i + 1 for i, st in enumerate(stats) if max(st[1], st[2]) > 2}
    big_mask = np.isin(labels, list(big_ids)) if big_ids else np.zeros_like(ink)
    th, tw = big_mask.shape[0] // 36, big_mask.shape[1] // 64
    tiles = np.array([
        [not big_mask[j * th:(j + 1) * th, i * tw:(i + 1) * tw].any() for i in range(64)]
        for j in range(36)
    ])
    clean_pct = largest_rect(tiles) / tiles.size * 100

    # ── cyan plate: the fringe must exist, and on one side only
    bluish = ((b - r) > 10) & (lum > 70)
    n_blue = int(bluish.sum())
    dark = lum < 70
    side = ""
    if n_blue > 200:
        ys, xs = np.nonzero(bluish)
        up_left = dark[np.clip(ys - 5, 0, H - 1), np.clip(xs - 8, 0, W - 1)].mean()
        down_right = dark[np.clip(ys + 5, 0, H - 1), np.clip(xs + 8, 0, W - 1)].mean()
        side = f"ink up-left {up_left:.0%} vs down-right {down_right:.0%}"

    print(f"\n{os.path.basename(path)}  {W}x{H}")
    print(f"  paper    lightest decile {hexs}  warmth R-B {warmth:+.1f}  dist {delta:.1f}")
    print(f"  ink      coverage {coverage:.1%}  blots {len(stats)}  largest {biggest:.1f}% of width")
    print(f"  sizes    18-24%: {band_18_24}   8-12%: {band_8_12}   under 8%: {small_ct}"
          f"   top5 {[f'{x:.1f}' for x in widths[:5]]}")
    print(f"  spread   4x4 cells min {cmin:.1%} max {cmax:.1%} std {cstd:.3f}")
    print(f"  breathe  largest clean-paper rectangle {clean_pct:.1f}% of frame")
    print(f"  cyan     {n_blue} fringe px ({n_blue / (W * H):.2%})  {side}")


def main() -> None:
    args = sys.argv[1:]
    nums = [int(x) for x in args] if args else [1, 81, 166]
    for n in nums:
        analyse(os.path.join(FRAMES, f"frame_{n:04d}.webp"))


if __name__ == "__main__":
    main()

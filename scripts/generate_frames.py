"""
IMPRINT — hero frame generator.

Produces the scroll-scrubbed hero sequence: ink blooming into paper fibre, printed as two
misregistered plates, with a slow camera pull-back.

HOW THE INK IS BUILT, AND WHY

The original brief called for a Gray-Scott reaction-diffusion field used directly as the ink
mask. Built that way it does not read as ink. Gray-Scott in the coral/worm regime produces a
Turing labyrinth — fine parallel squiggle that looks like a fingerprint — and when seeded with
regions large enough to read as blots, the reaction only sustains itself at the boundaries and
hollows the interiors out into rings. Neither is ink on paper. (It is also expensive: the
labyrinth is maximum-entropy high-frequency detail, which put the sequence at 14.7 MB against
roughly 2 MB for solid masses.)

So the two jobs are split:

  MASS  comes from a multi-octave fBm field thresholded at a level set. Ink spreading through
        paper is a wetting front advancing through a heterogeneous absorbency field, and a
        level set on fractal noise models that fairly well. Because the field is fractal the
        coastline is irregular at every scale — bays, peninsulas and detached islands
        speckling off the edge — which is the thing that actually reads as ink. This is
        emphatically not an expanding radial gradient; nothing here is circular.

  EDGE  comes from Gray-Scott after all. The V field displaces the threshold, so the boundary
        carries the fibrous filigree the reaction genuinely is good at, and it is stepped a
        little each frame so the edge stays alive.

Growth is a falling threshold: each frame the level set is placed at the quantile matching a
target coverage, so the bloom from ~12% to ~22% ink is exact rather than emergent.

COMPOSITION is a third field on top of those two. A level set on plain fBm spreads blots
evenly, which reads as leopard print no matter how good the per-blot numbers are, so a
long-wavelength density field biases the threshold into dense and open passages, and the
emptiest lobes have it pushed beyond the range of the mass field entirely so they carry no
ink at all. See analyse_frames.py for the metrics that catch this.

Output: public/frames/frame_0001.webp ..., public/stills/, and app/data/frames.ts.
"""

from __future__ import annotations

import os
import time

import numpy as np
from PIL import Image

# ---------------------------------------------------------------- configuration

OUT_W, OUT_H = 1280, 720
N_FRAMES = 180

# The world is rendered larger than the output so the camera has somewhere to move.
WORLD_W, WORLD_H = 1620, 912

# Ink mass. The base wavelength sets feature scale: at 26 cells across the world the largest
# blot stays around 17% of frame width, against 50%+ at the 10 cells this started on, which
# read as camouflage rather than ink.
#
# The 8th octave is not decoration. Fine-scale threshold noise severs the thin bridges between
# blots, which is what holds percolation off: at 7 octaves the ink connects into one mass by
# 24% coverage (largest blot 44% of width), at 8 it is still 17% at 28%.
MASS_OCTAVES, MASS_CELLS = 8, 26

# Ink coverage across the sequence. The hero opens with ink already present, and blooms.
# Deliberately low: less ink that is well composed beats more ink spread evenly.
COVERAGE_START, COVERAGE_END = 0.11, 0.19

# ── COMPOSITION ─────────────────────────────────────────────────────────────────────────
# A level set on plain fBm distributes blots evenly, which reads as leopard print however
# good the per-blot numbers look — feature scale, size range and speck count can all be on
# target while the image is still wrong. Two long-wavelength controls fix that:
#
#   DENSITY   biases the threshold so coverage varies across the frame, giving dense
#             passages and open ones instead of one uniform field.
#   SPARSE    pushes the threshold above any possible mass value in the emptiest lobes.
#             Necessary because merely lowering density is not enough — scattered specks
#             still spoil an open area, and the frame needs somewhere to breathe.
DENSITY_OCTAVES, DENSITY_CELLS = 2, 4
DENSITY_STRENGTH = 0.16
SPARSE_P_LO, SPARSE_P_HI = 30, 58   # percentiles of the density field

EDGE_WIDTH = 0.006                   # level-set softness; small, so the boundary stays crisp
HALO_SPREAD, HALO_ALPHA = 3.5, 0.40  # soft wicking fringe outside the crisp core

# Gray-Scott, used for edge character only.
RD_W, RD_H = 550, 310
DU, DV, FEED, KILL = 0.16, 0.08, 0.030, 0.057
RD_WARMUP = 600
RD_PER_FRAME = 3        # keeps the filigree alive without letting it dictate the shape
RD_AMOUNT = 0.030       # how far the RD field displaces the threshold

FINE_OCTAVES, FINE_CELLS = 4, 120
FINE_AMOUNT = 0.020
FIBRE_ON_EDGE = 0.010

PAPER = np.array([0xF2, 0xEE, 0xE6], dtype=np.float32)
INK = np.array([0x17, 0x15, 0x0F], dtype=np.float32)
CYAN = np.array([0x00, 0x90, 0xC1], dtype=np.float32)

# The misregistration that makes this read as printed rather than as abstract shapes. At the
# original 22%/5px the fringe measured correctly one-sided but was too weak to see; 28% at
# 7px puts it around +46 B-R against paper, which is legible.
CYAN_OPACITY = 0.28
CYAN_OFFSET = (7, 4)    # (x, y) px

CAM_SCALE_START, CAM_SCALE_END = 1.18, 1.02
PAN_X_FRAC, PAN_Y_FRAC = 0.08, 0.05

# Per-frame random grain is incompressible and differs every frame, so it dominates WebP
# size. Kept low here; the static CSS grain overlay in the hero scrim carries the rest.
GRAIN_AMOUNT = 0.008
FIBRE_AMOUNT = 0.04

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES_DIR = os.path.join(ROOT, "public", "frames")
STILLS_DIR = os.path.join(ROOT, "public", "stills")
DATA_DIR = os.path.join(ROOT, "app", "data")

rng = np.random.default_rng(20260824)

# ---------------------------------------------------------------- helpers


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def ease_in_out(t: float) -> float:
    return t * t * (3.0 - 2.0 * t)


def resize_f32(field: np.ndarray, w: int, h: int) -> np.ndarray:
    """Bicubic resize of a float32 array, keeping float precision (PIL 'F' mode)."""
    return np.asarray(
        Image.fromarray(field.astype(np.float32), mode="F").resize((w, h), Image.BICUBIC),
        dtype=np.float32,
    )


def value_noise(w: int, h: int, cells_x: int) -> np.ndarray:
    """One octave of value noise: a coarse random lattice, bicubic-upsampled."""
    cells_y = max(2, int(round(cells_x * h / w)))
    lattice = rng.random((cells_y + 1, cells_x + 1)).astype(np.float32)
    return resize_f32(lattice, w, h)


def fbm(w: int, h: int, octaves=3, base_cells=26) -> np.ndarray:
    """Multi-octave additive value noise, normalised to 0..1."""
    total = np.zeros((h, w), dtype=np.float32)
    amp, norm, cells = 1.0, 0.0, base_cells
    for _ in range(octaves):
        total += value_noise(w, h, cells) * amp
        norm += amp
        amp *= 0.5
        cells *= 2
    total /= norm
    lo, hi = float(total.min()), float(total.max())
    return (total - lo) / max(hi - lo, 1e-6)


def laplacian(a: np.ndarray) -> np.ndarray:
    """9-point Laplacian with periodic wrap — no edge seams in the ink field."""
    return (
        -a
        + 0.2 * (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1))
        + 0.05
        * (
            np.roll(np.roll(a, 1, 0), 1, 1)
            + np.roll(np.roll(a, 1, 0), -1, 1)
            + np.roll(np.roll(a, -1, 0), 1, 1)
            + np.roll(np.roll(a, -1, 0), -1, 1)
        )
    )


def normalise_centred(a: np.ndarray) -> np.ndarray:
    lo, hi = float(a.min()), float(a.max())
    return (a - lo) / max(hi - lo, 1e-6) - 0.5


# ---------------------------------------------------------------- paper


def build_paper() -> tuple[np.ndarray, np.ndarray]:
    """Warm paper base: fibre grain and sparse pulp specks. No vignette.

    Returns (rgb_float, fibre_noise_centred) — the fibre field is reused on the ink edge.
    """
    fibre = fbm(WORLD_W, WORLD_H, octaves=3, base_cells=26)
    fibre_c = fibre - 0.5

    # Biased so the LIGHTEST DECILE lands on #F2EEE6, not the peak. The top decile of this
    # distribution sits around fibre_c +0.28, so the centre is offset by 0.55x the amplitude
    # to put that decile at shade 1.0. Paper has to read as the token colour, not as a
    # lighter or greyer neutral.
    shade = 1.0 - FIBRE_AMOUNT * 0.55 + fibre_c * (FIBRE_AMOUNT * 2.0)

    # Sparse darker specks reading as pulp.
    specks = rng.random((WORLD_H, WORLD_W)).astype(np.float32)
    shade = shade * (1.0 - smoothstep(0.9988, 0.99995, specks) * 0.34)

    return np.clip(PAPER[None, None, :] * shade[:, :, None], 0, 255), fibre_c


# ---------------------------------------------------------------- ink


def seed_rd() -> tuple[np.ndarray, np.ndarray]:
    """Seed Gray-Scott from noise rather than discs, so the filigree has no circular bias."""
    m = fbm(RD_W, RD_H, octaves=3, base_cells=16) > 0.58
    u = np.where(m, 0.50, 1.0).astype(np.float32)
    v = np.where(m, 0.25, 0.0).astype(np.float32)
    return u, v


def step_rd(u: np.ndarray, v: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]:
    for _ in range(n):
        uvv = u * v * v
        u = u + (DU * laplacian(u) - uvv + FEED * (1.0 - u))
        v = v + (DV * laplacian(v) + uvv - (FEED + KILL) * v)
        np.clip(u, 0.0, 1.0, out=u)
        np.clip(v, 0.0, 1.0, out=v)
    return u, v


# ---------------------------------------------------------------- camera


def crop_box(t: float) -> tuple[float, float, float, float]:
    e = ease_in_out(t)
    scale = CAM_SCALE_START + (CAM_SCALE_END - CAM_SCALE_START) * e

    win_w = OUT_W * (CAM_SCALE_START / scale)
    win_h = win_w * OUT_H / OUT_W

    pan_x, pan_y = OUT_W * PAN_X_FRAC, OUT_H * PAN_Y_FRAC
    x0 = (WORLD_W - win_w) * 0.5 - pan_x * 0.5 + pan_x * e
    y0 = (WORLD_H - win_h) * 0.5 - pan_y * 0.5 + pan_y * e

    x0 = float(np.clip(x0, 0, WORLD_W - win_w))
    y0 = float(np.clip(y0, 0, WORLD_H - win_h))
    return x0, y0, x0 + win_w, y0 + win_h


# ---------------------------------------------------------------- render


def main() -> None:
    started = time.time()
    for d in (FRAMES_DIR, STILLS_DIR, DATA_DIR):
        os.makedirs(d, exist_ok=True)
    for stale in os.listdir(FRAMES_DIR):
        if stale.endswith(".webp"):
            os.remove(os.path.join(FRAMES_DIR, stale))

    print(f"paper  {WORLD_W}x{WORLD_H}")
    paper, fibre_c = build_paper()

    print(f"mass   fbm {MASS_OCTAVES} octaves @ {MASS_CELLS} cells")
    mass = fbm(WORLD_W, WORLD_H, octaves=MASS_OCTAVES, base_cells=MASS_CELLS)
    fine = fbm(WORLD_W, WORLD_H, octaves=FINE_OCTAVES, base_cells=FINE_CELLS) - 0.5

    print(f"comp   density {DENSITY_OCTAVES} octaves @ {DENSITY_CELLS} cells")
    density = fbm(WORLD_W, WORLD_H, octaves=DENSITY_OCTAVES, base_cells=DENSITY_CELLS)
    sparse = smoothstep(
        float(np.percentile(density, SPARSE_P_HI)),
        float(np.percentile(density, SPARSE_P_LO)),
        density,
    )
    # Subtracting a full 1.0 in the sparsest lobes puts the threshold beyond the range of
    # `mass` entirely, so those regions carry no ink at all rather than faint ink.
    composed = mass + (density - 0.5) * DENSITY_STRENGTH - sparse

    print(f"edge   gray-scott {RD_W}x{RD_H}, warmup {RD_WARMUP}")
    u, v = seed_rd()
    u, v = step_rd(u, v, RD_WARMUP)

    static_jitter = fine * FINE_AMOUNT + fibre_c * FIBRE_ON_EDGE

    for i in range(N_FRAMES):
        t = i / (N_FRAMES - 1)

        u, v = step_rd(u, v, RD_PER_FRAME)
        jitter = static_jitter + normalise_centred(resize_f32(v, WORLD_W, WORLD_H)) * RD_AMOUNT

        # Falling level set: put the threshold at the quantile matching target coverage, so
        # the bloom is exact rather than emergent.
        coverage = COVERAGE_START + (COVERAGE_END - COVERAGE_START) * t
        # Quantile of the composed field, so overall coverage stays exact even though the
        # density bias moves ink around within the frame.
        level = float(np.quantile(composed, 1.0 - coverage))

        core = smoothstep(level - EDGE_WIDTH + jitter, level + EDGE_WIDTH + jitter, composed)
        halo = (
            smoothstep(
                level - EDGE_WIDTH * HALO_SPREAD + jitter,
                level + EDGE_WIDTH + jitter,
                composed,
            )
            * HALO_ALPHA
        )
        alpha = np.clip(core + halo * (1.0 - core), 0.0, 1.0)

        canvas = paper.copy()
        a_cyan = np.roll(np.roll(alpha, CYAN_OFFSET[1], 0), CYAN_OFFSET[0], 1) * CYAN_OPACITY
        canvas = canvas * (1.0 - a_cyan[:, :, None]) + CYAN[None, None, :] * a_cyan[:, :, None]
        a_ink = alpha[:, :, None]
        canvas = canvas * (1.0 - a_ink) + INK[None, None, :] * a_ink

        img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), mode="RGB")
        img = img.resize((OUT_W, OUT_H), Image.LANCZOS, box=crop_box(t))

        arr = np.asarray(img, dtype=np.float32)
        grain = (rng.random((OUT_H, OUT_W, 1)).astype(np.float32) - 0.5) * (255.0 * GRAIN_AMOUNT)
        arr = np.clip(arr + grain, 0, 255).astype(np.uint8)

        Image.fromarray(arr, mode="RGB").save(
            os.path.join(FRAMES_DIR, f"frame_{i + 1:04d}.webp"), "WEBP", quality=76, method=4
        )

        if (i + 1) % 30 == 0 or i == 0:
            print(f"  frame {i + 1:>3}/{N_FRAMES}  ink {float((alpha > 0.5).mean()):.3f}")

    # Stills at roughly 25% / 55% / 80%, for the cursor trail and the reduced-motion hero.
    for n, frac in enumerate((0.25, 0.55, 0.80), start=1):
        idx = max(1, min(N_FRAMES, int(round(frac * N_FRAMES))))
        Image.open(os.path.join(FRAMES_DIR, f"frame_{idx:04d}.webp")).save(
            os.path.join(STILLS_DIR, f"still-{n:02d}.webp"), "WEBP", quality=84
        )

    files = [f for f in os.listdir(FRAMES_DIR) if f.endswith(".webp")]
    count = len(files)
    size_mb = sum(os.path.getsize(os.path.join(FRAMES_DIR, f)) for f in files) / (1024 * 1024)

    with open(os.path.join(DATA_DIR, "frames.ts"), "w", encoding="utf-8") as fh:
        fh.write(
            "// Generated by scripts/generate_frames.py — do not edit by hand.\n"
            "// Counted from files on disk, so it can never drift from public/frames.\n"
            f"export const FRAME_COUNT = {count};\n"
            "export const FRAME_DIR = '/frames';\n\n"
            "export function framePath(index: number): string {\n"
            "  return `${FRAME_DIR}/frame_${String(index + 1).padStart(4, '0')}.webp`;\n"
            "}\n"
        )

    print(f"\ndone   {count} frames · {size_mb:.1f} MB · {time.time() - started:.1f}s")
    print(f"       wrote app/data/frames.ts with FRAME_COUNT = {count}")


if __name__ == "__main__":
    main()

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { RegMark } from './RegMarks';
import { FRAME_COUNT, framePath } from '../data/frames';
import { STRIDE } from './framePreload';
import { subscribeTick, useReducedMotionFlag } from './useSectionProgress';
import type { Project } from '../data/projects';
import type { BrandAssets } from '../data/brandAssets';

const PAPER = '#F2EEE6';
const INK = '#17150F';
const EASE = [0.16, 1, 0.3, 1] as const;

/** Source frames are 1280px wide; a 2x backing store buys nothing and costs 4x the fill. */
const MAX_DPR = 1.5;

/**
 * A DIFFERENT SLICE OF THE SEQUENCE PER BRAND.
 *
 * Scrubbing frames 0-140 on every project page would reveal all six brands through the
 * identical blot pattern, and six pages built from one animation read as one template — the
 * same failure the six compositional systems exist to avoid. Each brand takes its own ~130
 * frame window, so the scrub feels the same length everywhere and the reveal never repeats.
 * Indexed by position in projects.ts, and asserted to be six distinct starts.
 */
export const BRAND_FRAMES: Record<string, [number, number]> = {
  vyntrix: [0, 130],
  vaelcron: [12, 142],
  rethread: [24, 154],
  voyaze: [36, 166],
  voxaris: [48, 178],
  sentinel: [8, 138],
};

/**
 * THE INK IS A TRANSITION, NOT A BACKGROUND.
 *
 * Masked by the ink alone, every hero sat between 20% and 47% revealed at any scroll position
 * — six pages of the same grey blot field with slivers of photograph in it, which is the home
 * page's background wearing six different hats. The animation was right; the destination was
 * wrong. The mask now OPENS: the ink still does the revealing on the way up, but a
 * scroll-driven floor lifts underneath it until, past 0.55, there is no mask left and the
 * photograph is simply the page.
 *
 *   0.00   ~15% revealed — the brand arriving through the ink
 *   0.35   ~65%
 *   0.55   100%, mask fully open
 *   ->1.0  clean photograph, full bleed
 */
const REVEAL_DONE = 0.55;

/** Resolution the published reveal figure is measured at. */
const TINY_W = 48;
const TINY_H = 30;

/**
 * Waypointed rather than a single exponent: the brief's three numbers are the testable part,
 * and no plain ease passes through all of them. Smooth into the first waypoint, ease OUT of
 * the second so the last of the mask dissolves instead of snapping open.
 */
function revealFloor(p: number): number {
  const t = p <= 0 ? 0 : p >= REVEAL_DONE ? 1 : p / REVEAL_DONE;
  // 0.636 is where progress 0.35 lands on the normalised ramp. The floor there is 0.60, not
  // the 0.65 target, because max() adds only what the ink already exceeds it by — measured,
  // 0.60 lands the frame at 65% revealed.
  const KNEE = 0.636;
  const AT_KNEE = 0.6;
  if (t <= KNEE) {
    const u = t / KNEE;
    return AT_KNEE * (u * u * (3 - 2 * u));
  }
  const u = (t - KNEE) / (1 - KNEE);
  return AT_KNEE + (1 - AT_KNEE) * (1 - (1 - u) ** 3);
}

/** Beat 1 copy, at the top of the reveal. */
const BEAT1_IN = 0;
const BEAT1_OUT = 0.16;
/** Beat 2 copy, held from here to the end of the track. */
const BEAT2_IN = 0.72;
const BEAT2_FULL = 0.88;

const COPY = '#F8F2E8';

const srgb = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const relLum = (r: number, g: number, b: number) =>
  0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const COPY_LUM = relLum(0xf8, 0xf2, 0xe8);
const INK_RGB = [0x17, 0x15, 0x0f] as const;

/**
 * THE ACCENT GRADE IS SCALED BY THE ACCENT'S OWN SATURATION.
 *
 * At a flat 18% the grade lands very differently depending on what colour it is made of. A
 * muted accent reads as a wash; a saturated one takes the photograph with it — Vyntrix's
 * monochrome shoe came out sickly green, Rethread's warm storefront was pushed green, and
 * Voxaris was heavily tinted, while gold, coral and indigo sat correctly at the same number.
 * Scaling by saturation makes the grade's STRENGTH constant rather than its opacity.
 */
function accentAlpha(hexStr: string): number {
  const n = parseInt(hexStr.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mx = Math.max(r, g, b);
  const sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
  const a = 0.18 * (1 - sat * 0.55);
  return Math.min(0.18, Math.max(0.07, a));
}

/**
 * Brands pinned to the 0.07 floor, decided by looking at the graded frame rather than only at
 * the number. Volt and phosphor are both greens laid over pictures that are essentially
 * neutral — a monochrome studio shot and a near-black emblem — so even at the formula's 0.11
 * the grade is the only colour in the frame and reads as a cast rather than a tint. Pinning
 * the two rather than widening the formula keeps it honest for the four it already suits.
 */
const ACCENT_FLOOR = new Set<string>(['vyntrix', 'voxaris']);

/**
 * The scrim alpha that brings beat copy to 6:1 over THIS brand's composite.
 *
 * A fixed scrim cannot serve six photographs. Vyntrix's rooftop is nearly black and a heavy
 * scrim crushes it to mud; Voyaze's coastline is bright and a light one leaves the headline
 * unreadable. So the alpha is solved from the measured luminance of the region the copy
 * actually lands in, rather than assumed.
 */
function solveScrim(meanR: number, meanG: number, meanB: number) {
  for (let a = 0.45; a <= 0.8501; a += 0.01) {
    const r = meanR * (1 - a) + INK_RGB[0] * a;
    const g = meanG * (1 - a) + INK_RGB[1] * a;
    const b = meanB * (1 - a) + INK_RGB[2] * a;
    if (contrast(COPY_LUM, relLum(r, g, b)) >= 6) return { alpha: +a.toFixed(2), pinned: false };
  }
  // Nothing in range reached 6:1 — the photograph is fighting the type, and clamping silently
  // would hide that. The caller reports it.
  return { alpha: 0.85, pinned: true };
}

export default function BrandHero({
  project,
  assets,
}: {
  project: Project;
  assets: BrandAssets | undefined;
}) {
  const maskId = `ink-mask-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionFlag();
  const [ready, setReady] = useState(false);

  /**
   * The beats read the SAME value the canvas scrubs on, written once per tick by the effect
   * below. useSectionProgress measures an element's passage through the viewport, which for a
   * 300vh sticky track is already past 0.16 on the very first frame — beat 1 mounted at
   * opacity 0 and never appeared. This is the track's own scroll, 0 at the top and 1 when the
   * sticky panel releases, which is exactly what the frame index uses.
   */
  const progress = useMotionValue(0);

  // Beat opacity/offset ride the same shared progress value; no second scroll source.
  const b1o = useTransform(progress, [BEAT1_IN, BEAT1_OUT], [1, 0], { clamp: true });
  const b1y = useTransform(progress, [BEAT1_IN, BEAT1_OUT], [0, -60], { clamp: true });
  const b2o = useTransform(progress, [BEAT2_IN, BEAT2_FULL], [0, 1], { clamp: true });

  const hero = assets?.hero ?? null;
  const accent = assets?.accent ?? project.accent;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hero) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const [FROM, TO] = BRAND_FRAMES[project.slug] ?? [0, Math.min(140, FRAME_COUNT - 1)];
    const mv = progress;
    const gradeAlpha = ACCENT_FLOOR.has(project.slug) ? 0.07 : accentAlpha(accent);
    const SPAN = TO - FROM;

    const photo = new window.Image();
    let photoOK = false;
    photo.onload = () => {
      photoOK = photo.naturalWidth > 0;
      redraw();
    };
    photo.src = hero;

    const frames: (HTMLImageElement | undefined)[] = new Array(FRAME_COUNT);
    const wanted = { current: FROM };
    const painted = { current: -1 };
    const size = { w: 0, h: 0 };

    // One offscreen buffer, reused: the composite is photo -> mask -> tint, and doing that on
    // the visible canvas would show each stage for a frame.
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d');
    // A second buffer for the mask itself. The floor cannot be applied to the frame inline —
    // it has to be combined with the frame's own luminance BEFORE that luminance becomes
    // alpha — so the frame is drawn here, clamped, and then used as the mask source.
    const maskCv = document.createElement('canvas');
    const maskCtx = maskCv.getContext('2d');
    const tiny = document.createElement('canvas');
    tiny.width = TINY_W;
    tiny.height = TINY_H;
    const tinyCtx = tiny.getContext('2d', { willReadFrequently: true });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      size.w = canvas.clientWidth;
      size.h = canvas.clientHeight;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      off.width = canvas.width;
      off.height = canvas.height;
      offCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      maskCv.width = canvas.width;
      maskCv.height = canvas.height;
      maskCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const isReady = (img: HTMLImageElement | undefined): img is HTMLImageElement =>
      !!img && img.complete && img.naturalWidth > 0;

    /** Nearest loaded neighbour, so the coarse pass is usable before the backfill lands. */
    const nearestReady = (index: number): HTMLImageElement | undefined => {
      if (isReady(frames[index])) return frames[index];
      for (let d = 1; d <= STRIDE; d++) {
        if (isReady(frames[index - d])) return frames[index - d];
        if (isReady(frames[index + d])) return frames[index + d];
      }
      return undefined;
    };

    const cover = (
      c: CanvasRenderingContext2D,
      img: HTMLImageElement,
      scale: number,
      dx = 0,
      dy = 0
    ) => {
      const s = Math.max(size.w / img.naturalWidth, size.h / img.naturalHeight) * scale;
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      c.drawImage(img, (size.w - w) / 2 + dx, (size.h - h) / 2 + dy, w, h);
    };

    /**
     * Returns true only when a real frame was composited, false when it fell back to paper.
     * The loop retries its target on EVERY tick and advances the tracker only on true —
     * otherwise it claims a frame within milliseconds of mount, long before the image has
     * downloaded, and the hero stays blank on a fresh load.
     */
    const draw = (index: number, p: number, gradeOff = false): boolean => {
      if (!offCtx || !maskCtx || size.w === 0 || size.h === 0) return false;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, size.w, size.h);
      if (!photoOK) return false;
      const frame = nearestReady(index);
      if (!frame) return false;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      // 1. the photograph. Ken Burns runs across the WHOLE range now, not just the masked
      //    part, so the shot is still moving after the ink has gone: 1.10 -> 1.00 with a 2%
      //    drift, both eased so neither arrives at a stop.
      const ke = 1 - (1 - p) ** 3;
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      offCtx.globalCompositeOperation = 'source-over';
      offCtx.clearRect(0, 0, size.w, size.h);
      cover(offCtx, photo, 1.1 - 0.1 * ke, size.w * 0.02 * (ke - 0.5), size.h * 0.012 * (0.5 - ke));

      // 2. the mask: alpha = max(inkAlpha, revealFloor(p)).
      //
      //    Done in the LUMINANCE domain, before luminance becomes alpha. The frames are dark
      //    ink on light paper and the SVG filter writes alpha = 1 - luminance, so a floor f on
      //    alpha is a ceiling of (1 - f) on luminance — which is exactly a `darken` blend
      //    against a flat grey. Compositing the floor as a separate translucent layer would
      //    have been a cross-fade: the photo would appear THROUGH the paper rather than the
      //    blots opening outward. This way the blots' own soft edges cross the clamp one after
      //    another, so the revealed region grows out of the ink.
      const floor = revealFloor(p);
      maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      maskCtx.globalCompositeOperation = 'source-over';
      maskCtx.clearRect(0, 0, size.w, size.h);
      cover(maskCtx, frame, 1);
      if (floor > 0) {
        const g = Math.round(255 * (1 - floor));
        maskCtx.globalCompositeOperation = 'darken';
        maskCtx.fillStyle = `rgb(${g},${g},${g})`;
        maskCtx.fillRect(0, 0, size.w, size.h);
        maskCtx.globalCompositeOperation = 'source-over';
      }

      // `destination-in` masks by the source's ALPHA, and the frames are fully opaque WebPs —
      // inverting their COLOUR with filter:invert(1) does nothing to alpha, so the mask was a
      // no-op and every composite came back as the bare photograph. The colour matrix is the
      // piece that was missing.
      if (floor < 0.999) {
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.filter = `url(#${maskId})`;
        offCtx.drawImage(maskCv, 0, 0, size.w, size.h);
        offCtx.filter = 'none';
      }

      // How much of the frame the mask is actually letting through, published for assertion.
      //
      // NOT measurable from the visible canvas by distance-from-paper: even fully concealed,
      // the frames' own paper sits at luminance ~0.93, so alpha is ~0.07 rather than 0 and a
      // dark photograph bleeding through at 7% already moves a pixel far enough from #F2EEE6
      // to be counted as "photograph". Alpha IS the mix weight, so it is the honest number.
      if (floor >= 0.999) {
        canvas.dataset.reveal = '1';
      } else if (tinyCtx) {
        // Off a 48x30 downsample, not the full buffer. Reading 2.9M pixels every frame pinned
        // the main thread hard enough that the page never reached network idle.
        tinyCtx.globalCompositeOperation = 'source-over';
        tinyCtx.clearRect(0, 0, TINY_W, TINY_H);
        tinyCtx.drawImage(maskCv, 0, 0, TINY_W, TINY_H);
        const md = tinyCtx.getImageData(0, 0, TINY_W, TINY_H).data;
        let sum = 0;
        for (let i = 0; i < md.length; i += 4) {
          sum += 1 - (0.2126 * md[i] + 0.7152 * md[i + 1] + 0.0722 * md[i + 2]) / 255;
        }
        canvas.dataset.reveal = (sum / (md.length / 4)).toFixed(4);
      }

      // 3. the brand accent, on the revealed region only
      if (!gradeOff) {
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.globalAlpha = gradeAlpha;
        offCtx.fillStyle = accent;
        offCtx.fillRect(0, 0, size.w, size.h);
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'source-over';
      }

      // 4. onto the visible canvas, over paper
      ctx.drawImage(off, 0, 0, size.w, size.h);
      return true;
    };

    /**
     * Measure the composite where the copy lands and set the scrim from it. Runs once, after
     * the first real composite — before that there is nothing to measure.
     */
    let scrimDone = false;
    const setScrims = () => {
      if (scrimDone || !offCtx) return;
      /**
       * Sample the box the copy ACTUALLY occupies, read off the DOM, rather than a nominal
       * third of the frame — and solve against the 85th percentile rather than the mean. A
       * mean is comfortably dark while a bright blot behind two words is what the reader's
       * eye lands on, and contrast is a worst-case measure, not an average one.
       */
      const sample = (p: number, sel: string, fallback: [number, number, number, number]) => {
        const idx = Math.round(FROM + p * SPAN);
        if (!draw(idx, p)) return null;
        const el = document.querySelector(sel) as HTMLElement | null;
        const host = canvas.getBoundingClientRect();
        let x = fallback[0] * size.w;
        let y = fallback[1] * size.h;
        let w = fallback[2] * size.w;
        let h = fallback[3] * size.h;
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 8 && r.height > 8) {
            x = r.left - host.left;
            y = r.top - host.top;
            w = r.width;
            h = r.height;
          }
        }
        x = Math.max(0, Math.min(size.w - 4, x));
        y = Math.max(0, Math.min(size.h - 4, y));
        w = Math.max(4, Math.min(size.w - x, w));
        h = Math.max(4, Math.min(size.h - y, h));
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const d = ctx.getImageData(
          Math.round(x * dpr),
          Math.round(y * dpr),
          Math.round(w * dpr),
          Math.round(h * dpr)
        ).data;
        const px: [number, number, number, number][] = [];
        for (let i = 0; i < d.length; i += 4 * 5) {
          px.push([
            0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2],
            d[i],
            d[i + 1],
            d[i + 2],
          ]);
        }
        if (!px.length) return null;
        px.sort((a, b2) => a[0] - b2[0]);
        const hi = px[Math.round(0.85 * (px.length - 1))];
        return [hi[1], hi[2], hi[3]] as [number, number, number];
      };

      // How far the grade moves the picture's colour, measured on the composite the visitor
      // sees rather than inferred from the fill. Sampled at 0.85, where the mask is fully open
      // and the photograph is all there is, so the figure is about the grade and not about
      // how much paper is still showing.
      const meanRGB = (gradeOff: boolean) => {
        const idx = Math.round(FROM + 0.85 * SPAN);
        if (!draw(idx, 0.85, gradeOff)) return null;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const d = ctx.getImageData(
          0,
          0,
          Math.round(size.w * dpr),
          Math.round(size.h * dpr)
        ).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4 * 17) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          n++;
        }
        return n ? [r / n, g / n, b / n] : null;
      };
      const plain = meanRGB(true);
      const graded = meanRGB(false);
      if (plain && graded && canvas) {
        // Opponent chroma, so a hue can be taken from a mean colour without the instability
        // of an HSV hue near the grey axis.
        const opp = ([r, g, b]: number[]) => [r - g, (r + g) / 2 - b];
        const [pa, pb] = opp(plain);
        const [ga, gb] = opp(graded);
        const deg = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;
        let shift = Math.abs(deg(ga, gb) - deg(pa, pb)) % 360;
        if (shift > 180) shift = 360 - shift;
        canvas.dataset.accentAlpha = gradeAlpha.toFixed(3);
        canvas.dataset.hueShift = shift.toFixed(1);
        canvas.dataset.baseChroma = Math.hypot(pa, pb).toFixed(1);
        // Hue shift is undefined on a neutral picture: Vaelcron's mean colour carries a
        // chroma of 0.8, so the grade rotates an angle that was never there and the figure
        // comes out at 127 degrees for a frame that looks correct. How much colour the grade
        // ADDS is the measure that means the same thing on every one of the six.
        canvas.dataset.chromaAdded = (Math.hypot(ga, gb) - Math.hypot(pa, pb)).toFixed(1);
      }

      const one = sample(0.08, '[data-brand-beat="1"]', [0.04, 0.62, 0.36, 0.3]);
      const two = sample(0.8, '[data-brand-summary]', [0.2, 0.4, 0.6, 0.2]);
      if (!one || !two) return;
      const s1 = solveScrim(one[0], one[1], one[2]);
      const s2 = solveScrim(two[0], two[1], two[2]);
      if (scrimRef.current) {
        scrimRef.current.style.setProperty('--scrim', String(s1.alpha));
        scrimRef.current.dataset.scrimAlpha = String(s1.alpha);
        scrimRef.current.dataset.scrimPinned = s1.pinned ? 'true' : 'false';
      }
      if (backdropRef.current) {
        backdropRef.current.style.setProperty('--backdrop', String(s2.alpha));
        backdropRef.current.dataset.backdropAlpha = String(s2.alpha);
        backdropRef.current.dataset.backdropPinned = s2.pinned ? 'true' : 'false';
      }
      scrimDone = true;
      setReady(true);
    };

    const redraw = () => {
      const p = clamp(currentP());
      mv.set(p);
      const idx = Math.round(FROM + p * SPAN);
      wanted.current = idx;
      if (draw(idx, p)) {
        painted.current = idx;
        canvas.dataset.painted = '1';
        setScrims();
      }
    };

    const load = (index: number) =>
      new Promise<void>((resolve) => {
        if (frames[index]) return resolve();
        const img = new window.Image();
        frames[index] = img;
        img.onload = () => {
          if (wanted.current === index) redraw();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = framePath(index);
      });

    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const currentP = () => {
      const track = trackRef.current;
      if (!track) return 0;
      const r = track.getBoundingClientRect();
      const range = track.offsetHeight - window.innerHeight;
      return range > 0 ? clamp(-r.top / range) : 0;
    };

    resize();

    // Coarse pass across THIS brand's window only, then a batched backfill. There is no point
    // fetching the frames this page never shows.
    const coarse: number[] = [];
    for (let i = FROM; i <= TO; i += STRIDE) coarse.push(i);
    void Promise.allSettled(coarse.map(load)).then(async () => {
      const rest: number[] = [];
      for (let i = FROM; i <= TO; i++) if (!frames[i]) rest.push(i);
      const BATCH = 12;
      for (let i = 0; i < rest.length; i += BATCH) {
        await Promise.allSettled(rest.slice(i, i + BATCH).map(load));
      }
    });

    if (reduced) {
      // One static mid-sequence composite, both beats visible, no scrub and no updates.
      const paintOnce = () => {
        // Past REVEAL_DONE, so the static frame is the photograph rather than a frozen
        // half-open mask — the destination, which is what the animation was heading for.
        const idx = Math.round(FROM + 0.8 * SPAN);
        if (draw(idx, 0.8)) {
          painted.current = idx;
          canvas.dataset.painted = '1';
          setScrims();
        }
      };
      paintOnce();
      const settle = window.setInterval(() => {
        if (painted.current >= 0) window.clearInterval(settle);
        else paintOnce();
      }, 200);
      const onResizeStatic = () => {
        resize();
        paintOnce();
      };
      window.addEventListener('resize', onResizeStatic);
      return () => {
        window.clearInterval(settle);
        window.removeEventListener('resize', onResizeStatic);
      };
    }

    const unsubscribe = subscribeTick(redraw);
    const onResize = () => {
      resize();
      redraw();
    };
    window.addEventListener('resize', onResize);
    return () => {
      unsubscribe();
      window.removeEventListener('resize', onResize);
    };
  }, [hero, accent, project.slug, reduced, progress, maskId]);

  // No hero asset: the page falls back to board 01w, handled by the caller.
  if (!hero) return null;

  const identity = (
    <>
      <div
        style={{
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '0.68rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: accent,
          marginBottom: '1.4rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.7rem',
        }}
      >
        <RegMark size={11} color={accent} />
        {project.categories}
      </div>
      <h1
        data-brand-hero-name=""
        style={{
          fontFamily: 'var(--font-instrument), serif',
          fontSize: 'clamp(2.4rem, 7vw, 6rem)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: COPY,
          margin: '0 0 1.2rem',
        }}
      >
        {project.name}
      </h1>
      <div
        style={{
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '0.68rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: COPY,
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          flexWrap: 'wrap',
          opacity: 0.86,
        }}
      >
        <span>{project.sector}</span>
        <RegMark size={10} color={accent} />
        <span>{project.year}</span>
      </div>
    </>
  );

  return (
    <div
      ref={trackRef}
      data-brand-hero-track=""
      data-brand-hero-ready={ready ? 'true' : 'false'}
      /* Exposed so the assertion that no two brands share a reveal can read it from the page
         rather than from the source it is supposed to be checking. */
      data-brand-frames={(BRAND_FRAMES[project.slug] ?? []).join('-')}
      style={{ height: reduced ? '100svh' : '300vh', position: 'relative' }}
    >
      <div
        data-brand-hero=""
        style={{
          position: reduced ? 'relative' : 'sticky',
          top: 0,
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          background: PAPER,
        }}
      >
        {/*
          alpha = 1 - luminance. Canvas 2D has no luminance-to-alpha operation of its own and
          CSS filters cannot invent alpha, so the mask is defined once here and referenced by
          ctx.filter. Zero-sized and aria-hidden: it is a definition, not a graphic.
        */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <filter id={maskId} colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      -0.2126 -0.7152 -0.0722 0 1"
            />
          </filter>
        </svg>

        <canvas
          ref={canvasRef}
          data-brand-canvas=""
          role="presentation"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        />

        {/*
          Transparent at BOTH edges, densest through the middle. The alpha is set from the
          measured composite; the shape is fixed so no edge of the scrim can ever land as a
          seam against the page below.
        */}
        <div
          ref={scrimRef}
          data-brand-scrim=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            ['--scrim' as string]: '0.6',
            background:
              `linear-gradient(to bottom, transparent 0%, ` +
              `rgba(23,21,15,calc(var(--scrim) * 0.5)) 18%, ` +
              `rgba(23,21,15,var(--scrim)) 52%, ` +
              `rgba(23,21,15,calc(var(--scrim) * 0.55)) 80%, transparent 100%)`,
          }}
        />

        <motion.div
          data-brand-beat="1"
          initial={false}
          style={{
            position: 'absolute',
            left: 'clamp(1.5rem, 5vw, 4rem)',
            bottom: 'clamp(3rem, 12vh, 8rem)',
            right: 'clamp(1.5rem, 5vw, 4rem)',
            maxWidth: '38rem',
            opacity: reduced ? 1 : b1o,
            y: reduced ? 0 : b1y,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, delay: 0.05, ease: EASE }}
          >
            {identity}
          </motion.div>
        </motion.div>

        <motion.div
          data-brand-beat="2"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 clamp(1.5rem, 6vw, 5rem)',
            opacity: reduced ? 1 : b2o,
            pointerEvents: 'none',
          }}
        >
          <div
            ref={backdropRef}
            data-brand-backdrop=""
            style={{
              ['--backdrop' as string]: '0.6',
              padding: 'clamp(2rem, 6vw, 4rem) clamp(2.5rem, 8vw, 6rem)',
              // farthest-side, or the default farthest-corner leaves the ramp part-opaque
              // where the box ends and the backdrop reads as a hard rectangle.
              background:
                `radial-gradient(ellipse farthest-side at center, ` +
                `rgba(23,21,15,var(--backdrop)) 0%, ` +
                `rgba(23,21,15,calc(var(--backdrop) * 0.74)) 40%, ` +
                `rgba(23,21,15,calc(var(--backdrop) * 0.36)) 66%, ` +
                `rgba(23,21,15,calc(var(--backdrop) * 0.1)) 86%, transparent 100%)`,
            }}
          >
            <p
              data-brand-summary=""
              style={{
                fontFamily: 'var(--font-instrument), serif',
                fontSize: 'clamp(1.4rem, 3.4vw, 2.6rem)',
                lineHeight: 1.25,
                textAlign: 'center',
                color: COPY,
                margin: 0,
                maxWidth: '34ch',
                textShadow: '0 1px 14px rgba(23,21,15,0.8)',
              }}
            >
              {project.summary}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

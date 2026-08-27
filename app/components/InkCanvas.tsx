'use client';

import { useEffect, useRef } from 'react';

import { FRAME_COUNT, framePath } from '../data/frames';
import { COARSE_INDICES, STRIDE } from './framePreload';
import { subscribeTick } from './useSectionProgress';

const PAPER = '#F2EEE6';

/** Source frames are 1280px wide; a 2x backing store buys nothing and costs 4x the fill. */
const MAX_DPR = 1.5;

/**
 * How the sequence is spread across the document. The hero gets the first 72%; everything
 * below it shares the remaining 28%, so the ink keeps blooming gently all the way down
 * instead of freezing the moment the hero ends.
 */
const HERO_SHARE = 0.72;

/** The veil ramps in across the last stretch of the hero, in viewport heights. */
const VEIL_RAMP_VH = 0.4;
const VEIL_MAX = 0.88;

/**
 * Below the hero the veil leaves only ~12% of the ink, and at that strength the fractal
 * coastline and the cyan misregistration are gone — what is left reads as grey camouflage
 * rather than print. Lowering the veil would only make bigger stains, so the ink is softened
 * instead: a blur ramped by the same value turns defined blobs into a watermark.
 *
 * One CSS filter on a single fixed layer — one composited pass, not per-frame work.
 */
const BLUR_MAX_PX = 7;

/**
 * ...and the cyan plate is composited SEPARATELY, above the veil.
 *
 * It cannot be rescued from underneath. The veil is warm paper — R exceeds B by 12 — so at
 * 0.88 it contributes -10.6 to any blue-over-red measurement, while everything beneath it is
 * scaled to 0.12. Measured, boosting the canvas alone left the fringe at -7: still red-biased.
 * So a second thin layer sits ON TOP of the veil, drawing the same frame at high saturation
 * with `mix-blend-mode: color` — it lends hue and chroma while taking luminosity from what is
 * already there, so the fringe returns without darkening the page.
 */
const CYAN_SATURATE = 6;
const CYAN_LAYER_ALPHA = 0.5;

/**
 * The ink runs behind the WHOLE page, not just the hero.
 *
 * Previously the canvas lived inside the hero's 500vh container, and where that container
 * ended the darkest row of the hero scrim met the lightest cream of the page — a hard seam.
 * Moving the canvas to a fixed layer under everything removes the boundary rather than
 * disguising it: there is nothing left to butt against. A paper veil fades in over the last
 * 40vh of the hero so the ink recedes gradually instead of being cut.
 *
 * Every safeguard from the original hero canvas is kept: the boolean-returning draw, the
 * wanted-index ref, the redraw-every-tick retry, the two-pass batched preload and the DPR
 * cap. It rides the shared measurement loop, so it adds no listener and no second rAF.
 */
export default function InkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const cyanRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const veil = veilRef.current;
    const cyan = cyanRef.current;
    if (!canvas || !veil || !cyan) return;
    const ctx = canvas.getContext('2d');
    const cyanCtx = cyan.getContext('2d');
    if (!ctx || !cyanCtx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const images: (HTMLImageElement | undefined)[] = new Array(FRAME_COUNT);
    const wanted = { current: reduced ? Math.floor(FRAME_COUNT / 2) : 0 };
    /** How strongly the separate cyan layer is showing, written by the ticker. */
    const cyanStrength = { current: 0 };
    const painted = { current: -1 };
    const size = { w: 0, h: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      size.w = canvas.clientWidth;
      size.h = canvas.clientHeight;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The cyan layer only ever carries a soft fringe, so it runs at half resolution.
      cyan.width = Math.round((size.w * dpr) / 2);
      cyan.height = Math.round((size.h * dpr) / 2);
      cyanCtx.setTransform(dpr / 2, 0, 0, dpr / 2, 0, 0);
    };

    const isReady = (img: HTMLImageElement | undefined): img is HTMLImageElement =>
      !!img && img.complete && img.naturalWidth > 0;

    /** Nearest loaded neighbour, so the coarse pass is usable before the backfill lands. */
    const nearestReady = (index: number): HTMLImageElement | undefined => {
      if (isReady(images[index])) return images[index];
      for (let d = 1; d <= STRIDE; d++) {
        if (isReady(images[index - d])) return images[index - d];
        if (isReady(images[index + d])) return images[index + d];
      }
      return undefined;
    };

    /**
     * Returns true only when a real frame was painted, false when it painted the paper
     * fallback. The loop retries its target on EVERY tick and advances the tracker only on
     * true — otherwise it claims index 0 within milliseconds of mount, long before
     * frame_0001.webp has downloaded, and the canvas stays blank on every fresh load.
     */
    const draw = (index: number): boolean => {
      if (size.w === 0 || size.h === 0) return false;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, size.w, size.h);

      const img = nearestReady(index);
      if (!img) return false;

      const scale = Math.max(size.w / img.naturalWidth, size.h / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size.w - w) / 2, (size.h - h) / 2, w, h);

      // The separate cyan pass. Saturation is applied at draw time — one filtered blit at
      // half resolution, no per-pixel work — and the layer is only painted once it is
      // actually showing, so the hero costs nothing extra.
      if (cyanStrength.current > 0.01) {
        cyanCtx.clearRect(0, 0, size.w, size.h);
        cyanCtx.filter = `saturate(${CYAN_SATURATE})`;
        cyanCtx.drawImage(img, (size.w - w) / 2, (size.h - h) / 2, w, h);
        cyanCtx.filter = 'none';
      }
      return true;
    };

    const load = (index: number) =>
      new Promise<void>((resolve) => {
        if (images[index]) return resolve();
        const img = new window.Image();
        images[index] = img;
        const done = () => {
          // Whichever happens first — the next tick or this download finishing — paints the
          // frame. Neither path depends on the other's timing.
          if (wanted.current === index && draw(index)) {
            painted.current = index;
            canvas.dataset.painted = '1';
          }
          resolve();
        };
        img.onload = done;
        img.onerror = () => resolve();
        img.src = framePath(index);
      });

    resize();

    // Pass 1: coarse — the same set the intro preloads, so those are warm in cache already.
    const coarse: Promise<void>[] = COARSE_INDICES.map((i) => load(i));
    // Pass 2 backfills in small batches. Firing all ~157 at once saturates the main thread
    // with decodes at exactly the moment the intro panel clears.
    void Promise.allSettled(coarse).then(async () => {
      const rest: number[] = [];
      for (let i = 0; i < FRAME_COUNT; i++) if (!images[i]) rest.push(i);
      const BATCH = 12;
      for (let i = 0; i < rest.length; i += BATCH) {
        await Promise.allSettled(rest.slice(i, i + BATCH).map(load));
      }
    });

    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    // Reduced motion: one static mid-sequence frame, a constant veil, and no updates at all.
    if (reduced) {
      veil.style.opacity = String(VEIL_MAX);
      canvas.style.filter = `blur(${BLUR_MAX_PX}px)`;
      cyanStrength.current = 1;
      cyan.style.opacity = String(CYAN_LAYER_ALPHA);
      const paintOnce = () => {
        if (draw(wanted.current)) {
          painted.current = wanted.current;
          canvas.dataset.painted = '1';
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

    const unsubscribe = subscribeTick(() => {
      const vh = window.innerHeight;
      const docRange = document.documentElement.scrollHeight - vh;
      const y = window.scrollY;

      // The hero track, when there is one. Project pages and 404 have no hero, so the
      // sequence simply spans their whole document.
      const track = document.querySelector<HTMLElement>('[data-hero-track]');
      const heroRange = track ? track.offsetHeight - vh : 0;

      // A project page's own brand hero paints the SAME sequence as a mask over that brand's
      // photography. Two copies of one sequence on top of each other is a smear, so the
      // global layer stands down for the length of that track and comes back on the same
      // veil ramp that runs at the bottom of the home hero — the boundary is a ramp either
      // way, never an edge.
      const brand = document.querySelector<HTMLElement>('[data-brand-hero-track]');
      const brandRange = brand ? brand.offsetHeight - vh : 0;

      let p: number;
      if (heroRange > 0 && docRange > 0) {
        const heroP = clamp(y / heroRange);
        p =
          y <= heroRange
            ? heroP * HERO_SHARE
            : HERO_SHARE +
              clamp((y - heroRange) / Math.max(1, docRange - heroRange)) * (1 - HERO_SHARE);
      } else {
        p = docRange > 0 ? clamp(y / docRange) : 0;
      }

      const target = Math.round(p * (FRAME_COUNT - 1));
      wanted.current = target;
      if (draw(target)) {
        painted.current = target;
        canvas.dataset.painted = '1';
      }

      // Veil: transparent through the hero, ramping across its last 40vh, then held. That
      // ramp is what replaces the old seam.
      let veilOpacity: number;
      if (heroRange > 0) {
        const rampEnd = heroRange;
        const rampStart = rampEnd - VEIL_RAMP_VH * vh;
        veilOpacity = clamp((y - rampStart) / Math.max(1, rampEnd - rampStart)) * VEIL_MAX;
      } else {
        veilOpacity = VEIL_MAX;
      }
      if (brandRange > 0) {
        const after = y - brandRange;
        const ramp = clamp(after / Math.max(1, VEIL_RAMP_VH * vh));
        canvas.style.opacity = after <= 0 ? '0' : '1';
        cyan.style.opacity = after <= 0 ? '0' : (ramp * CYAN_LAYER_ALPHA).toFixed(3);
        veil.style.opacity = after <= 0 ? '0' : (ramp * VEIL_MAX).toFixed(3);
        canvas.style.filter = after <= 0 ? 'none' : `blur(${(ramp * BLUR_MAX_PX).toFixed(2)}px)`;
        cyanStrength.current = after <= 0 ? 0 : ramp;
        return;
      }
      canvas.style.opacity = '1';
      veil.style.opacity = veilOpacity.toFixed(3);

      // Blur and chroma ride the same ramp: untouched over the hero, fully soft below it.
      const ramp = veilOpacity / VEIL_MAX;
      canvas.style.filter = ramp > 0.001 ? `blur(${(ramp * BLUR_MAX_PX).toFixed(2)}px)` : 'none';
      cyanStrength.current = ramp;
      cyan.style.opacity = (ramp * CYAN_LAYER_ALPHA).toFixed(3);
    });

    const onResize = () => {
      resize();
      draw(wanted.current);
    };
    window.addEventListener('resize', onResize);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-ink-canvas=""
        role="presentation"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          display: 'block',
          zIndex: -2,
          pointerEvents: 'none',
          background: PAPER,
        }}
      />
      <div
        ref={veilRef}
        data-ink-veil=""
        role="presentation"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          background: PAPER,
          opacity: 0,
          willChange: 'opacity',
        }}
      />
      {/*
        Above the veil in paint order — same negative z-index, later in the DOM — so the
        misregistered cyan is not scaled away by it. `color` blending lends hue and chroma
        while luminosity comes from what is already there, so it tints without darkening.
      */}
      <canvas
        ref={cyanRef}
        data-ink-cyan=""
        role="presentation"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          display: 'block',
          zIndex: -1,
          pointerEvents: 'none',
          mixBlendMode: 'color',
          opacity: 0,
          willChange: 'opacity',
        }}
      />
    </>
  );
}

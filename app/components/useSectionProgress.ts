'use client';

import { useEffect, useRef, useState } from 'react';
import { useMotionValue, type MotionValue } from 'framer-motion';

/**
 * One shared rAF loop for every scroll-linked section on the site.
 *
 * Same pattern ScrollHero uses: rAF + getBoundingClientRect, never a scroll listener. All
 * subscribers are measured in a single pass on one frame, so adding a section costs one more
 * getBoundingClientRect rather than another listener and another layout flush.
 *
 * Everything driven off these values must animate TRANSFORM AND OPACITY ONLY — no width,
 * height, top, left, filter or box-shadow — or the compositor cannot keep up.
 */

/**
 * `passage`  0 when the section's top edge reaches the bottom of the viewport, 1 when its
 *            bottom edge leaves the top — its full trip across the screen.
 * `pinned`   0 at the top of a tall container, 1 when its last viewport-height is reached —
 *            what a sticky/pinned section needs, and what the hero beats run on.
 */
export type ProgressMode = 'passage' | 'pinned';

type Entry = {
  el: HTMLElement;
  mode: ProgressMode;
  progress: MotionValue<number>;
  /** Scroll delta in px since the previous frame, for velocity-coupled effects. */
  velocity?: MotionValue<number>;
};

const entries = new Set<Entry>();
/** Per-frame callbacks that need the same single measurement pass — the ink canvas. */
const tickers = new Set<() => void>();
let frame = 0;
let lastScroll = 0;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function tick() {
  const vh = window.innerHeight;
  const y = window.scrollY;
  const delta = y - lastScroll;
  lastScroll = y;

  for (const e of entries) {
    const rect = e.el.getBoundingClientRect();
    let p: number;
    if (e.mode === 'pinned') {
      const range = e.el.offsetHeight - vh;
      p = range > 0 ? -rect.top / range : 0;
    } else {
      const span = rect.height + vh;
      p = span > 0 ? (vh - rect.top) / span : 0;
    }
    e.progress.set(clamp01(p));
    e.velocity?.set(delta);
  }

  for (const fn of tickers) fn();

  frame = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (!frame) {
    lastScroll = window.scrollY;
    frame = requestAnimationFrame(tick);
  }
}

function stopIfIdle() {
  if (entries.size === 0 && tickers.size === 0 && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/**
 * Run a callback once per frame inside the shared measurement pass. Used by the ink canvas so
 * it redraws every tick — the retry that stops a frame claimed before its image loaded from
 * leaving the canvas blank — without opening a second rAF loop.
 */
export function subscribeTick(fn: () => void) {
  tickers.add(fn);
  ensureLoop();
  return () => {
    tickers.delete(fn);
    stopIfIdle();
  };
}

function subscribe(entry: Entry) {
  entries.add(entry);
  ensureLoop();
  return () => {
    entries.delete(entry);
    stopIfIdle();
  };
}

export function useSectionProgress(
  ref: React.RefObject<HTMLElement | null>,
  opts: { velocity?: boolean; mode?: ProgressMode } = {}
) {
  const progress = useMotionValue(0);
  const velocity = useMotionValue(0);
  const wantVelocity = opts.velocity ?? false;
  const mode = opts.mode ?? 'passage';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Under reduced motion nothing subscribes; sections render their end state instead.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      progress.set(1);
      return;
    }
    return subscribe({ el, mode, progress, velocity: wantVelocity ? velocity : undefined });
  }, [ref, progress, velocity, wantVelocity, mode]);

  return { progress, velocity };
}

/**
 * Reduced-motion flag.
 *
 * Deliberately not framer's `useReducedMotion`: its listener initialises lazily and was
 * observed returning true on one route and false on another in the same session, which left
 * the project page pinned for users who had asked for no motion. A plain matchMedia
 * subscription behaves the same everywhere.
 */
export function useReducedMotionFlag() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

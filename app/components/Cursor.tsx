'use client';

import { useEffect, useRef } from 'react';

const REST_SIZE = 34;
const HOVER_SCALE = 84 / REST_SIZE;

// Raised from 0.10/0.16: at a tenth of ink the disc was all but invisible over paper and
// only read on the hero, where it inverts.
const REST_ALPHA = 0.2;
const HOVER_ALPHA = 0.28;

const INK = '#17150F';
const PAPER = '#F2EEE6';

/** Heavier lag than a 1:1 follow — the light trails the pointer rather than sitting on it. */
const LERP = 0.14;

/**
 * Soft light following the pointer.
 *
 * Deliberately NO blend mode. `mix-blend-mode: difference` works on a dark site but inverts
 * on warm paper, where it renders as a dark smudge over the background and a muddy blob over
 * the cyan CTA — a stain rather than a cursor. Instead the fill is an explicit low-alpha
 * wash: ink over light ground, paper over the dark hero canvas and the ink menu overlay.
 *
 * The scale change on [data-cursor] is the only hover signal — no text label, no rotation,
 * no outline.
 */
export default function Cursor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);

  // Pointer state lives in refs. setState on mousemove would re-render sixty times a second.
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const hover = useRef<string | null>(null);
  const visible = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = window.matchMedia('(hover: none)').matches;
    if (reduced || touch) return;

    const root = rootRef.current;
    const disc = discRef.current;
    if (!root || !disc) return;

    target.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    pos.current = { ...target.current };

    const onMove = (e: PointerEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
      if (!visible.current) {
        visible.current = true;
        root.style.opacity = '1';
      }
    };

    // One delegated listener rather than a pair per interactive element. Recomputing from
    // the event target on every mouseover handles enter and leave in the same pass.
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-cursor]') ?? null;
      hover.current = el?.getAttribute('data-cursor') ?? null;
    };

    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) {
        visible.current = false;
        root.style.opacity = '0';
      }
    };
    const onEnter = () => {
      visible.current = true;
      root.style.opacity = '1';
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onLeave);
    document.addEventListener('mouseover', onEnter, { once: true });

    // A dark wash is invisible on the dark hero canvas or the ink menu, so the fill inverts
    // over both. Measured per frame rather than through an IntersectionObserver created at
    // mount: the cursor lives in the layout and never remounts, while the hero comes and
    // goes with client-side navigation, so a mount-time observer goes stale after the first
    // route change.
    const overDarkGround = () => {
      const menu = document.querySelector('[data-menu-overlay]');
      if (menu?.getAttribute('data-open') === 'true') return true;
      const hero = document.querySelector('[data-hero]');
      if (!hero) return false;
      const r = hero.getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      return visible > vh * 0.55;
    };

    let frame = 0;
    const loop = () => {
      const p = pos.current;
      p.x += (target.current.x - p.x) * LERP;
      p.y += (target.current.y - p.y) * LERP;
      root.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;

      const kind = hover.current;
      const active = !!kind && kind !== 'hide';

      if (kind === 'hide') root.style.opacity = '0';
      else if (visible.current) root.style.opacity = '1';

      disc.style.transform = `translate(-50%, -50%) scale(${active ? HOVER_SCALE : 1})`;
      disc.style.opacity = String(active ? HOVER_ALPHA : REST_ALPHA);
      disc.style.backgroundColor = overDarkGround() ? PAPER : INK;

      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onLeave);
      document.removeEventListener('mouseover', onEnter);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-cursor-root=""
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        pointerEvents: 'none',
        // Above the menu overlay (9500) and the transition panel (9998) so it is present on
        // every route and over every layer.
        zIndex: 10001,
        opacity: 0,
        transition: 'opacity .3s ease',
        willChange: 'transform',
      }}
    >
      <div
        ref={discRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: REST_SIZE,
          height: REST_SIZE,
          borderRadius: '50%',
          backgroundColor: INK,
          opacity: REST_ALPHA,
          filter: 'blur(8px)',
          transform: 'translate(-50%, -50%) scale(1)',
          transition:
            'transform .4s cubic-bezier(.16,1,.3,1), opacity .4s ease, background-color .4s ease',
          willChange: 'transform, opacity',
        }}
      />
    </div>
  );
}

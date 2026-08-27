'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/**
 * Lenis drives native scroll from its own rAF loop — it does not transform the page — so
 * getBoundingClientRect() keeps reporting correct viewport-relative values and ScrollHero's
 * loop needs no special handling. The two systems stay independent by design: driving the
 * canvas from a Lenis callback couples frame painting to scroll easing.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = window.matchMedia('(hover: none)').matches;
    if (reduced || touch) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    // Exposed so the menu overlay can lock scrolling through Lenis. Toggling
    // `overflow: hidden` would leave Lenis running underneath and fight it.
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    let frame = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}

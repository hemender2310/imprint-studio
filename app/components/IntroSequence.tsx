'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { preloadCoarse, INTRO_TARGET } from './framePreload';
import { markIntroDone } from './introGate';
import { useReducedMotionFlag } from './useSectionProgress';
import { T, monoStyle } from './tokens';

/** Same wipe and easing as the page transition and the menu, so all three read as one. */
const EASE = [0.76, 0, 0.24, 1] as const;
const WIPE = 0.55;

const SESSION_KEY = 'imprint-intro-seen';

/** A stalled request must never trap the visitor behind the panel. */
const HARD_TIMEOUT_MS = 6000;

export default function IntroSequence() {
  const reduced = useReducedMotionFlag();
  // Starts true so the panel is in the server-rendered markup and covers the very first
  // paint. A repeat visit is hidden before paint by the inline script in layout.tsx, which
  // sets data-intro-seen on <html>; CSS then keeps this display:none.
  const [show, setShow] = useState(true);
  const [loaded, setLoaded] = useState(0);
  const [clearing, setClearing] = useState(false);
  const finished = useRef(false);

  // sessionStorage is unavailable during SSR, so the *marking* happens here while the
  // pre-paint script in layout.tsx handles the visual side with no flash either way.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) {
      markIntroDone();
      setShow(false);
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {}
  }, []);

  // Reduced motion: no panel, no counter, straight to content.
  useEffect(() => {
    if (reduced && !finished.current) {
      finished.current = true;
      setShow(false);
      markIntroDone();
    }
  }, [reduced]);

  useEffect(() => {
    if (!show || reduced) return;

    const begin = () => {
      if (finished.current) return;
      finished.current = true;
      setClearing(true);
    };

    const cancel = preloadCoarse((n) => {
      setLoaded(n);
      if (n >= INTRO_TARGET) begin();
    });

    // Hard timeout regardless of what the network is doing.
    const timer = window.setTimeout(begin, HARD_TIMEOUT_MS);

    return () => {
      cancel();
      window.clearTimeout(timer);
    };
  }, [show, reduced]);

  if (reduced || !show) return null;

  const ratio = INTRO_TARGET > 0 ? Math.min(1, loaded / INTRO_TARGET) : 1;

  return (
    <motion.div
      data-intro=""
      data-clearing={clearing ? 'true' : 'false'}
      aria-hidden="true"
      initial={{ scaleY: 1 }}
      animate={{ scaleY: clearing ? 0 : 1 }}
      transition={{ duration: clearing ? WIPE : 0, ease: EASE }}
      onAnimationComplete={() => {
        if (clearing) {
          // The hero entrance starts only now, after the panel has cleared.
          markIntroDone();
          setShow(false);
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9997,
        background: T.ink,
        transformOrigin: 'top',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.6rem',
        willChange: 'transform',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-instrument), serif',
          fontSize: 'clamp(2.4rem, 7vw, 5rem)',
          lineHeight: 1,
          letterSpacing: '0.04em',
          color: T.paper,
        }}
      >
        IMPRINT
      </div>

      <div
        data-intro-counter=""
        style={{ ...monoStyle, color: 'rgba(242,238,230,0.62)' }}
      >
        {String(loaded).padStart(2, '0')} / {String(INTRO_TARGET).padStart(2, '0')}
      </div>

      <div style={{ width: 'min(320px, 52vw)', height: 1, background: 'rgba(242,238,230,0.22)' }}>
        <motion.div
          data-intro-rule=""
          style={{
            width: '100%',
            height: 1,
            background: T.cyan,
            transformOrigin: 'left',
            scaleX: ratio,
          }}
        />
      </div>
    </motion.div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

import { projects } from '../data/projects';
import { useReducedMotionFlag } from './useSectionProgress';
import { T } from './tokens';

const EASE = [0.76, 0, 0.24, 1] as const;
const HALF = 0.5;

/** What the panel announces is the destination, not the origin. */
function labelFor(pathname: string): string {
  const match = pathname.match(/^\/work\/([^/]+)/);
  if (!match) return 'IMPRINT';
  return projects.find((p) => p.slug === match[1])?.name ?? 'IMPRINT';
}

/**
 * Route transition: an ink panel wipes up over the outgoing page, the route swaps behind it,
 * and the same panel continues up and off.
 *
 * Next's App Router hands over new children as soon as navigation resolves, so there is no
 * exit hook to hang the first half on. The panel is driven off pathname changes instead, and
 * the incoming tree is held back in `shown` until the panel has fully covered the viewport —
 * that hold is what prevents a flash of the new route.
 *
 * scaleY is driven ONLY by `animate`. A scaleY in the style object wins for a frame whenever
 * the component re-renders mid-transition, which uncovered the viewport and flashed content.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotionFlag();

  const [shown, setShown] = useState<React.ReactNode>(children);
  const [swapKey, setSwapKey] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'cover' | 'reveal'>('idle');
  const [label, setLabel] = useState(() => labelFor(pathname));

  const previous = useRef(pathname);
  const pending = useRef<React.ReactNode>(null);
  const latest = useRef(children);
  latest.current = children;

  useEffect(() => {
    if (pathname === previous.current) {
      // Same route re-render: keep the tree current without running a transition.
      if (phase === 'idle') setShown(children);
      return;
    }
    previous.current = pathname;
    setLabel(labelFor(pathname));

    if (reduced) {
      setShown(children);
      setSwapKey((k) => k + 1);
      window.scrollTo(0, 0);
      return;
    }

    pending.current = children;
    setPhase('cover');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, children, reduced]);

  const onPanelSettled = () => {
    if (phase === 'cover') {
      setShown(pending.current ?? latest.current);
      pending.current = null;
      window.scrollTo(0, 0);
      setSwapKey((k) => k + 1);
      setPhase('reveal');
    } else if (phase === 'reveal') {
      setPhase('idle');
    }
  };

  return (
    <>
      {/*
        Deliberately NOT wrapped in AnimatePresence. `AnimatePresence initial={false}` sets a
        presence context that suppresses the mount animation of every descendant, which
        silently killed the hero's staggered identity entrance. The swap is driven manually
        here anyway, so a keyed motion.div is all that is needed — and `initial={false}` on
        the first render keeps the hero entrance as the first thing the visitor sees.
      */}
      <motion.div
        key={swapKey}
        initial={swapKey === 0 ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: reduced ? 0.15 : 0.3,
          // The last 0.3s of the 0.5s reveal.
          delay: reduced ? 0 : HALF - 0.3,
          ease: 'linear',
        }}
      >
        {shown}
      </motion.div>

      {!reduced && (
        <motion.div
          aria-hidden="true"
          data-transition-panel=""
          data-phase={phase}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: phase === 'cover' ? 1 : 0 }}
          transition={{ duration: phase === 'idle' ? 0 : HALF, ease: EASE }}
          onAnimationComplete={onPanelSettled}
          style={{
            position: 'fixed',
            inset: 0,
            background: T.ink,
            zIndex: 9998,
            pointerEvents: phase === 'idle' ? 'none' : 'auto',
            // Wipes up from the bottom on the way in, continues up and off on the way out.
            transformOrigin: phase === 'cover' ? 'bottom' : 'top',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            willChange: 'transform',
          }}
        >
          <motion.span
            animate={{ opacity: phase === 'cover' ? 1 : 0 }}
            transition={{ duration: HALF * 0.6, ease: 'linear' }}
            style={{
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '0.68rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: T.paper,
            }}
          >
            {label}
          </motion.span>
        </motion.div>
      )}
    </>
  );
}

'use client';

import { useRef } from 'react';
import { useAnimationFrame } from 'framer-motion';

import { RegMark } from './RegMarks';
import { useSectionProgress, useReducedMotionFlag } from './useSectionProgress';
import { T } from './tokens';

const INDUSTRIES = [
  'Hospitality',
  'Fintech',
  'Fashion',
  'Food & Beverage',
  'Real Estate',
  'Music',
  'Wellness',
  'Consumer Tech',
  'Spirits',
  'Retail',
];

/** px per second of base drift — matches the 32s CSS loop this replaces. */
const BASE_SPEED = 42;
/** How much of the frame's scroll delta feeds into the marquee, and the cap on it. */
const VELOCITY_GAIN = 1.6;
const VELOCITY_CAP = 26;
/** Per-frame decay back to base drift once scrolling stops. */
const EASE_BACK = 0.9;

function Run() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {INDUSTRIES.map((name) => (
        <span key={name} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span
            style={{
              fontFamily: 'var(--font-instrument), serif',
              fontSize: '2.2rem',
              color: T.graphite,
              whiteSpace: 'nowrap',
              padding: '0 1.6rem',
            }}
          >
            {name}
          </span>
          <RegMark size={11} color={T.cyan} />
        </span>
      ))}
    </div>
  );
}

export default function Industries() {
  const ref = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionFlag();

  // Scroll delta comes from the shared loop rather than a listener of its own.
  const { velocity } = useSectionProgress(ref, { velocity: true });

  const offset = useRef(0);
  const extra = useRef(0);
  const last = useRef(0);

  useAnimationFrame((t) => {
    const track = trackRef.current;
    if (!track || reduced) return;

    const dt = last.current ? Math.min((t - last.current) / 1000, 0.05) : 0;
    last.current = t;

    // Scroll delta pushes the marquee along, direction following the scroll, clamped so a
    // fast flick cannot fling it. It eases back to the base drift when scrolling stops.
    const delta = velocity.get();
    const kick = Math.max(-VELOCITY_CAP, Math.min(VELOCITY_CAP, delta * VELOCITY_GAIN));
    extra.current = extra.current * EASE_BACK + kick * (1 - EASE_BACK);

    offset.current += BASE_SPEED * dt + extra.current * dt * 6;

    // The run is duplicated, so wrapping at half the track width is seamless.
    const half = track.scrollWidth / 2;
    if (half > 0) {
      offset.current = ((offset.current % half) + half) % half;
      track.style.transform = `translate3d(${-offset.current}px, 0, 0)`;
    }
  });

  return (
    <section
      ref={ref}
      style={{
        background: 'transparent',
        padding: 'clamp(4rem, 9vh, 7rem) 0',
        borderTop: `1px solid ${T.rule}`,
        borderBottom: `1px solid ${T.rule}`,
        overflow: 'hidden',
      }}
    >
      <div data-cursor="drag" style={{ overflow: 'hidden' }}>
        {/* Content duplicated so the wrap lands exactly on a seam. */}
        <div
          ref={trackRef}
          data-marquee-track=""
          style={{
            display: 'flex',
            width: 'max-content',
            willChange: 'transform',
          }}
        >
          <Run />
          <Run />
        </div>
      </div>
    </section>
  );
}

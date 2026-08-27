'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';

import RegMarks from './RegMarks';
import { useSectionProgress } from './useSectionProgress';
import { T, column, labelStyle } from './tokens';

const STATEMENT =
  'Most brands are decorated. A few are constructed. We only do the second one.';

const WORDS = STATEMENT.split(' ');

/**
 * Each word owns a slice of the section's scroll progress. The unrevealed state is 0.32
 * rather than 0.18 — below roughly 0.3 the text against paper is not dim, it is invisible,
 * which reads as words appearing from nothing instead of resolving.
 */
function Word({ word, index, total, progress }: {
  word: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  // 0.35 rather than a wider spread: the wave has to finish by the time the statement
  // reaches the centre of the viewport, or a reader who stops on it sees half a sentence.
  const start = (index / total) * 0.35;
  const opacity = useTransform(progress, [start, start + 0.2], [0.32, 1]);
  return (
    <motion.span style={{ opacity, display: 'inline-block', marginRight: '0.28em' }}>
      {word}
    </motion.span>
  );
}

export default function Manifesto() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.85', 'end 0.35'],
  });

  // The whole statement drifts against the scroll, so it is not simply carried past.
  const { progress } = useSectionProgress(ref);
  const drift = useTransform(progress, [0, 1], [40, -40]);

  return (
    <section
      id="manifesto"
      ref={ref}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      }}
    >
      <motion.div style={{ ...column, textAlign: 'center', y: drift }}>
        <RegMarks inset={6} />
        <div style={{ ...labelStyle, marginBottom: '3rem' }}>Manifesto</div>
        <p
          style={{
            fontFamily: 'var(--font-instrument), serif',
            fontSize: 'clamp(1.8rem, 4vw, 3.4rem)',
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            color: T.ink,
            maxWidth: '20ch',
            margin: '0 auto',
          }}
        >
          {WORDS.map((w, i) => (
            <Word key={i} word={w} index={i} total={WORDS.length} progress={scrollYProgress} />
          ))}
        </p>
      </motion.div>
    </section>
  );
}

'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

import { useReducedMotionFlag } from './useSectionProgress';

/**
 * Masked line rise: each line sits in an overflow-hidden span and its inner span translates
 * up from 100%. Replaces the plain 24px fade on every section heading.
 *
 * Transform and opacity only — the mask is a static overflow, nothing animates layout.
 */
export default function MaskedLines({
  lines,
  stagger = 0.09,
  duration = 0.9,
  className,
  style,
  as: Tag = 'span',
}: {
  lines: string[];
  stagger?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Section headings must be real headings — the default span is for use inside one. */
  as?: 'span' | 'h1' | 'h2';
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px -8% 0px' });
  const reduced = useReducedMotionFlag();

  return (
    <Tag
      ref={ref as React.RefObject<HTMLHeadingElement & HTMLSpanElement>}
      className={className}
      style={{ display: 'block', fontWeight: 400, ...style }}
    >
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block', overflow: 'hidden' }}>
          <motion.span
            style={{ display: 'block', willChange: 'transform' }}
            initial={reduced ? { y: 0 } : { y: '100%' }}
            animate={inView || reduced ? { y: 0 } : undefined}
            transition={{ duration: reduced ? 0 : duration, delay: reduced ? 0 : i * stagger, ease: [0.16, 1, 0.3, 1] }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

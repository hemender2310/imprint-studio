'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/** Shared entrance for every section on the site: y 24 -> 0, opacity 0 -> 1, once only. */
export default function Reveal({
  children,
  delay = 0,
  style,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.7, delay, ease: [0.25, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

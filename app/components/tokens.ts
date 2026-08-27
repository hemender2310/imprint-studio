import type { CSSProperties } from 'react';

/** IMPRINT's own chrome uses exactly these. Client palettes never appear here. */
export const T = {
  paper: '#F2EEE6',
  deckle: '#E4DED1',
  ink: '#17150F',
  graphite: '#55504A',
  cyan: '#0090C1',
  cyanHi: '#00A6DE',
  rule: 'rgba(23,21,15,0.14)',
} as const;

export const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono), monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: T.cyan,
};

export const monoStyle: CSSProperties = {
  fontFamily: 'var(--font-mono), monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
};

export const h2Style: CSSProperties = {
  fontFamily: 'var(--font-instrument), serif',
  fontSize: 'clamp(2rem, 5vw, 4rem)',
  lineHeight: 1.05,
  letterSpacing: '-0.01em',
  color: T.ink,
  fontWeight: 400,
};

export const bodyStyle: CSSProperties = {
  fontSize: '1.05rem',
  lineHeight: 1.65,
  fontWeight: 300,
  color: T.graphite,
};

/** Shared content column. */
export const column: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 1240,
  margin: '0 auto',
  padding: '0 clamp(1.5rem, 5vw, 4rem)',
};

export const sectionPad: CSSProperties = {
  padding: 'clamp(6rem, 14vh, 11rem) 0',
};

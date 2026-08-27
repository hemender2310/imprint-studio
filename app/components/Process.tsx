'use client';

import { useRef } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';

import MaskedLines from './MaskedLines';
import RegMarks, { RegMark } from './RegMarks';
import { useSectionProgress, useReducedMotionFlag } from './useSectionProgress';
import { T, column, sectionPad, labelStyle, monoStyle, h2Style, bodyStyle } from './tokens';

const PLATES = [
  { n: '01', name: 'Interrogate', copy: 'What the business actually needs, not what it asked for.' },
  { n: '02', name: 'Position', copy: 'The one claim the brand can own and defend.' },
  { n: '03', name: 'Design', copy: 'Marks, type, colour, motion, voice, built as a system.' },
  { n: '04', name: 'Produce', copy: 'Film, stills, copy, site, campaign assets.' },
  { n: '05', name: 'Hand off', copy: 'Guidelines and files a team can run without us.' },
];

/** The line is drawn across the middle 70% of the passage; each mark lights as it arrives. */
const DRAW_FROM = 0.15;
const DRAW_TO = 0.85;

function Plate({
  plate,
  index,
  draw,
  reduced,
}: {
  plate: (typeof PLATES)[number];
  index: number;
  draw: MotionValue<number>;
  reduced: boolean;
}) {
  const at = (index + 0.5) / PLATES.length;
  const markOpacity = useTransform(draw, [at - 0.08, at + 0.02], [0, 1], { clamp: true });
  const markRotate = useTransform(draw, [at - 0.08, at + 0.02], [45, 0], { clamp: true });
  const titleY = useTransform(draw, [at - 0.06, at + 0.06], [20, 0], { clamp: true });
  const titleOpacity = useTransform(draw, [at - 0.08, at + 0.02], [0, 1], { clamp: true });

  return (
    <div
      className="plate-row"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 9rem) minmax(0, 1fr)',
        gap: 'clamp(1rem, 4vw, 3rem)',
        alignItems: 'baseline',
        padding: 'clamp(1.6rem, 3.5vh, 2.4rem) 0',
      }}
    >
      <motion.span
        aria-hidden="true"
        data-plate-mark=""
        style={{
          position: 'absolute',
          left: 'calc(clamp(1.5rem, 3vw, 2.2rem) - clamp(3rem, 6vw, 4.5rem) - 6px)',
          top: 'clamp(1.6rem, 3.5vh, 2.4rem)',
          lineHeight: 0,
          opacity: reduced ? 1 : markOpacity,
          rotate: reduced ? 0 : markRotate,
        }}
      >
        <RegMark size={13} color={T.cyan} />
      </motion.span>

      <div style={{ ...monoStyle, color: T.graphite }}>Plate {plate.n}</div>
      <motion.div style={{ y: reduced ? 0 : titleY, opacity: reduced ? 1 : titleOpacity }}>
        <div
          style={{
            fontFamily: 'var(--font-instrument), serif',
            fontSize: 'clamp(1.4rem, 2.6vw, 2rem)',
            color: T.ink,
            marginBottom: '0.5rem',
          }}
        >
          {plate.name}
        </div>
        <p style={bodyStyle} data-cursor="hide">
          {plate.copy}
        </p>
      </motion.div>
    </div>
  );
}

export default function Process() {
  const ref = useRef<HTMLElement>(null);
  const { progress } = useSectionProgress(ref);
  const reduced = useReducedMotionFlag();

  const draw = useTransform(progress, [DRAW_FROM, DRAW_TO], [0, 1], { clamp: true });

  return (
    <section id="process" ref={ref} style={{ ...sectionPad, background: 'transparent' }}>
      <div style={column}>
        <RegMarks inset={6} />

        <div style={{ ...labelStyle, marginBottom: '1.4rem' }}>How it runs</div>
        <MaskedLines
          as="h2"
          lines={['Five plates.']}
          style={{ ...h2Style, marginBottom: 'clamp(3rem, 7vh, 5rem)' }}
        />

        <div
          data-process-panel=""
          style={{
            position: 'relative',
            background: T.paper,
            paddingLeft: 'clamp(3rem, 6vw, 4.5rem)',
            paddingRight: 'clamp(1.5rem, 4vw, 3rem)',
            paddingTop: 'clamp(1rem, 3vh, 2rem)',
            paddingBottom: 'clamp(1rem, 3vh, 2rem)',
          }}
        >
          {/* The hairline draws itself as the section passes. scaleY only — no height. */}
          <motion.div
            aria-hidden="true"
            data-process-line=""
            style={{
              position: 'absolute',
              left: 'clamp(1.5rem, 3vw, 2.2rem)',
              top: 0,
              bottom: 0,
              width: 1,
              background: T.rule,
              transformOrigin: 'top',
              scaleY: reduced ? 1 : draw,
              willChange: 'transform',
            }}
          />
          {PLATES.map((p, i) => (
            <Plate key={p.n} plate={p} index={i} draw={draw} reduced={reduced} />
          ))}
        </div>
      </div>
    </section>
  );
}

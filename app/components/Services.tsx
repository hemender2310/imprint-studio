'use client';

import { useRef } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';

import MaskedLines from './MaskedLines';
import RegMarks from './RegMarks';
import { useSectionProgress, useReducedMotionFlag } from './useSectionProgress';
import { T, column, labelStyle, monoStyle, h2Style, bodyStyle } from './tokens';

const SERVICES = [
  {
    plate: '01',
    name: 'Brand Identity',
    copy: "Naming, marks, type systems, colour, and the rules that keep them consistent when we're not in the room.",
  },
  {
    plate: '02',
    name: 'Advertising & Content',
    copy: 'Campaign concepts, art direction, film, and the social cutdowns that actually carry the idea.',
  },
  {
    plate: '03',
    name: 'Digital & Web',
    copy: 'Sites and product surfaces where the identity holds up under real interaction, not just in a deck.',
  },
];

const PIN_VH = 300;
const N = SERVICES.length;

/** Each row owns its own hooks — calling useTransform inside a conditional would break the
 *  rules of hooks, and a per-row component is the clean way to keep them unconditional. */
function ServiceRow({
  service,
  index,
  pin,
  reduced,
}: {
  service: (typeof SERVICES)[number];
  index: number;
  pin: MotionValue<number>;
  reduced: boolean;
}) {
  const a = index / N;
  const b = (index + 1) / N;
  const opacity = useTransform(pin, [a - 0.05, a + 0.05, b - 0.05, b + 0.05], [0.62, 1, 1, 0.62]);
  const x = useTransform(pin, [a, b], [0, 18], { clamp: true });

  return (
    <motion.div
      className="svc-row"
      data-svc-row=""
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 6rem) minmax(0, 1.1fr) minmax(0, 1fr)',
        gap: 'clamp(1rem, 4vw, 3rem)',
        alignItems: 'baseline',
        padding: 'clamp(1.6rem, 3.5vh, 2.4rem) clamp(0.75rem, 2vw, 1.5rem)',
        borderBottom: `1px solid ${T.rule}`,
        opacity: reduced ? 1 : opacity,
      }}
    >
      <div style={{ ...monoStyle, color: T.graphite }}>{service.plate}</div>
      <motion.div
        className="svc-name"
        style={{
          fontFamily: 'var(--font-instrument), serif',
          fontSize: 'clamp(1.5rem, 3.2vw, 2.6rem)',
          lineHeight: 1.1,
          color: T.ink,
          x: reduced ? 0 : x,
        }}
      >
        {service.name}
      </motion.div>
      <p style={bodyStyle} data-cursor="hide">
        {service.copy}
      </p>
    </motion.div>
  );
}

function PlateNumber({
  plate,
  index,
  pin,
}: {
  plate: string;
  index: number;
  pin: MotionValue<number>;
}) {
  const a = index / N;
  const b = (index + 1) / N;
  const opacity = useTransform(pin, [a - 0.06, a + 0.06, b - 0.06, b + 0.06], [0, 1, 1, 0]);
  return (
    <motion.div
      data-plate-ghost=""
      style={{
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        fontFamily: 'var(--font-mono), monospace',
        fontSize: 'clamp(8rem, 20vw, 18rem)',
        lineHeight: 0.8,
        // Hairline outline, not a filled ghost: a filled glyph at 7% is indistinguishable
        // from the ink behind it now that the section sits over the canvas.
        color: 'transparent',
        WebkitTextStroke: '1px rgba(23,21,15,0.18)',
        opacity,
      }}
    >
      {plate}
    </motion.div>
  );
}

export default function Services() {
  const ref = useRef<HTMLElement>(null);
  const { progress } = useSectionProgress(ref);
  const reduced = useReducedMotionFlag();

  // The section is PIN_VH tall, so its full passage spans (PIN_VH + 100)vh. The pinned
  // stretch is the middle of that: it engages once the top edge reaches 0 and releases when
  // the bottom edge clears the viewport.
  const enter = 100 / (PIN_VH + 100);
  const leave = PIN_VH / (PIN_VH + 100);
  const pin = useTransform(progress, [enter, leave], [0, 1], { clamp: true });

  return (
    <section
      id="services"
      ref={ref}
      data-services=""
      style={{
        position: 'relative',
        height: reduced ? 'auto' : `${PIN_VH}vh`,
        background: 'transparent',
      }}
    >
      <div
        data-services-pin=""
        style={{
          position: reduced ? 'relative' : 'sticky',
          top: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          padding: 'clamp(4rem, 10vh, 8rem) 0',
        }}
      >
        <div
          data-services-panel=""
          style={{
            ...column,
            position: 'relative',
            background: T.paper,
            paddingTop: 'clamp(2rem, 5vh, 3.5rem)',
            paddingBottom: 'clamp(2rem, 5vh, 3.5rem)',
          }}
        >
          <RegMarks inset={6} />

          {!reduced && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: 'clamp(1.5rem, 5vw, 4rem)',
                top: 0,
                bottom: 0,
                width: '40%',
                pointerEvents: 'none',
              }}
            >
              {SERVICES.map((s, i) => (
                <PlateNumber key={s.plate} plate={s.plate} index={i} pin={pin} />
              ))}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <div style={{ ...labelStyle, marginBottom: '1.4rem' }}>What we make</div>
            <MaskedLines
              as="h2"
              lines={['Three disciplines, one press.']}
              style={{ ...h2Style, marginBottom: 'clamp(3rem, 7vh, 5rem)' }}
            />

            <div style={{ borderTop: `1px solid ${T.rule}` }}>
              {SERVICES.map((s, i) => (
                <ServiceRow key={s.plate} service={s} index={i} pin={pin} reduced={reduced} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

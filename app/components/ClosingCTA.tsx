'use client';

import { useRef } from 'react';
import { motion, useTransform } from 'framer-motion';

import MaskedLines from './MaskedLines';
import RegMarks from './RegMarks';
import { useSectionProgress, useReducedMotionFlag } from './useSectionProgress';
import { T, column, labelStyle, monoStyle } from './tokens';

/**
 * Distinct from the hero's beat 4. They are visually consistent but serve different moments —
 * one closes the scrub, this one closes the page — so they are deliberately not deduplicated.
 */
export default function ClosingCTA() {
  const ref = useRef<HTMLElement>(null);
  const { progress } = useSectionProgress(ref);
  const reduced = useReducedMotionFlag();

  const glowScale = useTransform(progress, [0, 1], [0.8, 1.15]);

  return (
    <section
      id="contact"
      ref={ref}
      style={{
        background: 'transparent',
        padding: 'clamp(8rem, 18vh, 14rem) 0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ ...column, textAlign: 'center' }}>
        <RegMarks inset={6} />

        <motion.div
          aria-hidden="true"
          data-cta-glow=""
          style={{
            position: 'absolute',
            inset: '-20% -10%',
            background:
              'radial-gradient(ellipse at center, rgba(0,144,193,0.10) 0%, transparent 70%)',
            pointerEvents: 'none',
            scale: reduced ? 1 : glowScale,
            willChange: 'transform',
          }}
        />

        <div style={{ position: 'relative' }}>
          <div style={{ ...labelStyle, marginBottom: '2rem' }}>Start here</div>

          <h2
            style={{
              fontFamily: 'var(--font-instrument), serif',
              fontSize: 'clamp(2.2rem, 5vw, 4.5rem)',
              lineHeight: 1.08,
              letterSpacing: '-0.01em',
              color: T.ink,
              marginBottom: '1.8rem',
              fontWeight: 400,
            }}
          >
            <MaskedLines lines={['Bring us something unfinished.']} stagger={0.12} />
            <MaskedLines
              lines={["We'll set it in ink."]}
              stagger={0.12}
              duration={0.9}
              style={{ fontStyle: 'italic' }}
            />
          </h2>

          <p
            style={{
              fontSize: '1.05rem',
              lineHeight: 1.65,
              fontWeight: 300,
              color: T.graphite,
              maxWidth: 480,
              margin: '0 auto clamp(2.5rem, 5vh, 3.5rem)',
            }}
          >
            Tell us the business problem. We&rsquo;ll tell you whether a brand is the answer.
          </p>

          <motion.a
            href="mailto:hello@imprint.studio?subject=Project%20enquiry"
            data-cursor="view"
            whileHover={{ scale: 1.03, backgroundColor: T.cyanHi }}
            whileTap={{ scale: 0.98 }}
            style={{
              display: 'inline-block',
              background: T.cyan,
              color: T.paper,
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '0.7rem',
              letterSpacing: '0.18em',
              padding: '1rem 2.8rem',
              borderRadius: 0,
            }}
          >
            START A PROJECT
          </motion.a>

          <div
            data-contact-detail=""
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
              gap: 'clamp(2rem, 6vw, 5rem)',
              textAlign: 'left',
              maxWidth: 760,
              margin: 'clamp(3.5rem, 8vh, 5.5rem) auto 0',
              borderTop: `1px solid ${T.rule}`,
              paddingTop: 'clamp(1.5rem, 4vh, 2.5rem)',
            }}
            className="contact-grid"
          >
            <div>
              <div style={{ ...labelStyle, marginBottom: '1.1rem' }}>What to send</div>
              {[
                'What the business does, in a sentence.',
                "What isn't working, in another.",
                'When you need it live.',
                'Roughly what you are working with.',
              ].map((line) => (
                <div
                  key={line}
                  style={{
                    borderTop: `1px solid ${T.rule}`,
                    padding: '0.75rem 0',
                    fontSize: '1.05rem',
                    lineHeight: 1.5,
                    fontWeight: 300,
                    color: T.graphite,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>

            <div>
              <div style={{ ...labelStyle, marginBottom: '1.1rem' }}>Direct</div>
              <div style={{ borderTop: `1px solid ${T.rule}`, padding: '0.75rem 0' }}>
                <a
                  href="mailto:hello@imprint.studio?subject=Project%20enquiry"
                  data-cursor="view"
                  className="contact-mail"
                  style={{ ...monoStyle, color: T.ink }}
                >
                  hello@imprint.studio
                </a>
              </div>
              <div
                style={{
                  ...monoStyle,
                  color: T.graphite,
                  borderTop: `1px solid ${T.rule}`,
                  padding: '0.75rem 0',
                }}
              >
                Jaipur, IN
              </div>
              <div
                style={{
                  ...monoStyle,
                  color: T.cyan,
                  borderTop: `1px solid ${T.rule}`,
                  padding: '0.75rem 0',
                }}
              >
                Currently booking for Q1
              </div>
            </div>
          </div>

          <div style={{ ...monoStyle, color: T.graphite, marginTop: 'clamp(2.5rem, 5vh, 3.5rem)' }}>
            hello@imprint.studio · Jaipur, IN
          </div>
        </div>
      </div>
    </section>
  );
}

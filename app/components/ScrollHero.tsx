'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useTransform } from 'framer-motion';

import { RegMark } from './RegMarks';
import { useIntroDone } from './introGate';
import { useSectionProgress } from './useSectionProgress';

const PAPER = '#F2EEE6';
const DECKLE = '#E4DED1';
const CYAN = '#0090C1';

const EASE = [0.16, 1, 0.3, 1] as const;

const GRAIN =
  'repeating-radial-gradient(circle at 0 0, rgba(23,21,15,.5) 0 1px, transparent 1px 3px)';

/**
 * Transparent at both edges, darkest through the middle where the beat copy sits.
 *
 * The old ramp was darkest at 0% — the bottom — so the hero's last row of pixels was the
 * darkest thing on screen and met the page's cream head-on. That was the seam. With the
 * canvas now running behind the whole document there is no boundary to land on, and the
 * scrim is shaped so it cannot reintroduce one: it fades out before either edge.
 */
const SCRIM =
  'linear-gradient(to bottom, transparent 0%, rgba(23,21,15,0.30) 20%, ' +
  'rgba(23,21,15,0.62) 50%, rgba(23,21,15,0.34) 78%, transparent 100%)';

/**
 * Local backdrop behind the side beats, the same device beat 4 already uses.
 * Needed once the ink was resolved to its proper feature scale: the big dark masses that
 * used to sit behind this copy are gone, and measured against the finer speckle the body
 * text ran at 2.76:1 mean / 1.68:1 worst, well under the 4.5:1 body-copy floor.
 */
// Sized by its own box — the copy block plus a generous margin — so the ellipse comes out
// text-shaped. Scoping it to the full-height beat slot instead makes it either a visible
// vertical seam (too tall to fade out sideways) or an obvious dark disc.
//
// The falloff is deliberately long and multi-stop: a two-stop radial reads as an oval smudge
// because the alpha ramp is steep enough to see. Most of the darkening now comes from a
// text-shadow on the copy itself, which is invisible as a shape, so the radial can sit low
// enough to have no detectable edge while contrast still holds above 5:1.
// Centre alpha stays high — that is what holds contrast. What made the old version read as
// an oval was the RAMP being steep, not the centre being dark, so the falloff is spread over
// many stops and reaches zero only at the very edge.
//
// `farthest-side` matters: the default farthest-corner sizes the ellipse to reach the box
// CORNERS, so along the horizontal midline the ramp is still part-opaque where the box ends
// and the backdrop shows as a hard rectangle. farthest-side puts the radii exactly on the
// box edges, so alpha is zero everywhere the box stops.
const BEAT_SCRIM =
  'radial-gradient(ellipse farthest-side at center, rgba(23,21,15,0.66) 0%, rgba(23,21,15,0.61) 22%, ' +
  'rgba(23,21,15,0.49) 40%, rgba(23,21,15,0.31) 56%, rgba(23,21,15,0.17) 70%, ' +
  'rgba(23,21,15,0.07) 82%, rgba(23,21,15,0.02) 92%, transparent 100%)';

/** Carries most of the contrast, and unlike a radial it has no perceptible boundary. */
const BEAT_TEXT_SHADOW = '0 1px 14px rgba(23,21,15,0.8)';

const CTA_STYLE: React.CSSProperties = {
  display: 'inline-block',
  background: CYAN,
  color: PAPER,
  fontFamily: 'var(--font-mono), monospace',
  fontSize: '0.7rem',
  letterSpacing: '0.18em',
  padding: '0.95rem 2.6rem',
  borderRadius: 0,
  pointerEvents: 'auto',
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono), monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  // Paper, not cyan. Cyan at 0.68rem over a mid-tone canvas is low contrast whatever the
  // scrim does — the accent moves to the registration mark beside it, where a 11px solid
  // shape carries the colour without having to be read as text.
  color: PAPER,
};

function HeroLabel({
  children,
  center = false,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <span
      style={{
        ...LABEL_STYLE,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        justifyContent: center ? 'center' : 'flex-start',
      }}
    >
      <RegMark size={11} color={CYAN} />
      <span>{children}</span>
    </span>
  );
}

export default function ScrollHero() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [reduced, setReduced] = useState(false);
  const [narrow, setNarrow] = useState(false);
  // The identity block waits for the intro panel to clear so the stagger is seen, not
  // played behind an opaque panel.
  const introDone = useIntroDone();

  // The beats stay tied to the hero container's own progress, measured in the shared loop
  // rather than a second rAF of this component's own. The ink canvas is driven separately
  // off whole-document scroll — it is no longer this component's concern.
  const { progress } = useSectionProgress(containerRef, { mode: 'pinned' });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mw = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      setReduced(mq.matches);
      setNarrow(mw.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    mw.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      mw.removeEventListener('change', sync);
    };
  }, []);

  // ── beats, all driven off the same progress value ────────────────────────
  const idOpacity = useTransform(progress, [0, 0.14], [1, 0]);
  const idY = useTransform(progress, [0, 0.14], [0, -50]);

  const b2Opacity = useTransform(progress, [0.18, 0.3, 0.44, 0.5], [0, 1, 1, 0]);
  const b2X = useTransform(progress, [0.18, 0.3, 0.44, 0.5], [40, 0, 0, 28]);
  const b2Y = useTransform(progress, [0.44, 0.5], [0, -20]);

  const b3Opacity = useTransform(progress, [0.54, 0.66, 0.8, 0.88], [0, 1, 1, 0]);
  const b3X = useTransform(progress, [0.54, 0.66, 0.8, 0.88], [-40, 0, 0, -28]);
  const b3Y = useTransform(progress, [0.8, 0.88], [0, -20]);

  // Beat 4 does not fade out — it holds at full opacity through to the end of the hero.
  const b4Opacity = useTransform(progress, [0.88, 0.96], [0, 1]);
  const b4Y = useTransform(progress, [0.88, 0.96], [36, 0]);
  const b4Backdrop = useTransform(progress, [0.86, 0.96], [0, 1]);

  /**
   * Vertical centring is done with flex on an outer wrapper, never `translateY(-50%)`:
   * framer-motion writes the `transform` property for x/y, so a transform set alongside a
   * motion value in the same style object gets silently overwritten.
   */
  const beatSlot = (side: 'left' | 'right'): React.CSSProperties =>
    narrow
      ? {
          position: 'absolute',
          left: 24,
          right: 24,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }
      : {
          position: 'absolute',
          [side]: 'clamp(2rem, 7vw, 7rem)',
          top: 0,
          bottom: 0,
          width: 380,
          display: 'flex',
          alignItems: 'center',
        };

  const closing = (
    <>
      <div style={{ marginBottom: '1.4rem' }}>
        <HeroLabel center>NOW BOOKING · 2026</HeroLabel>
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-instrument), serif',
          fontSize: 'clamp(2.4rem, 6vw, 5.2rem)',
          lineHeight: 1.02,
          color: PAPER,
          maxWidth: '18ch',
          margin: '0 auto 2.4rem',
          letterSpacing: '-0.01em',
        }}
      >
        Let&rsquo;s make something worth keeping.
      </h2>
      <motion.a
        href="mailto:hello@imprint.studio?subject=Project%20enquiry"
        style={CTA_STYLE}
        data-cursor="view"
        whileHover={{ scale: 1.04, backgroundColor: '#00A6DE' }}
        whileTap={{ scale: 0.98 }}
      >
        START A PROJECT
      </motion.a>
    </>
  );

  const identity = (
    <>
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={introDone ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: reduced ? 0 : 1.0, delay: reduced ? 0 : 0.05, ease: EASE }}
        style={{ marginBottom: '1.6rem' }}
      >
        <HeroLabel>BRAND &amp; ADVERTISING · EST. 2019</HeroLabel>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 56 }}
        animate={introDone ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: reduced ? 0 : 1.3, delay: reduced ? 0 : 0.2, ease: EASE }}
        style={{
          fontFamily: 'var(--font-instrument), serif',
          fontSize: narrow ? 'clamp(2.4rem, 11vw, 4rem)' : 'clamp(3rem, 9vw, 8rem)',
          lineHeight: 0.94,
          letterSpacing: '-0.02em',
          color: PAPER,
          marginBottom: '1.6rem',
        }}
      >
        Set it in ink.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 36 }}
        animate={introDone ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : 0.4, ease: EASE }}
        style={{
          color: DECKLE,
          fontWeight: 300,
          fontSize: '1.05rem',
          lineHeight: 1.65,
          maxWidth: 460,
          marginBottom: '2.4rem',
        }}
      >
        We build identities that survive contact with the real world — on screens, on shelves,
        on paper, on the street.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={introDone ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: reduced ? 0 : 1.0, delay: reduced ? 0 : 0.55, ease: EASE }}
      >
        <motion.a
          href="#work"
          style={CTA_STYLE}
          data-cursor="view"
          whileHover={{ scale: 1.04, backgroundColor: '#00A6DE' }}
          whileTap={{ scale: 0.98 }}
        >
          SEE THE WORK
        </motion.a>
      </motion.div>
    </>
  );

  return (
    <div
      ref={containerRef}
      data-hero-track=""
      style={{ height: reduced ? '100svh' : '500vh', position: 'relative' }}
    >
      <div
        data-hero=""
        data-intro-done={introDone ? 'true' : 'false'}
        style={{
          position: 'sticky',
          top: 0,
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          // Transparent: the ink canvas is a fixed layer beneath the whole document now.
          background: 'transparent',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: SCRIM, pointerEvents: 'none' }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: GRAIN,
            opacity: 0.03,
            pointerEvents: 'none',
          }}
        />

        {/*
          The overlay wrapper carries no opacity or visibility condition of its own. Gating it
          on an images-loaded flag would leave the copy invisible for an unpredictable stretch
          while 180 frames preload. Each block's visibility comes only from its own
          scroll-progress transform.
        */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {reduced ? (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: narrow ? 24 : 'clamp(2rem, 7vw, 7rem)',
                  right: narrow ? 24 : undefined,
                  top: 'clamp(5rem, 12vh, 9rem)',
                  maxWidth: 620,
                }}
              >
                {identity}
              </div>
              {/* A static hero showing only the headline would leave reduced-motion users
                  without any call to action, since beats 2-4 are scroll-driven. */}
              <div
                style={{
                  position: 'absolute',
                  left: 24,
                  right: 24,
                  bottom: 'clamp(3rem, 8vh, 6rem)',
                  textAlign: 'center',
                }}
              >
                {closing}
              </div>
            </>
          ) : (
            <>
              <motion.div
                style={{
                  position: 'absolute',
                  left: narrow ? 24 : 'clamp(2rem, 7vw, 7rem)',
                  right: narrow ? 24 : undefined,
                  bottom: 'clamp(3rem, 10vh, 7rem)',
                  maxWidth: 620,
                  opacity: idOpacity,
                  y: idY,
                }}
              >
                {identity}
              </motion.div>

              <div style={beatSlot('right')}>
                <motion.div
                  style={{ position: 'relative', opacity: b2Opacity, x: b2X, y: b2Y }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: '-85% -48%',
                      background: BEAT_SCRIM,
                      pointerEvents: 'none',
                    }}
                  />
                  <div style={{ position: 'relative' }}>
                    <div style={{ marginBottom: '1.1rem' }}>
                      <HeroLabel center={narrow}>01 / PROOF</HeroLabel>
                    </div>
                    <p
                      style={{
                        color: PAPER,
                        fontWeight: 300,
                        fontSize: '1.05rem',
                        lineHeight: 1.65,
                        textShadow: BEAT_TEXT_SHADOW,
                      }}
                    >
                    Every brand is a physical act. Ink meets paper, idea meets audience, and
                    something permanent happens. We design for that moment.
                    </p>
                  </div>
                </motion.div>
              </div>

              <div style={beatSlot('left')}>
                <motion.div
                  style={{ position: 'relative', opacity: b3Opacity, x: b3X, y: b3Y }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: '-85% -48%',
                      background: BEAT_SCRIM,
                      pointerEvents: 'none',
                    }}
                  />
                  <div style={{ position: 'relative' }}>
                    <div style={{ marginBottom: '1.1rem' }}>
                      <HeroLabel center={narrow}>02 / PRESS</HeroLabel>
                    </div>
                    <p
                      style={{
                        color: PAPER,
                        fontWeight: 300,
                        fontSize: '1.05rem',
                        lineHeight: 1.65,
                        textShadow: BEAT_TEXT_SHADOW,
                      }}
                    >
                    Identity systems, campaigns, and the digital surfaces they live on — built as
                    one thing, not three.
                    </p>
                  </div>
                </motion.div>
              </div>

              <motion.div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(ellipse at center, rgba(23,21,15,0.82) 0%, rgba(23,21,15,0.45) 45%, transparent 80%)',
                  opacity: b4Backdrop,
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 24px',
                }}
              >
                <motion.div style={{ textAlign: 'center', opacity: b4Opacity, y: b4Y }}>
                  {closing}
                </motion.div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useInView, useTransform } from 'framer-motion';

import BrandHero from './BrandHero';
import MaskedLines from './MaskedLines';
import RegMarks, { RegMark } from './RegMarks';
import { useSectionProgress, useReducedMotionFlag } from './useSectionProgress';
import { boardAlt, type Project } from '../data/projects';
import type { ContextPhoto } from '../data/context';
import { brandAssets, type GalleryImage } from '../data/brandAssets';
import { T, column, labelStyle, monoStyle, bodyStyle } from './tokens';

/** Boards sit off-centre at 88% width, alternating side, each with its own parallax. */
function Board({
  src,
  alt,
  index,
  priority = false,
  reduced,
  ratio = '4 / 5',
}: {
  src: string;
  alt: string;
  index: number;
  priority?: boolean;
  reduced: boolean;
  ratio?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { progress } = useSectionProgress(ref);
  const y = useTransform(progress, [0, 1], [50, -50]);
  const left = index % 2 === 0;

  return (
    <motion.div
      ref={ref}
      data-board=""
      style={{
        position: 'relative',
        width: '88%',
        marginLeft: left ? 0 : 'auto',
        marginRight: left ? 'auto' : 0,
        marginBottom: 'clamp(3rem, 8vh, 6rem)',
        aspectRatio: ratio,
        y: reduced ? 0 : y,
        willChange: 'transform',
      }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1240px) 88vw, 1090px"
        priority={priority}
        style={{ objectFit: 'cover' }}
      />
    </motion.div>
  );
}

function Swatch({ hex, index, reduced }: { hex: string; index: number; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  return (
    <div ref={ref}>
      <motion.div
        data-swatch=""
        style={{ aspectRatio: '1 / 1', background: hex, transformOrigin: 'left', willChange: 'transform' }}
        initial={reduced ? { scaleX: 1 } : { scaleX: 0 }}
        animate={inView || reduced ? { scaleX: 1 } : undefined}
        transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      />
      <div style={{ ...monoStyle, color: T.graphite, marginTop: '0.7rem' }}>{hex}</div>
    </div>
  );
}

function ContextShot({ photo, reduced }: { photo: ContextPhoto; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { progress } = useSectionProgress(ref);
  const y = useTransform(progress, [0, 1], [0, -80]);

  return (
    <section
      ref={ref}
      data-context-shot=""
      style={{
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginBottom: 'clamp(4rem, 10vh, 7rem)',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '3 / 2', overflow: 'hidden' }}>
        <motion.div
          style={{ position: 'absolute', inset: '-6% 0', y: reduced ? 0 : y, willChange: 'transform' }}
        >
          <Image src={photo.src} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} />
        </motion.div>
      </div>
      <div style={{ ...column, marginTop: '1rem' }}>
        <div style={{ ...monoStyle, color: T.graphite }}>{photo.caption}</div>
      </div>
    </section>
  );
}

/**
 * One gallery image, with the same parallax and reveal every board on this page already has.
 */
function GalleryShot({
  image,
  index,
  reduced,
  style,
}: {
  image: GalleryImage;
  index: number;
  reduced: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { progress } = useSectionProgress(ref);
  const y = useTransform(progress, [0, 1], [50, -50]);
  const inView = useInView(ref, { once: true, margin: '-12% 0px' });

  return (
    <motion.div
      ref={ref}
      data-gallery-shot=""
      style={{
        position: 'relative',
        overflow: 'hidden',
        aspectRatio: String(image.aspect),
        y: reduced ? 0 : y,
        opacity: reduced || inView ? 1 : 0,
        transition: 'opacity 900ms cubic-bezier(0.16,1,0.3,1)',
        willChange: 'transform',
        ...style,
      }}
    >
      <Image
        src={image.src}
        alt=""
        fill
        sizes="(max-width: 767px) 100vw, 60vw"
        style={{ objectFit: 'cover' }}
      />
    </motion.div>
  );
}

/**
 * The gallery adapts to how much imagery a brand actually has. Forcing a uniform grid onto
 * every brand would make a two-image brand look like a three-image brand with a hole in it.
 *   one    full-bleed
 *   two    a pair, each at its own crop
 *   3+     an asymmetric editorial grid, first image dominant
 */
function Gallery({
  images,
  reduced,
  project,
  framing,
}: {
  images: GalleryImage[];
  reduced: boolean;
  project: Project;
  framing: 'dark' | 'light' | null;
}) {
  if (!images.length) return null;

  /**
   * The section sits on the brand's own dark or light palette colour, chosen from the
   * MEASURED mean luminance of that brand's photography. Dark imagery floated on cream reads
   * as a set of holes punched in the page; light imagery on near-black reads as glare. The
   * decision is per brand because the photography is per brand.
   */
  const dark = framing === 'dark';
  const ground = dark ? project.palette[0] : project.palette[2];
  const label = dark ? project.palette[2] : project.palette[0];

  return (
    <section
      data-gallery=""
      data-gallery-framing={framing ?? 'none'}
      style={{
        padding: 'clamp(2rem, 6vh, 4rem) 0 clamp(4rem, 10vh, 7rem)',
        background: ground,
      }}
    >
      <div style={{ ...column, marginBottom: 'clamp(1.6rem, 4vh, 2.6rem)' }}>
        <div style={{ ...labelStyle, color: label }}>Imagery</div>
      </div>

      {images.length === 1 ? (
        <GalleryShot image={images[0]} index={0} reduced={reduced} />
      ) : images.length === 2 ? (
        <div
          className="gallery-pair"
          style={{
            ...column,
            display: 'grid',
            gridTemplateColumns: '1.25fr 1fr',
            gap: 'clamp(1rem, 3vw, 2.4rem)',
            alignItems: 'start',
          }}
        >
          {images.map((im, i) => (
            <GalleryShot key={im.src} image={im} index={i} reduced={reduced} />
          ))}
        </div>
      ) : (
        <div
          className="gallery-grid"
          style={{
            ...column,
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 'clamp(1rem, 3vw, 2.4rem)',
            alignItems: 'start',
          }}
        >
          {images.map((im, i) => (
            <GalleryShot
              key={im.src}
              image={im}
              index={i}
              reduced={reduced}
              style={
                i === 0
                  ? { gridColumn: 'span 4' }
                  : i === 1
                    ? { gridColumn: 'span 2', alignSelf: 'end' }
                    : { gridColumn: 'span 3' }
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ProjectView({
  project,
  next,
  photo,
}: {
  project: Project;
  next: Project;
  photo: ContextPhoto | null;
}) {
  const reduced = useReducedMotionFlag();
  const assets = brandAssets[project.slug];
  const hasHero = !!assets?.hero;

  const blocks = [
    { label: 'The problem', body: project.problem },
    { label: 'The move', body: project.move },
    { label: 'The system', body: project.system },
    { label: 'The result', body: project.result },
  ];

  return (
    /* These pages are quiet. The home page carries the motion; this carries the work. */
    <main id="main" style={{ minHeight: '100vh' }}>
      {/* The brand's own scrubbed hero, when it has the photography for one. */}
      {hasHero && <BrandHero project={project} assets={assets} />}

      <div style={{ ...column, paddingTop: 'clamp(2rem, 5vh, 3rem)' }}>
        <Link href="/" style={{ ...monoStyle, color: T.graphite }} data-cursor="back">
          &larr; IMPRINT
        </Link>
      </div>

      {/* The title sticks for exactly as long as its wrapper lasts — the first two boards. */}
      <div style={{ ...column, position: 'relative' }}>
        <header
          data-project-title=""
          style={{
            position: reduced ? 'relative' : 'sticky',
            top: 0,
            zIndex: 2,
            background: T.paper,
            padding: 'clamp(4rem, 12vh, 8rem) 0 clamp(2rem, 5vh, 3rem)',
          }}
        >
          <div style={{ ...labelStyle, marginBottom: '1.6rem' }}>{project.categories}</div>
          {/* The hero already sets the name as the page's h1. Repeating it here would give the
              page two, so with a hero this becomes the section heading it actually is. */}
          <MaskedLines
            as={hasHero ? 'h2' : 'h1'}
            lines={[project.name]}
            style={{
              fontFamily: 'var(--font-instrument), serif',
              fontSize: hasHero ? 'clamp(1.8rem, 4vw, 3.2rem)' : 'clamp(2.4rem, 6vw, 4.8rem)',
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              color: T.ink,
              marginBottom: '1.4rem',
            }}
          />
          <div
            style={{
              ...monoStyle,
              color: T.graphite,
              display: 'flex',
              alignItems: 'center',
              gap: '0.9rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{project.sector}</span>
            <RegMark size={11} color={T.cyan} />
            <span>{project.year}</span>
            <RegMark size={11} color={T.cyan} />
            <span>{project.role}</span>
          </div>
        </header>

        <Board
          src={project.wordmarkWide}
          alt={boardAlt(project, 0)}
          index={0}
          ratio="16 / 10"
          priority
          reduced={reduced}
        />
        <Board src={project.images[1]} alt={boardAlt(project, 1)} index={1} reduced={reduced} />
      </div>

      <section style={{ ...column, padding: 'clamp(4rem, 10vh, 7rem) clamp(1.5rem, 5vw, 4rem)' }}>
        <div style={{ borderTop: `1px solid ${T.rule}` }}>
          {blocks.map((b) => (
            <div
              key={b.label}
              className="editorial-row"
              data-editorial=""
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 10rem) minmax(0, 1fr)',
                gap: 'clamp(1rem, 4vw, 3rem)',
                padding: 'clamp(2rem, 4vh, 2.8rem) 0',
                borderBottom: `1px solid ${T.rule}`,
              }}
            >
              <MaskedLines lines={[b.label]} style={{ ...monoStyle, color: T.cyan }} />
              <MaskedLines
                lines={[b.body]}
                duration={0.8}
                style={{ ...bodyStyle, maxWidth: '60ch' }}
              />
            </div>
          ))}
        </div>
      </section>

      <Gallery
        images={assets?.gallery ?? []}
        reduced={reduced}
        project={project}
        framing={assets?.framing ?? null}
      />

      <section style={{ ...column, paddingBottom: 'clamp(4rem, 10vh, 7rem)' }}>
        <div style={{ ...labelStyle, marginBottom: '2rem' }}>Palette</div>
        <div
          data-palette=""
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 'clamp(0.75rem, 2vw, 1.5rem)',
          }}
        >
          {project.palette.map((hex, i) => (
            <Swatch key={hex} hex={hex} index={i} reduced={reduced} />
          ))}
        </div>
      </section>

      <div style={column}>
        <Board src={project.images[2]} alt={boardAlt(project, 2)} index={2} reduced={reduced} />
        <Board src={project.images[3]} alt={boardAlt(project, 3)} index={3} reduced={reduced} />
      </div>

      {photo && (
        <div style={column}>
          <ContextShot photo={photo} reduced={reduced} />
        </div>
      )}

      <div style={column}>
        <Board src={project.images[4]} alt={boardAlt(project, 4)} index={4} reduced={reduced} />
        <Board src={project.images[5]} alt={boardAlt(project, 5)} index={5} reduced={reduced} />
      </div>

      <section style={{ borderTop: `1px solid ${T.rule}` }}>
        <Link href={`/work/${next.slug}`} className="next-link" data-cursor="view">
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Board 01 of the next project, revealed faintly behind the link on hover. */}
            <div className="next-bg" aria-hidden="true">
              <Image src={next.images[0]} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} />
            </div>
            <div
              style={{
                ...column,
                position: 'relative',
                padding: 'clamp(4rem, 10vh, 7rem) clamp(1.5rem, 5vw, 4rem)',
              }}
            >
              <RegMarks inset={6} />
              <div style={{ ...labelStyle, marginBottom: '1.2rem' }}>Next project</div>
              <div
                className="next-name"
                style={{
                  fontFamily: 'var(--font-instrument), serif',
                  fontSize: 'clamp(2rem, 5vw, 3.6rem)',
                  lineHeight: 1.05,
                  color: T.ink,
                  marginBottom: '0.8rem',
                }}
              >
                {next.name}
              </div>
              <div style={{ ...monoStyle, color: T.graphite }}>{next.categories}</div>
            </div>
          </div>
        </Link>
      </section>
    </main>
  );
}

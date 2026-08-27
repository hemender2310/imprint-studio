'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useTransform, type MotionValue } from 'framer-motion';

import MaskedLines from './MaskedLines';
import RegMarks from './RegMarks';
import { boardAlt, projects, type Project } from '../data/projects';
import { useSectionProgress, useReducedMotionFlag } from './useSectionProgress';
import { T, column, sectionPad, labelStyle, monoStyle, h2Style } from './tokens';

/** Different rate per column is what stops a grid reading as a static contact sheet. */
const COLUMN_RANGE = [60, 20, 100];

function Tile({ project, reduced }: { project: Project; reduced: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { progress } = useSectionProgress(ref);
  // Its own passage, independent of the CSS hover scale which lives on the inner img.
  const scale = useTransform(progress, [0, 1], [1, 1.06]);

  return (
    <Link
      ref={ref}
      href={`/work/${project.slug}`}
      className="tile"
      data-cursor="view"
      style={{ display: 'block' }}
    >
      <div
        data-tile-card=""
        style={{ background: T.paper, padding: 'clamp(0.6rem, 1.2vw, 0.9rem)' }}
      >
      <div style={{ position: 'relative', aspectRatio: '4 / 5', overflow: 'hidden' }}>
        <motion.div
          style={{ position: 'absolute', inset: 0, scale: reduced ? 1 : scale, willChange: 'transform' }}
        >
          <Image
            className="tile-img"
            src={project.images[0]}
            alt={boardAlt(project, 0)}
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1079px) 50vw, 33vw"
            style={{ objectFit: 'cover' }}
          />
        </motion.div>
      </div>
      <div style={{ marginTop: '0.9rem' }}>
        <div style={{ fontWeight: 500, color: T.ink, fontSize: '1.05rem' }}>{project.name}</div>
        <div
          style={{
            ...monoStyle,
            color: T.graphite,
            marginTop: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <span>{project.categories}</span>
          <span>{project.year}</span>
        </div>
      </div>
      </div>
    </Link>
  );
}

function Column({
  items,
  range,
  progress,
  reduced,
}: {
  items: Project[];
  range: number;
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  const y = useTransform(progress, [0, 1], [range, -range]);
  return (
    <motion.div
      data-work-col=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(1.5rem, 3vw, 2.5rem)',
        y: reduced ? 0 : y,
        willChange: 'transform',
      }}
    >
      {items.map((p) => (
        <Tile key={p.slug} project={p} reduced={reduced} />
      ))}
    </motion.div>
  );
}

export default function Work() {
  const ref = useRef<HTMLElement>(null);
  const { progress } = useSectionProgress(ref);
  const reduced = useReducedMotionFlag();

  const columns = [0, 1, 2].map((c) => projects.filter((_, i) => i % 3 === c));

  return (
    <section id="work" ref={ref} style={{ ...sectionPad, background: 'transparent' }}>
      <div style={column}>
        <RegMarks inset={6} />

        <div style={{ ...labelStyle, marginBottom: '1.4rem' }}>Selected work</div>
        <MaskedLines
          as="h2"
          lines={['Six proofs.']}
          style={{ ...h2Style, marginBottom: 'clamp(3rem, 7vh, 5rem)' }}
        />

        <div
          className="work-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 'clamp(1.5rem, 3vw, 2.5rem)',
            alignItems: 'start',
          }}
        >
          {columns.map((items, i) => (
            <Column
              key={i}
              items={items}
              range={COLUMN_RANGE[i]}
              progress={progress}
              reduced={reduced}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

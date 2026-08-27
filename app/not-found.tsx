import type { Metadata } from 'next';
import Link from 'next/link';

import RegMarks from './components/RegMarks';
import { projects } from './data/projects';
import { T, column, labelStyle, monoStyle } from './components/tokens';

/**
 * Rendered inside the root layout, so it inherits the cursor, the page transition and the
 * top bar automatically — a 404 should not feel like it fell off the site.
 */
export const metadata: Metadata = {
  title: 'Page not found — IMPRINT',
  description: 'This page was never printed. Nothing lives at this address.',
};

export default function NotFound() {
  return (
    <main id="main"
      data-not-found=""
      style={{
        background: 'transparent',
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(5rem, 14vh, 9rem) 0',
      }}
    >
      <div style={{ ...column, textAlign: 'center' }}>
        <RegMarks inset={6} />

        <div style={{ ...labelStyle, marginBottom: '1.8rem' }}>Error 404</div>

        <h1
          style={{
            fontFamily: 'var(--font-instrument), serif',
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            lineHeight: 1.06,
            letterSpacing: '-0.01em',
            color: T.ink,
            fontWeight: 400,
            marginBottom: '1.4rem',
          }}
        >
          This page was never printed.
        </h1>

        <p
          style={{
            fontSize: '1.05rem',
            lineHeight: 1.65,
            fontWeight: 300,
            color: T.graphite,
            maxWidth: 460,
            margin: '0 auto clamp(2.5rem, 5vh, 3.5rem)',
          }}
        >
          Nothing lives at this address — the link is wrong, or whatever was here has moved.
        </p>

        <Link
          href="/#work"
          data-cursor="view"
          style={{
            display: 'inline-block',
            background: T.cyan,
            color: T.paper,
            fontFamily: 'var(--font-mono), monospace',
            fontSize: '0.7rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            padding: '1rem 2.8rem',
            borderRadius: 0,
          }}
        >
          See the work
        </Link>

        <div
          style={{
            ...monoStyle,
            color: T.graphite,
            marginTop: 'clamp(2.5rem, 5vh, 3.5rem)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem 1.1rem',
            justifyContent: 'center',
          }}
        >
          {projects.map((p) => (
            <Link
              key={p.slug}
              href={`/work/${p.slug}`}
              data-cursor="view"
              className="nf-slug"
              style={{ color: T.graphite }}
            >
              {p.slug}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

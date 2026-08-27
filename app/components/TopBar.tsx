'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import { projects } from '../data/projects';
import { useReducedMotionFlag } from './useSectionProgress';
import { T, monoStyle } from './tokens';

/** Same wipe and easing as PageTransition, so the two read as one system. */
const EASE = [0.76, 0, 0.24, 1] as const;
const WIPE = 0.5;

const SECTIONS = [
  { label: 'Manifesto', hash: '#manifesto' },
  { label: 'Services', hash: '#services' },
  { label: 'Process', hash: '#process' },
  { label: 'Contact', hash: '#contact' },
];

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotionFlag();

  const isHome = pathname === '/';
  const [open, setOpen] = useState(false);
  // On the home route the bar stays out of the way until the hero has been passed.
  const [barVisible, setBarVisible] = useState(!isHome);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setBarVisible(!isHome);
  }, [pathname, isHome]);

  // Reuse the hero flag rather than adding another observer: the bar appears exactly when
  // the hero stops covering the viewport.
  useEffect(() => {
    if (!isHome) return;
    const hero = document.querySelector('[data-hero]');
    if (!hero) {
      setBarVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setBarVisible(!entry.isIntersecting),
      { threshold: 0.55 }
    );
    io.observe(hero);
    return () => io.disconnect();
  }, [isHome, pathname]);

  // Body scroll locks through Lenis rather than overflow:hidden — the page uses Lenis for
  // scrolling, so toggling overflow would leave it running underneath.
  useEffect(() => {
    const lenis = (window as unknown as { __lenis?: { stop: () => void; start: () => void } })
      .__lenis;
    if (open) lenis?.stop();
    else lenis?.start();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // Escape closes; Tab is trapped inside the overlay while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = overlayRef.current;
      if (!root) return;
      const focusable = [
        ...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      overlayRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    }, reduced ? 60 : WIPE * 1000 * 0.7);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, close, reduced]);

  const goToSection = (hash: string) => {
    close();
    if (isHome) {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'auto' });
    } else {
      router.push(`/${hash}`);
    }
  };

  return (
    <>
      <motion.header
        data-topbar=""
        data-visible={barVisible ? 'true' : 'false'}
        initial={false}
        animate={{ opacity: barVisible ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.4, ease: 'linear' }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.1rem clamp(1.5rem, 5vw, 4rem)',
          borderBottom: `1px solid ${T.rule}`,
          background: 'rgba(242,238,230,0.86)',
          backdropFilter: 'blur(6px)',
          pointerEvents: barVisible ? 'auto' : 'none',
        }}
      >
        <Link href="/" style={{ ...monoStyle, color: T.ink }} data-cursor="view">
          IMPRINT
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="imprint-menu"
          style={{ ...monoStyle, color: T.ink, cursor: 'none' }}
          data-cursor="view"
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </motion.header>

      <motion.div
        ref={overlayRef}
        id="imprint-menu"
        data-menu-overlay=""
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
        initial={false}
        animate={
          reduced
            ? { opacity: open ? 1 : 0, scaleY: 1 }
            : { scaleY: open ? 1 : 0, opacity: 1 }
        }
        transition={{ duration: reduced ? 0.15 : WIPE, ease: reduced ? 'linear' : EASE }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9500,
          background: T.ink,
          transformOrigin: open ? 'bottom' : 'top',
          pointerEvents: open ? 'auto' : 'none',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 'clamp(5rem, 12vh, 8rem) clamp(1.5rem, 5vw, 4rem) clamp(3rem, 8vh, 5rem)',
          willChange: 'transform, opacity',
        }}
      >
        <nav aria-label="Projects">
          {projects.map((p) => (
            <Link
              key={p.slug}
              href={`/work/${p.slug}`}
              onClick={close}
              className="menu-row"
              data-cursor="view"
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '1.5rem',
                padding: 'clamp(0.5rem, 1.4vh, 0.9rem) 0',
                flexWrap: 'wrap',
              }}
            >
              <span
                className="menu-name"
                style={{
                  fontFamily: 'var(--font-instrument), serif',
                  fontSize: 'clamp(1.6rem, 4vw, 3rem)',
                  lineHeight: 1.1,
                  color: T.paper,
                }}
              >
                {p.name}
              </span>
              <span style={{ ...monoStyle, color: T.cyan }}>{p.categories}</span>
            </Link>
          ))}
        </nav>

        <div
          style={{
            borderTop: `1px solid rgba(242,238,230,0.18)`,
            marginTop: 'clamp(1.5rem, 4vh, 2.5rem)',
            paddingTop: 'clamp(1.5rem, 4vh, 2.5rem)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem 2.2rem',
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.hash}
              type="button"
              onClick={() => goToSection(s.hash)}
              className="menu-section"
              data-cursor="view"
              style={{ ...monoStyle, color: T.paper, cursor: 'none' }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div
          style={{
            ...monoStyle,
            color: 'rgba(242,238,230,0.55)',
            marginTop: 'clamp(2rem, 5vh, 3rem)',
          }}
        >
          hello@imprint.studio · Jaipur, IN
        </div>
      </motion.div>
    </>
  );
}

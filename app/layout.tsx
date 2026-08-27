import type { Metadata } from 'next';
import { Instrument_Serif, Archivo, JetBrains_Mono } from 'next/font/google';

import './globals.css';
import Cursor from './components/Cursor';
import PageTransition from './components/PageTransition';
import TopBar from './components/TopBar';
import IntroSequence from './components/IntroSequence';
import InkCanvas from './components/InkCanvas';
import CursorTrail from './components/CursorTrail';
import SmoothScroll from './components/SmoothScroll';

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-instrument',
});

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
  variable: '--font-archivo',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://imprint.studio'),
  title: 'IMPRINT — Brand & Advertising Studio',
  description:
    'IMPRINT is a brand and advertising studio building identities that survive contact with the real world — on screens, on shelves, on paper, on the street.',
  openGraph: {
    title: 'IMPRINT — Brand & Advertising Studio',
    description:
      'Identity systems, campaigns, and the digital surfaces they live on — built as one thing, not three.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${archivo.variable} ${mono.variable}`}>
      <head>
        {/*
          Runs before first paint. The intro panel is server-rendered so it covers the first
          frame of a first visit; this marks repeat visits within the session so CSS can hide
          it immediately, rather than letting React unmount it a beat later.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(sessionStorage.getItem('imprint-intro-seen')==='1'){document.documentElement.dataset.introSeen='1'}}catch(e){}",
          }}
        />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <InkCanvas />
        <SmoothScroll>
          <TopBar />
          <PageTransition>{children}</PageTransition>
        </SmoothScroll>
        {/* Siblings above everything, so both carry across the project routes too. */}
        <IntroSequence />
        <Cursor />
        <CursorTrail />
      </body>
    </html>
  );
}

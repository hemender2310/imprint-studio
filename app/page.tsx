import type { Metadata } from 'next';

import ScrollHero from './components/ScrollHero';
import Manifesto from './components/Manifesto';
import Services from './components/Services';
import Work from './components/Work';
import Process from './components/Process';
import Industries from './components/Industries';
import ClosingCTA from './components/ClosingCTA';

export const metadata: Metadata = {
  title: 'IMPRINT — Brand & Advertising Studio',
  description:
    'A brand and advertising studio in Jaipur. Identity systems, campaigns, and the digital surfaces they live on — built as one thing, not three.',
};

export default function Home() {
  return (
    <main id="main">
      <ScrollHero />
      <Manifesto />
      <Services />
      <Work />
      <Process />
      <Industries />
      <ClosingCTA />
    </main>
  );
}

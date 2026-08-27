'use client';

import { useEffect, useState } from 'react';

/**
 * Tiny signal so the hero's staggered identity entrance starts only once the intro panel has
 * cleared, rather than playing behind it. A module-level flag rather than context because it
 * is written once per session and read by one component.
 */
let done = false;
const subscribers = new Set<() => void>();

export function markIntroDone() {
  if (done) return;
  done = true;
  subscribers.forEach((f) => f());
  subscribers.clear();
}

export function useIntroDone() {
  const [value, setValue] = useState(done);
  useEffect(() => {
    if (done) {
      setValue(true);
      return;
    }
    const f = () => setValue(true);
    subscribers.add(f);
    return () => {
      subscribers.delete(f);
    };
  }, []);
  return value;
}

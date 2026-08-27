import { FRAME_COUNT, framePath } from '../data/frames';

/** Every 8th frame. A coarse pass makes the scrub usable long before the backfill lands. */
export const STRIDE = 8;

export const COARSE_INDICES: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < FRAME_COUNT; i += STRIDE) out.push(i);
  return out;
})();

/**
 * The intro waits for 24 frames — enough for the coarse scrub. The stride set yields 23 at
 * FRAME_COUNT 180, so one midpoint is added rather than letting the target silently become
 * whatever the stride happened to produce.
 */
export const INTRO_INDICES: number[] = (() => {
  const out = [...COARSE_INDICES];
  let gap = Math.floor(STRIDE / 2);
  while (out.length < 24 && gap < FRAME_COUNT) {
    if (!out.includes(gap)) out.push(gap);
    gap += STRIDE;
  }
  return out.slice(0, 24);
})();

export const INTRO_TARGET = INTRO_INDICES.length;

/**
 * Loads the coarse pass, reporting real completions. ScrollHero fetches the same URLs for its
 * own drawing, so these requests warm exactly the frames it needs and cost nothing twice.
 *
 * `onProgress` fires on error as well as load: a frame that 404s still has to count, or a
 * single failed request would leave the intro counter short and the panel up forever.
 */
export function preloadCoarse(onProgress: (loaded: number, total: number) => void): () => void {
  const total = INTRO_TARGET;
  const wanted = INTRO_INDICES;
  let loaded = 0;
  let cancelled = false;
  const images: HTMLImageElement[] = [];

  for (const index of wanted) {
    const img = new window.Image();
    images.push(img);
    const settle = () => {
      if (cancelled) return;
      loaded++;
      onProgress(loaded, total);
    };
    img.onload = settle;
    img.onerror = settle;
    img.src = framePath(index);
  }

  return () => {
    cancelled = true;
    images.forEach((i) => {
      i.onload = null;
      i.onerror = null;
    });
  };
}

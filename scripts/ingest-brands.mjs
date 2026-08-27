/**
 * IMPRINT — brand asset ingest.
 *
 * Reads the source folders under ./BRANDS (named by CATEGORY, not by slug), measures every
 * image, classifies each one, and writes web-ready WebP into public/brands/<slug>/.
 *
 *   node scripts/ingest-brands.mjs --inventory   # measure and print, write nothing
 *   node scripts/ingest-brands.mjs              # measure, classify, convert
 *
 * WHY MEASURE RATHER THAN TRUST THE FILENAME
 * The sources are named "… DARK LOGO", "… AD2" and so on, which looks like a convention worth
 * relying on. It is not one: a file called LOGO may be a flat opaque rectangle with no alpha
 * at all, and which "AD" makes the best hero is a question about the picture, not its name.
 * Everything below is decided from pixels.
 *
 * Decisions this file makes, all from measurement:
 *   LOGO      real alpha channel with >15% fully transparent area, or a near-square mark on a
 *             flat ground. An opaque "logo" is reported as such and placed on a solid palette
 *             ground rather than composited over photography.
 *   HERO      the landscape candidate with the calmest LOWER-LEFT region, because that is
 *             where the project name sits in BrandHero. Widest aspect and highest resolution
 *             break ties; edge density decides.
 *   GALLERY   everything else.
 */

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { projects } from '../app/data/projects.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'BRANDS');
const OUT = path.join(ROOT, 'public', 'brands');

/** Source folders are named by category. Nothing about the mapping is derivable, so it is data. */
const FOLDERS = {
  SNEAKERS: 'vyntrix',
  WATCH: 'vaelcron',
  CLOTHING: 'rethread',
  'TOURS & TRAVEL': 'voyaze',
  'VIDEO-GAME': 'voxaris',
  SECURITY: 'sentinel',
};

/**
 * WHAT THE SOURCE MATERIAL ACTUALLY IS, and why this is a plan rather than a classifier.
 *
 * The inventory pass (--inventory) measures every file, and the measurements say something a
 * naming convention would have hidden:
 *
 *   · Exactly ONE file in the whole set has a real alpha channel (VAELCRON DARK LOGO, 41.4%
 *     clear). The other eleven "logos" are lockups printed on a flat white or flat black
 *     ground. They are keyed out below rather than pasted onto a coloured rectangle — a flat
 *     ground is a cut-out waiting to happen, and a keyed logo drops onto any board.
 *   · Every "AD" is a FINISHED ADVERTISEMENT with headline type and the logo already set.
 *     None can be used whole as a hero: BrandHero sets the project name in the lower left,
 *     and these already have a headline there. Heroes are cropped OUT of the photographic
 *     region instead, which is what the crop rectangles below are for.
 *   · Three ads carry third-party trademarks in frame — a Lamborghini badge on a steering
 *     wheel, Steam/PS5/Xbox marks in a platform strip, LEGION and INZONE booth signage, and
 *     social-network icons. Every crop below is placed to exclude them. This is the same rule
 *     that governs the cursor trail: a real company's mark on a studio's own site reads as a
 *     claim to have worked for them.
 *
 * HERO CROPS ARE SEARCHED, NOT LISTED. What is listed is `forbid`: regions known to carry
 * copy or a trademark that the automatic test cannot see.
 *
 * The text test below is reliable on isolated type. It is NOT reliable on a dense composite
 * scene — a photographed trade stand marks a third of its pixels as edges at any sensitivity
 * that still catches small captions, every letter touches its neighbours and the scene behind
 * it, and Sentinel's stand came back as a single 632x427 component with no glyphs in it at
 * all. Where that happens the copy-bearing regions are marked here by inspection and the
 * search does the rest, which is the same mechanism the trademarks already needed: a badge on
 * a steering wheel is not type and no text detector will ever see it.
 *
 * Anything missing here degrades on its own: no logo entry means the brand keeps its
 * generated wordmark, no hero means the page falls back to board 01w, no gallery means the
 * section is skipped. One brand's missing file never touches another's.
 */
const PLAN = {
  vyntrix: {
    logoDark: 'VYNTRIX DARK LOGO.png',
    logoLight: 'VYNTRIX LIGHT LOGO.png',
    forbid: {
      'VYNTRIX AD.png': [[0, 0, 0.44, 1]],
      'VYNTRIX AD 1.png': [[0, 0, 0.52, 1]],
      'VYNTRIX AD 2.png': [[0.55, 0.15, 0.45, 0.55]],
    },
    gallery: [
      { file: 'VYNTRIX AD 1.png', rect: [0.52, 0.098, 0.48, 0.879] },
      { file: 'VYNTRIX AD.png', rect: [0.456, 0.127, 0.544, 0.612] },
    ],
  },
  vaelcron: {
    logoDark: 'VAELCRON DARK LOGO.png',
    logoLight: 'VAELCRON LIGHT LOGO.png',
    logoRect: [0, 0, 1, 0.9],
    forbid: {
      'VAELCRON AD.png': [[0, 0, 0.6, 1], [0, 0.82, 1, 0.18]],
      // Baked lockup above, baked line below, and the badge on the wheel — a trademark, and a
      // graphic rather than type, so nothing automatic can see it.
      'VAELCRON AD2.png': [[0.3, 0, 0.45, 0.4], [0.2, 0.78, 0.6, 0.22], [0.66, 0.5, 0.22, 0.2]],
    },
    gallery: [
      { file: 'VAELCRON AD.png', rect: [0.558, 0.303, 0.442, 0.59] },
      { file: 'VAELCRON AD2.png', rect: [0.678, 0.053, 0.322, 0.226] },
    ],
  },
  rethread: {
    logoDark: 'RETHREAD DARK LOGO.png',
    logoLight: 'RETHREAD LIGHT LOGO.png',
    // Drops the four feature icons and the strapline beneath the primary lockup.
    logoRect: [0, 0, 1, 0.7],
    forbid: {
      // The garment itself is printed with four lines of display copy — not advertisement
      // layout, but four lines of type competing with the page's own headline all the same.
      'RETHREAD AD.png': [
        [0, 0, 0.42, 1],
        [0, 0.64, 1, 0.36],
        [0.7, 0.4, 0.3, 0.28],
        [0.42, 0.16, 0.34, 0.3],
      ],
      'RETHREAD AD2.png': [[0, 0.07, 0.72, 0.4], [0.7, 0.33, 0.3, 0.3], [0.1, 0.53, 0.45, 0.08]],
    },
    gallery: [
      { file: 'RETHREAD AD2.png', rect: [0.605, 0.391, 0.395, 0.351] },
      { file: 'RETHREAD AD.png', rect: [0.42, 0.247, 0.58, 0.29] },
      { file: 'RETHREAD AD2.png', rect: [0, 0.508, 1, 0.375] },
    ],
  },
  voyaze: {
    logoDark: 'VOYAZE DARK LOGO.png',
    logoLight: 'VOYAZE LIGHT LOGO.png',
    logoRect: [0, 0, 1, 0.76],
    forbid: {
      // Left column, refund card, and the whole lower half — feature cards, CTA bar and the
      // social-network icons, which are trademarks and glyph-shaped without being type.
      // 0.45 left the tail of "...THE WORLD SEES IT." just outside the zone, and a two-glyph
      // fragment does not make a row, so nothing flagged it.
      'VOYAZE AD.png': [[0, 0, 0.56, 0.62], [0.72, 0, 0.28, 0.2], [0, 0.62, 1, 0.38]],
      // A trade stand: every surface in frame is signage.
      'VOYAZE AD2.png': [[0, 0, 1, 1]],
    },
    gallery: [
      { file: 'VOYAZE AD.png', rect: [0.46, 0.428, 0.54, 0.405] },
      { file: 'VOYAZE AD2.png', rect: [0.169, 0.029, 0.638, 0.718] },
    ],
  },
  voxaris: {
    logoDark: 'VOXARIS DARK LOGO.png',
    logoLight: 'VOXARIS LIGHT LOGO.png',
    forbid: {
      // Platform marks along the foot of the sheet, the key-art panel column down the right
      // with its captions, and the headline block on the left.
      // The strapline across the head of the sheet — "GAMES THAT ENTERTAIN. / STORIES THAT
      // MATTER. / CHANGE THAT LASTS." It measured 0.83% and passed the gate, and it is
      // plainly readable above the project name. Metrics do not replace looking.
      'VOXARIS AD.png': [
        [0, 0, 1, 0.12],
        [0, 0.88, 0.62, 0.12],
        [0.55, 0, 0.45, 0.78],
        [0, 0.42, 0.58, 0.46],
      ],
      'VOXARIS AD2.png': [[0, 0, 1, 1]],
    },
    gallery: [
      { file: 'VOXARIS AD.png', rect: [0.052, 0.102, 0.435, 0.365] },
      { file: 'VOXARIS AD2.png', rect: [0.241, 0.449, 0.475, 0.537] },
    ],
  },
  sentinel: {
    logoDark: 'SENTINEL DARK LOGO.png',
    logoLight: 'SENTINEL LIGHT LOGO.png',
    forbid: {
      'SENTINEL AD.png': [[0, 0, 0.44, 1], [0, 0.78, 1, 0.22], [0.85, 0, 0.15, 0.25]],
      'SENTINEL AD2.png': [[0, 0, 1, 1]],
    },
    gallery: [
      { file: 'SENTINEL AD.png', rect: [0.67, 0.107, 0.278, 0.463] },
      { file: 'SENTINEL AD2.png', rect: [0.13, 0.039, 0.684, 0.77] },
    ],
  },
};

/**
 * Board 01's ground per brand, from Part B. It decides which logo variant is used: a light
 * mark on the four dark boards, a dark mark on the two light ones.
 */
const LIGHT_GROUND = new Set(['rethread', 'voyaze']);

const LOGO_MAX = 1200;
const HERO_W = 2560;
const GALLERY_W = 1600;
const Q = 0.82;

const INVENTORY_ONLY = process.argv.includes('--inventory');

const hex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Measure one image in the browser. Everything the classifier needs comes back in one pass so
 * a 4000px PNG is decoded once, not once per question.
 */
async function measure(page, dataUrl) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    try {
      await img.decode();
    } catch {
      return null;
    }
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (!W || !H) return null;

    // Measure on a bounded copy: full resolution buys nothing here and costs seconds.
    const S = 480;
    const sw = W >= H ? S : Math.round((S * W) / H);
    const sh = W >= H ? Math.round((S * H) / W) : S;
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, sw, sh);
    g.drawImage(img, 0, 0, sw, sh);
    const d = g.getImageData(0, 0, sw, sh).data;

    let clear = 0;
    let partial = 0;
    let lumSum = 0;
    let opaqueN = 0;
    const ring = [];
    const buckets = new Map();
    const lumField = new Float32Array(sw * sh);

    const band = Math.max(2, Math.round(Math.min(sw, sh) * 0.03));
    for (let i = 0, px = 0; i < d.length; i += 4, px++) {
      const x = px % sw;
      const y = (px - x) / sw;
      if (x < band || y < band || x >= sw - band || y >= sh - band)
        ring.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      const a = d[i + 3];
      if (a === 0) clear++;
      else if (a < 250) partial++;
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      lumField[px] = a === 0 ? -1 : lum;
      if (a > 200) {
        opaqueN++;
        lumSum += lum;
        const key = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
        const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n++;
        e.r += d[i];
        e.g += d[i + 1];
        e.b += d[i + 2];
        buckets.set(key, e);
      }
    }

    const dominant = [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((e) => ({
        r: e.r / e.n,
        g: e.g / e.n,
        b: e.b / e.n,
        share: e.n / Math.max(1, opaqueN),
      }));

    // Edge density by Sobel magnitude, per region. Transparent pixels are skipped so a logo's
    // cut-out ground does not read as "calm".
    const at = (x, y) => lumField[y * sw + x];
    const edgeIn = (x0, y0, x1, y1) => {
      let sum = 0;
      let n = 0;
      for (let y = Math.max(1, y0); y < Math.min(sh - 1, y1); y++) {
        for (let x = Math.max(1, x0); x < Math.min(sw - 1, x1); x++) {
          const c0 = at(x, y);
          if (c0 < 0) continue;
          const gx =
            -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
            at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
          const gy =
            -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
            at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
          sum += Math.hypot(gx, gy);
          n++;
        }
      }
      return n ? sum / n : 0;
    };

    // The region BrandHero puts the project name in: left third, lower 45%.
    const lowerLeft = edgeIn(0, Math.round(sh * 0.55), Math.round(sw / 3), sh);
    const whole = edgeIn(0, 0, sw, sh);

    // Mean luminance of that same region, for the scrim calculation later.
    let llSum = 0;
    let llN = 0;
    for (let y = Math.round(sh * 0.55); y < sh; y++) {
      for (let x = 0; x < Math.round(sw / 3); x++) {
        const v = lumField[y * sw + x];
        if (v >= 0) {
          llSum += v;
          llN++;
        }
      }
    }

    // Standard deviation of the border ring: how FLAT the ground is. A lockup printed on
    // flat white or flat black keys perfectly; one printed over photography does not, and no
    // amount of threshold tuning fixes that — the ground has structure the mark also has.
    const ringMean = ring.reduce((a, v) => a + v, 0) / Math.max(1, ring.length);
    const ringStd = Math.sqrt(
      ring.reduce((a, v) => a + (v - ringMean) ** 2, 0) / Math.max(1, ring.length)
    );

    return {
      w: W,
      h: H,
      ringMean,
      ringStd,
      clearPct: (clear / (sw * sh)) * 100,
      partialPct: (partial / (sw * sh)) * 100,
      meanLum: opaqueN ? lumSum / opaqueN : 0,
      lowerLeftLum: llN ? llSum / llN : 0,
      dominant,
      edgeLowerLeft: lowerLeft,
      edgeWhole: whole,
    };
  }, dataUrl);
}

/** A PNG on disk becomes a data: URL so the page can decode it without a server. */
function toDataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fss.readFileSync(file).toString('base64')}`;
}

/**
 * Cut a lockup out of the ground it was printed on.
 *
 * Only ONE of the twelve source logos carries real alpha; the rest are lockups sitting on a
 * ground. A flat-colour key was the obvious approach and it is wrong here: half the files put
 * the mark on textured photography — VYNTRIX's sits on lit rock — and keying near-black left
 * the mountain in the cut-out.
 *
 * What every one of them DOES have is separation in luminance: a bright metallic mark on a
 * dark ground, or a dark mark on flat white. So the key is built from the image's own
 * histogram. The border ring is the ground by definition; its 99th percentile is the
 * brightest the ground ever gets, and everything clear of that by a margin is the mark. The
 * smoothstep between the two keeps the anti-aliased edge instead of stair-stepping it, and
 * the mark keeps its own colours — Sentinel's gold fingerprint and Rethread's green leaf both
 * survive, which a recolour-to-flat approach would have thrown away.
 *
 * Returns the trimmed mark plus `ink`, the mean colour of what survived.
 */
async function keyLogo(page, dataUrl, maxW, rect = null, flatten = null) {
  return page.evaluate(
    async ([src, maxW, rect, flatten]) => {
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch {
        return null;
      }
      // Key the WHOLE image first and crop afterwards. Cropping first was the obvious order
      // and it broke: a rect that trims the feature row below the lockup cuts through the
      // wordmark's descenders, so the border ring — which is supposed to BE the ground —
      // filled with black glyphs, the measured range collapsed to nothing, and the key was
      // silently skipped. The true border is always the ground; crop after.
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.clearRect(0, 0, w, h);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      const im = g.getImageData(0, 0, w, h);
      const d = im.data;

      const lumAt = (k) => 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];

      let clear = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] === 0) clear++;
      const alreadyAlpha = clear / (w * h) > 0.15;

      let keyed = false;
      let mode = 'alpha';
      // Default for a file that already carries alpha: its own alpha IS the ink.
      let inkTest = (L) => L >= 0;
      // Where the SOURCE had ink, recorded before the key touches anything.
      //
      // It cannot be recovered afterwards: canvas stores premultiplied alpha, so reading back
      // a pixel whose alpha was set to 0 returns RGB 0,0,0 — a keyed-out white ground comes
      // back as black and tests as ink, which put retention at 6%.
      const srcIsInk = new Uint8Array(w * h);
      if (alreadyAlpha) {
        for (let i = 0, px = 0; i < d.length; i += 4, px++) srcIsInk[px] = d[i + 3] >= 128 ? 1 : 0;
      }
      if (!alreadyAlpha) {
        // The border ring IS the ground. A 3% band on all four sides, so a mark that runs
        // close to one edge cannot poison the estimate.
        const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
        const ring = [];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (x >= band && x < w - band && y >= band && y < h - band) continue;
            ring.push(lumAt((y * w + x) * 4));
          }
        }
        ring.sort((a, b) => a - b);
        const q = (arr, f) => arr[Math.min(arr.length - 1, Math.round(f * (arr.length - 1)))];
        const ringLo = q(ring, 0.01);
        const ringHi = q(ring, 0.99);
        const ringMid = q(ring, 0.5);

        const all = [];
        for (let i = 0; i < d.length; i += 4) all.push(lumAt(i));
        all.sort((a, b) => a - b);
        const peakHi = q(all, 0.999);
        const peakLo = q(all, 0.001);

        // Polarity: is the mark brighter than its ground, or darker?
        const bright = ringMid < 128;
        const from = bright ? ringHi : ringLo;
        const to = bright ? peakHi : peakLo;
        const range = Math.abs(to - from);

        if (range >= 40) {
          // Thresholds sit just past the GROUND'S OWN extreme, not at a fraction of the
          // distance to the mark's extreme.
          //
          // The fractional version (0.30 / 0.62 of the range) cut Voyaze's tagline in half:
          // "WE PLAN. YOU CREATE." is near-black and survived, "YOU GET REWARDED." is coral at
          // luminance ~172 and the cut landed at 175, so half a line of type was erased. The
          // ground is white to within a few levels of 245; anything darker than that is mark,
          // whatever colour it is. Debris from a textured ground is handled below by size,
          // which is what it actually differs by — not by being faint.
          const margin = Math.max(6, range * 0.04);
          const t0 = from + (bright ? 1 : -1) * margin;
          const t1 = t0 + (bright ? 1 : -1) * Math.max(10, range * 0.22);
          // "Source ink" is defined at the MIDPOINT of the key's own ramp, so the two
          // measurements answer the same question. Defined any looser — a hair past the
          // ground — every soft key would report well under 100% simply because its edge
          // pixels are partly transparent by design, and the number would say nothing about
          // whether anything real was lost.
          const mid = (t0 + t1) / 2;
          const inkAt = bright ? (L) => L >= mid : (L) => L <= mid;
          for (let i = 0, px = 0; i < d.length; i += 4, px++) {
            const L = lumAt(i);
            srcIsInk[px] = inkAt(L) ? 1 : 0;
            let t = bright ? (L - t0) / (t1 - t0) : (t0 - L) / (t0 - t1);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            // Smoothstep, so the anti-aliased edge stays an edge, and a low floor only to
            // drop the sub-perceptual tail.
            const a = d[i + 3] * (t * t * (3 - 2 * t));
            d[i + 3] = a < 40 ? 0 : Math.round(((a - 40) / 215) * 255);
          }
          keyed = true;
          mode = bright ? 'bright-on-dark' : 'dark-on-light';
          inkTest = inkAt;
        }
      }
      g.putImageData(im, 0, 0);

      // NOW take the rect, on the keyed result.
      const rx = rect ? Math.round(rect[0] * w) : 0;
      const ry = rect ? Math.round(rect[1] * h) : 0;
      const rw = rect ? Math.round(rect[2] * w) : w;
      const rh = rect ? Math.round(rect[3] * h) : h;
      if (rect) {
        const cropped = document.createElement('canvas');
        cropped.width = rw;
        cropped.height = rh;
        cropped.getContext('2d').drawImage(c, rx, ry, rw, rh, 0, 0, rw, rh);
        c.width = rw;
        c.height = rh;
        g.clearRect(0, 0, rw, rh);
        g.drawImage(cropped, 0, 0);
      }
      const cw = rect ? rw : w;
      const ch = rect ? rh : h;
      const im2 = g.getImageData(0, 0, cw, ch);
      const cd = im2.data;

      // ── DEBRIS. A textured ground leaves speckles that clear the threshold — Vyntrix's
      // lockup sits on lit rock and kept a scatter of highlights that read as dust on the
      // print. They differ from the mark by SIZE, not by being faint, so they are removed by
      // size: label every connected run of opaque pixels and drop the ones under 0.05% of the
      // mark's own bounding box. Nothing the mark is made of is that small — the smallest
      // real element, a tagline letter, is an order of magnitude larger.
      const label = new Int32Array(cw * ch).fill(-1);
      const comps = [];
      const stack = new Int32Array(cw * ch);
      for (let start = 0; start < cw * ch; start++) {
        if (label[start] !== -1 || cd[start * 4 + 3] < 40) continue;
        const id = comps.length;
        let sp = 0;
        stack[sp++] = start;
        label[start] = id;
        let n = 0;
        let alphaSum = 0;
        let x0 = cw;
        let x1 = -1;
        let y0 = ch;
        let y1 = -1;
        while (sp > 0) {
          const q = stack[--sp];
          const qx = q % cw;
          const qy = (q - qx) / cw;
          n++;
          alphaSum += cd[q * 4 + 3];
          if (qx < x0) x0 = qx;
          if (qx > x1) x1 = qx;
          if (qy < y0) y0 = qy;
          if (qy > y1) y1 = qy;
          for (let k = 0; k < 4; k++) {
            const nx = qx + (k === 0 ? 1 : k === 1 ? -1 : 0);
            const ny = qy + (k === 2 ? 1 : k === 3 ? -1 : 0);
            if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
            const ni = ny * cw + nx;
            if (label[ni] !== -1 || cd[ni * 4 + 3] < 40) continue;
            label[ni] = id;
            stack[sp++] = ni;
          }
        }
        comps.push({ id, n, x0, x1, y0, y1, alpha: alphaSum / n });
      }

      // The mark's bounding box is the union of the components that are plainly not debris,
      // taken before the cut so the threshold is measured against the mark and not against
      // the debris-inflated frame.
      const biggest = comps.reduce((a, c) => (c.n > (a?.n ?? 0) ? c : a), null);
      let bx0 = cw;
      let bx1 = -1;
      let by0 = ch;
      let by1 = -1;
      for (const c of comps) {
        if (!biggest || c.n < biggest.n * 0.02) continue;
        if (c.x0 < bx0) bx0 = c.x0;
        if (c.x1 > bx1) bx1 = c.x1;
        if (c.y0 < by0) by0 = c.y0;
        if (c.y1 > by1) by1 = c.y1;
      }
      const markArea = bx1 > bx0 ? (bx1 - bx0 + 1) * (by1 - by0 + 1) : cw * ch;

      // SIZE ALONE IS NOT THE TEST, and neither is size plus alpha.
      //
      // At 0.05% of the bounding box, Voyaze's coral "TOURS & TRAVEL" lost both its T's and
      // read "OURS & RAVE"; Vyntrix lost the I from "BUILT" while keeping rock highlights
      // that happened to be bright. A small glyph and a speck of lit rock are the same size
      // and can be the same opacity. What they are not is in the same PLACE: type sits inside
      // or immediately beside the lockup, debris is scattered across the ground.
      //
      // So the large components define an occupancy grid, dilated generously, and a small
      // component survives only if it falls inside it. True specks go regardless.
      const CELL = 8;
      const gw = Math.ceil(cw / CELL);
      const gh = Math.ceil(ch / CELL);
      const SPECK = markArea * 0.00005;
      const SMALL = markArea * 0.0005;
      const occupied = new Uint8Array(gw * gh);
      for (const c of comps) {
        if (c.n < SMALL) continue;
        for (let gy = Math.floor(c.y0 / CELL); gy <= Math.floor(c.y1 / CELL); gy++) {
          for (let gx = Math.floor(c.x0 / CELL); gx <= Math.floor(c.x1 / CELL); gx++) {
            occupied[gy * gw + gx] = 1;
          }
        }
      }
      // Dilate by 10 cells (~80px): no tagline letter is large enough to be an anchor itself,
      // so the whole line has to be reached from the wordmark above it.
      const near = new Uint8Array(gw * gh);
      const R = 10;
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          if (!occupied[gy * gw + gx]) continue;
          for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
              const ny = gy + dy;
              const nx = gx + dx;
              if (ny < 0 || nx < 0 || ny >= gh || nx >= gw) continue;
              near[ny * gw + nx] = 1;
            }
          }
        }
      }

      let debris = 0;
      const dropped = new Uint8Array(comps.length);
      for (const c of comps) {
        const cx = Math.floor(((c.x0 + c.x1) / 2) / CELL);
        const cy = Math.floor(((c.y0 + c.y1) / 2) / CELL);
        // Not all debris is small. Vyntrix's ground is lit rock and one highlight runs as a
        // single connected smear larger than any letter, so it was never even considered by a
        // size rule. What it is instead is FAINT: it cleared the key by a little, where every
        // part of a metallic mark clears it completely. Scoped to keyed logos, because a file
        // that arrived with real alpha may legitimately carry a soft shadow.
        const faint = keyed && c.alpha < 150;
        const strandedSmall = c.n < SMALL && !near[cy * gw + cx];
        if (c.n < SPECK || strandedSmall || faint) {
          dropped[c.id] = 1;
          debris++;
        }
      }
      if (debris) {
        for (let i = 0; i < cw * ch; i++) {
          const l = label[i];
          if (l >= 0 && dropped[l]) cd[i * 4 + 3] = 0;
        }
      }

      // ── RETENTION. Ink measured on the SOURCE pixels, inside the very same region, against
      // the ground's own extreme — then compared with what survived. This is what catches a
      // half-erased tagline on any logo rather than only on the one that was noticed.
      let srcInk = 0;
      let kept = 0;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const i = y * cw + x;
          if (srcIsInk[(ry + y) * w + (rx + x)]) srcInk++;
          if (cd[i * 4 + 3] >= 128) kept++;
        }
      }
      // Painted flat, where the mark had to be taken from the opposite-polarity file. Alpha
      // is untouched, so the letterforms and their anti-aliasing survive exactly.
      if (flatten) {
        const fr = parseInt(flatten.slice(1, 3), 16);
        const fg = parseInt(flatten.slice(3, 5), 16);
        const fb = parseInt(flatten.slice(5, 7), 16);
        for (let i = 0; i < cd.length; i += 4) {
          if (cd[i + 3] === 0) continue;
          cd[i] = fr;
          cd[i + 1] = fg;
          cd[i + 2] = fb;
        }
      }
      g.putImageData(im2, 0, 0);

      // Trim to what survived, so the binary-search fit in generate-boards measures the MARK
      // and not whatever margin the source happened to ship with.
      let minX = cw;
      let maxX = -1;
      let minY = ch;
      let maxY = -1;
      let ir = 0;
      let ig = 0;
      let ib = 0;
      let n = 0;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const k = (y * cw + x) * 4;
          if (cd[k + 3] < 40) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          ir += cd[k];
          ig += cd[k + 1];
          ib += cd[k + 2];
          n++;
        }
      }
      if (maxX < 0 || n < 200) return null;
      const pad = Math.round(Math.max(cw, ch) * 0.012);
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(cw - 1, maxX + pad);
      maxY = Math.min(ch - 1, maxY + pad);
      const tw = maxX - minX + 1;
      const th = maxY - minY + 1;

      const t = document.createElement('canvas');
      t.width = tw;
      t.height = th;
      t.getContext('2d').drawImage(c, minX, minY, tw, th, 0, 0, tw, th);

      let clearN = 0;
      const td = t.getContext('2d').getImageData(0, 0, tw, th).data;
      for (let i = 3; i < td.length; i += 4) if (td[i] === 0) clearN++;

      const toHex = (v) => Math.round(v).toString(16).padStart(2, '0');
      return {
        data: t.toDataURL('image/webp', 0.92),
        w: tw,
        h: th,
        keyed,
        mode,
        clearPct: (clearN / (tw * th)) * 100,
        /** Retained ink over source ink. 1.0 means nothing was lost to the key. */
        retention: srcInk ? kept / srcInk : 1,
        debris,
        ink: '#' + toHex(ir / n) + toHex(ig / n) + toHex(ib / n),
      };
    },
    [dataUrl, maxW, rect, flatten]
  );
}


/**
 * Crop an exact normalised rectangle out of a source and scale it to at most `maxW`.
 *
 * Deliberately NOT object-fit: every rectangle in PLAN was placed to keep a baked-in headline,
 * or a third-party trademark, out of frame. Letting CSS decide the window would put them back.
 * Never upscales — a crop smaller than the target ships at its own resolution rather than soft.
 */
async function cropTo(page, dataUrl, rect, maxW, quality, maxUpscale = 1) {
  return page.evaluate(
    async ([src, rect, maxW, q, maxUpscale]) => {
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch {
        return null;
      }
      const NW = img.naturalWidth;
      const NH = img.naturalHeight;
      const sx = Math.max(0, Math.round(rect[0] * NW));
      const sy = Math.max(0, Math.round(rect[1] * NH));
      const sw = Math.min(NW - sx, Math.round(rect[2] * NW));
      const sh = Math.min(NH - sy, Math.round(rect[3] * NH));
      if (sw < 8 || sh < 8) return null;
      const w = Math.min(maxW, Math.round(sw * maxUpscale));
      const h = Math.round((w / sw) * sh);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return { data: c.toDataURL('image/webp', q), w, h };
    },
    [dataUrl, rect, maxW, quality, maxUpscale]
  );
}


/**
 * FIND THE LARGEST PHOTOGRAPHIC RECTANGLE IN A SOURCE.
 *
 * Every "AD" in BRANDS is a finished advertisement, so hand-placed crop rectangles were only
 * ever as good as the eye that placed them: the shipped Voxaris hero still carried a ghost
 * wordmark, "REAL STORIES...", "ISSUES NEED A VOICE" and fragments of body copy behind the
 * page's own headline, and Vyntrix carried a second V mark and "SNEAKERS ONLY". Glimpsed
 * behind a mostly-closed ink mask that was survivable; now that the mask opens to 100% it is
 * two headlines in one frame.
 *
 * So the crop is SEARCHED rather than assumed, against a test for text:
 *
 *   1. Adaptive local threshold — a pixel is "stroke" if it differs from its neighbourhood
 *      mean. This finds type on any ground, light or dark, which a global threshold cannot.
 *   2. Connected components, filtered to glyph proportions.
 *   3. ROW MEMBERSHIP, which is what actually separates type from texture: a letter has
 *      siblings of its own size sitting on its own baseline. A leaf or a rivet does not.
 *   4. An integral image over the confirmed glyph boxes, so any candidate rectangle's text
 *      fraction is one subtraction.
 *
 * Returns the largest 16:9 rectangle whose text fraction is under the limit, or null.
 */
async function findPhotoRect(page, dataUrl, forbid = [], limit = 0.005) {
  return page.evaluate(
    async ([src, forbid, limit]) => {
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch {
        return null;
      }
      const W = 640;
      const H = Math.max(1, Math.round((W / img.naturalWidth) * img.naturalHeight));

      /**
       * The text mask, built at one working width.
       *
       * MULTI-SCALE, because one scale cannot see both kinds of type. The adaptive threshold
       * marks a pixel that differs from its own neighbourhood, which finds a thin letter
       * perfectly and a thick display letter not at all — the interior of a 20px stroke looks
       * exactly like its own 15px neighbourhood, so only the outline survives, and adjacent
       * outlines merge into one component per word that is far too big to read as a glyph.
       * Voxaris's entire headline scored 0.00% that way. Downscaled, the same headline is thin
       * type and is caught by the identical code.
       */
      const maskAt = (SW) => {
        const SH = Math.max(1, Math.round((SW / W) * H));
        const c = document.createElement('canvas');
        c.width = SW;
        c.height = SH;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, SW, SH);
        const d = g.getImageData(0, 0, SW, SH).data;

        const lum = new Float32Array(SW * SH);
        for (let i = 0, px = 0; i < d.length; i += 4, px++) {
          lum[px] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        }
        const ii = new Float64Array((SW + 1) * (SH + 1));
        for (let y = 0; y < SH; y++) {
          let row = 0;
          for (let x = 0; x < SW; x++) {
            row += lum[y * SW + x];
            ii[(y + 1) * (SW + 1) + (x + 1)] = ii[y * (SW + 1) + (x + 1)] + row;
          }
        }
        const boxMean = (x0, y0, x1, y1) => {
          x0 = Math.max(0, x0);
          y0 = Math.max(0, y0);
          x1 = Math.min(SW - 1, x1);
          y1 = Math.min(SH - 1, y1);
          const a = ii[y0 * (SW + 1) + x0];
          const b = ii[y0 * (SW + 1) + x1 + 1];
          const cc = ii[(y1 + 1) * (SW + 1) + x0];
          const dd = ii[(y1 + 1) * (SW + 1) + x1 + 1];
          return (dd - b - cc + a) / ((x1 - x0 + 1) * (y1 - y0 + 1));
        };

        // The threshold CALIBRATES ITSELF to the artwork.
        //
        // A fixed 18 marked 26-32% of Voxaris's key art as stroke — its type is distressed and
        // its grounds are grained, so letters fused with the texture around them into single
        // enormous components and stopped being glyph-shaped at all. The headline scored zero.
        // Type occupies a few percent of a page; a binarisation returning a third of it has
        // found texture, not type, so the threshold rises until the figure is plausible.
        const R = 7;
        const local = new Float32Array(SW * SH);
        for (let y = 0; y < SH; y++) {
          for (let x = 0; x < SW; x++) {
            local[y * SW + x] = Math.abs(lum[y * SW + x] - boxMean(x - R, y - R, x + R, y + R));
          }
        }
        // FIXED at 18, deliberately.
        //
        // Raising it until the marked fraction looked plausible was an attempt to stop
        // letters fusing with grainy artwork, and it worked — but on a busy photograph the
        // threshold climbed to 34 or 44 and low-contrast caption text stopped being marked
        // at all. A Sentinel crop carrying a full paragraph and four feature headings
        // measured 0.02%. Sensitivity is what a text detector cannot afford to lose;
        // texture is rejected below instead, by the row test, which is the thing texture
        // genuinely fails.
        const usedTh = 18;
        const stroke = new Uint8Array(SW * SH);
        for (let i = 0; i < local.length; i++) stroke[i] = local[i] > usedTh ? 1 : 0;

        // One-pixel erosion before labelling. At a sensitive threshold a busy composite scene
        // marks a third of its pixels as stroke and every letter touches its neighbours and
        // the scene behind it — Sentinel's stand came back as a single 632x427 component.
        // Eroding severs one-pixel bridges while leaving letter bodies intact.
        const eroded = new Uint8Array(SW * SH);
        for (let y = 1; y < SH - 1; y++) {
          for (let x = 1; x < SW - 1; x++) {
            const i = y * SW + x;
            eroded[i] =
              stroke[i] && stroke[i - 1] && stroke[i + 1] && stroke[i - SW] && stroke[i + SW]
                ? 1
                : 0;
          }
        }
        stroke.set(eroded);

        const label = new Int32Array(SW * SH).fill(-1);
        const stack = new Int32Array(SW * SH);
        const cands = [];
        for (let start2 = 0; start2 < SW * SH; start2++) {
          if (label[start2] !== -1 || !stroke[start2]) continue;
          const id = cands.length;
          let sp = 0;
          stack[sp++] = start2;
          label[start2] = id;
          let n = 0;
          let contrast = 0;
          let x0 = SW;
          let x1 = -1;
          let y0 = SH;
          let y1 = -1;
          while (sp > 0) {
            const q = stack[--sp];
            const qx = q % SW;
            const qy = (q - qx) / SW;
            n++;
            contrast += local[q];
            if (qx < x0) x0 = qx;
            if (qx > x1) x1 = qx;
            if (qy < y0) y0 = qy;
            if (qy > y1) y1 = qy;
            for (let k = 0; k < 4; k++) {
              const nx = qx + (k === 0 ? 1 : k === 1 ? -1 : 0);
              const ny = qy + (k === 2 ? 1 : k === 3 ? -1 : 0);
              if (nx < 0 || ny < 0 || nx >= SW || ny >= SH) continue;
              const ni = ny * SW + nx;
              if (label[ni] !== -1 || !stroke[ni]) continue;
              label[ni] = id;
              stack[sp++] = ni;
            }
          }
          const bw = x1 - x0 + 1;
          const bh = y1 - y0 + 1;
          const fill = n / (bw * bh);
          const ar = bw / bh;
          // Type is EMPHATIC and reasonably solid; texture is marginal and either wispy or
          // blobby. Without the contrast and fill bounds, suit fabric and hair in Vaelcron's
          // photography passed the row test and the whole frame was rejected as text.
          const glyphish =
            bw >= 2 &&
            bh >= 4 &&
            bh <= SH * 0.22 &&
            bw <= SW * 0.22 &&
            fill > 0.2 &&
            fill < 0.95 &&
            ar > 0.1 &&
            ar < 6 &&
            contrast / n > usedTh * 1.5;
          if (glyphish) {
            cands.push({ x0, x1, y0, y1, bw, bh, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
          }
        }

        // Row membership is what separates type from texture: a letter has siblings of its own
        // size sitting on its own baseline. A leaf, a rivet or a cobblestone does not.
        const out = new Uint8Array(W * H);
        const k = W / SW;
        for (const a of cands) {
          let friends = 0;
          for (const b of cands) {
            if (a === b) continue;
            // A shared BASELINE and a shared x-height, not merely similar blobs at a similar
            // altitude — Voxaris's key art is a ruined skyline of spires and windows at
            // roughly one size, and a looser test read it as a line of type.
            //
            // The tolerances carry an absolute floor because they are proportional to a
            // component that may be six pixels tall: a pure 25% baseline rule allows 1.5px of
            // slack, which anti-aliasing alone exceeds, and caption text stopped being
            // detected at all — a Sentinel crop carrying four headings and a paragraph
            // measured 0.04%.
            const slack = Math.max(2.5, a.bh * 0.3);
            if (Math.abs(a.y1 - b.y1) > slack) continue;
            if (Math.abs(a.cy - b.cy) > Math.max(2.5, a.bh * 0.35)) continue;
            if (Math.abs(b.bh - a.bh) > Math.max(2.5, a.bh * 0.45)) continue;
            if (Math.abs(a.cx - b.cx) > a.bw * 8 + 18) continue;
            friends++;
            if (friends >= 3) break;
          }
          // Three siblings, not two: a pair of similar blobs on a similar line happens all the
          // time in photography, a run of four rarely does outside of type.
          if (friends < 3) continue;
          const X0 = Math.max(0, Math.floor((a.x0 - 2) * k));
          const X1 = Math.min(W - 1, Math.ceil((a.x1 + 2) * k));
          const Y0 = Math.max(0, Math.floor((a.y0 - 2) * k));
          const Y1 = Math.min(H - 1, Math.ceil((a.y1 + 2) * k));
          for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) out[y * W + x] = 1;
        }
        return out;
      };

      // THREE scales, not two. Voxaris's key art is set in distressed display caps that are
      // 62px tall at the 640 working width and still 25px at 256 — larger than the adaptive
      // radius at both, so only their outlines marked and adjacent outlines merged into one
      // component per word. At 128 the same headline is ordinary small type and is caught by
      // the identical code. 640 keeps the body copy, which vanishes at 128.
      const text = maskAt(640);
      for (const sw of [320, 128]) {
        const m = maskAt(sw);
        for (let i = 0; i < text.length; i++) if (m[i]) text[i] = 1;
      }

      for (const f of forbid) {
        for (let y = Math.round(f[1] * H); y < Math.round((f[1] + f[3]) * H); y++) {
          for (let x = Math.round(f[0] * W); x < Math.round((f[0] + f[2]) * W); x++) {
            if (x >= 0 && y >= 0 && x < W && y < H) text[y * W + x] = 1;
          }
        }
      }

      // Luminance at the search scale, for the tonal gate.
      const cc2 = document.createElement('canvas');
      cc2.width = W;
      cc2.height = H;
      const gg = cc2.getContext('2d', { willReadFrequently: true });
      gg.drawImage(img, 0, 0, W, H);
      const dd2 = gg.getImageData(0, 0, W, H).data;
      const lum = new Float32Array(W * H);
      for (let i = 0, px = 0; i < dd2.length; i += 4, px++) {
        lum[px] = 0.2126 * dd2[i] + 0.7152 * dd2[i + 1] + 0.0722 * dd2[i + 2];
      }

      const integral = (get) => {
        const a = new Float64Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) {
          let row = 0;
          for (let x = 0; x < W; x++) {
            row += get(y * W + x);
            a[(y + 1) * (W + 1) + (x + 1)] = a[y * (W + 1) + (x + 1)] + row;
          }
        }
        return a;
      };
      // Per-pixel local detail, so "is there a subject in this rectangle" can be asked
      // directly. Whole-rect sigma cannot answer it: a blank marble wall with one dark corner
      // in it measures the same 38 as a frame full of product, and Vaelcron's hero came back
      // as a wall.
      const ii2 = integral((i) => lum[i]);
      const boxMean2 = (x0, y0, x1, y1) => {
        x0 = Math.max(0, x0);
        y0 = Math.max(0, y0);
        x1 = Math.min(W - 1, x1);
        y1 = Math.min(H - 1, y1);
        return (
          (ii2[(y1 + 1) * (W + 1) + x1 + 1] -
            ii2[y0 * (W + 1) + x1 + 1] -
            ii2[(y1 + 1) * (W + 1) + x0] +
            ii2[y0 * (W + 1) + x0]) /
          ((x1 - x0 + 1) * (y1 - y0 + 1))
        );
      };
      const detail = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          detail[y * W + x] =
            Math.abs(lum[y * W + x] - boxMean2(x - 4, y - 4, x + 4, y + 4)) > 7 ? 1 : 0;
        }
      }

      const ti = integral((i) => text[i]);
      const di = integral((i) => detail[i]);
      const li = integral((i) => lum[i]);
      const l2 = integral((i) => lum[i] * lum[i]);
      const boxSum = (arr, x0, y0, w, h) => {
        const x1 = x0 + w - 1;
        const y1 = y0 + h - 1;
        return (
          arr[(y1 + 1) * (W + 1) + x1 + 1] -
          arr[y0 * (W + 1) + x1 + 1] -
          arr[(y1 + 1) * (W + 1) + x0] +
          arr[y0 * (W + 1) + x0]
        );
      };

      // Search: widest qualifying 16:9 window.
      const AR = 16 / 9;
      let best = null;
      for (let frac = 1; frac >= 0.3; frac -= 0.02) {
        let rw = Math.round(W * frac);
        let rh = Math.round(rw / AR);
        if (rh > H) {
          rh = H;
          rw = Math.round(rh * AR);
        }
        if (rw < 24 || rh < 14 || rw > W) continue;
        const step = Math.max(2, Math.round(W * 0.02));
        for (let y = 0; y + rh <= H; y += step) {
          for (let x = 0; x + rw <= W; x += step) {
            const n = rw * rh;
            const tShare = boxSum(ti, x, y, rw, rh) / n;
            if (tShare > limit) continue;
            const mean = boxSum(li, x, y, rw, rh) / n;
            const std = Math.sqrt(
              Math.max(0, boxSum(l2, x, y, rw, rh) / n - mean * mean)
            );
            // A photograph has exposure and tonal range. Below 30 mean it is a dark corner,
            // above 225 a blown-out one, and under 18 sigma a flat field with nothing in it —
            // all three are text-free and none of them is a hero.
            // sigma 18 still admitted a blank marble wall (Vaelcron measured 21) and an
            // empty sky (Vyntrix, 27). 34 is the floor at which a frame reliably has a
            // subject in it rather than just an exposure.
            if (mean < 30 || mean > 225 || std < 22) continue;
            // A quarter of the frame has to carry detail. This is what separates a
            // photograph with a subject from a backdrop that happens to have one dark
            // corner — sigma alone reads both the same.
            const detailShare = boxSum(di, x, y, rw, rh) / n;
            if (detailShare < 0.25) continue;
            best = {
              x: x / W,
              y: y / H,
              w: rw / W,
              h: rh / H,
              frac,
              text: tShare,
              mean,
              std,
              detail: detailShare,
            };
            break;
          }
          if (best) break;
        }
        if (best) break;
      }
      return { best, W, H };
    },
    [dataUrl, forbid, limit]
  );
}

/** Dominant chroma of a crop — the colour a viewer actually registers, not the mean. */
async function dominantChroma(page, dataUrl, rect) {
  return page.evaluate(
    async ([src, rect]) => {
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch {
        return null;
      }
      const NW = img.naturalWidth;
      const NH = img.naturalHeight;
      const sx = Math.round(rect[0] * NW);
      const sy = Math.round(rect[1] * NH);
      const sw = Math.round(rect[2] * NW);
      const sh = Math.round(rect[3] * NH);
      const W = 240;
      const H = Math.max(1, Math.round((W / sw) * sh));
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;

      const bins = new Array(36).fill(0);
      const acc = Array.from({ length: 36 }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const gg = d[i + 1];
        const b = d[i + 2];
        const mx = Math.max(r, gg, b);
        const mn = Math.min(r, gg, b);
        const df = mx - mn;
        if (df < 30 || mx < 45) continue;
        let hh;
        if (mx === r) hh = ((gg - b) / df) * 60;
        else if (mx === gg) hh = ((b - r) / df + 2) * 60;
        else hh = ((r - gg) / df + 4) * 60;
        hh = (hh + 360) % 360;
        const k = Math.floor(hh / 10);
        bins[k] += df;
        acc[k].r += r;
        acc[k].g += gg;
        acc[k].b += b;
        acc[k].n++;
      }
      let top = -1;
      for (let i = 0; i < 36; i++) if (top < 0 || bins[i] > bins[top]) top = i;
      if (top < 0 || acc[top].n < 40) return null;
      const a = acc[top];
      const r = a.r / a.n;
      const gv = a.g / a.n;
      const b = a.b / a.n;
      const mx = Math.max(r, gv, b);
      const mn = Math.min(r, gv, b);
      const df = mx - mn;
      let hh = 0;
      if (df > 0) {
        if (mx === r) hh = ((gv - b) / df) * 60;
        else if (mx === gv) hh = ((b - r) / df + 2) * 60;
        else hh = ((r - gv) / df + 4) * 60;
      }
      const toHex = (v) => Math.round(v).toString(16).padStart(2, '0');
      return { hex: '#' + toHex(r) + toHex(gv) + toHex(b), h: (hh + 360) % 360 };
    },
    [dataUrl, rect]
  );
}

function hueOf(hexStr) {
  const n = parseInt(hexStr.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) * 60;
  else if (mx === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return (h + 360) % 360;
}

const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};


function write(file, dataUrl) {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fss.writeFileSync(file, buf);
  return buf.length;
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');

  const report = {};
  let added = 0;

  console.log('\nASSET INVENTORY\n');
  console.log(
    '  slug      file                        dims        aspect  alpha  clear%  meanL  llLum  edgeLL  edgeAll  dominant'
  );
  console.log('  ' + '-'.repeat(126));

  for (const [folder, slug] of Object.entries(FOLDERS)) {
    const dir = path.join(SRC, folder);
    let files = [];
    try {
      files = (await fs.readdir(dir))
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .sort();
    } catch {
      // A missing source folder must not break the build or touch another brand.
      console.log(`  ${slug.padEnd(9)} (no source folder ${folder})`);
      report[slug] = { logo: null, hero: null, gallery: [] };
      continue;
    }

    const measured = [];
    for (const f of files) {
      const full = path.join(dir, f);
      let url = null;
      let m = null;
      try {
        url = toDataUrl(full);
        m = await measure(page, url);
      } catch {
        m = null;
      }
      if (!m) {
        console.log(`  ${slug.padEnd(9)} ${f.padEnd(27)} UNREADABLE — skipped`);
        continue;
      }
      measured.push({ file: f, full, url, ...m });
      const ar = m.w / m.h;
      const alpha = m.clearPct > 0.5 || m.partialPct > 0.5 ? 'yes' : 'no';
      console.log(
        `  ${slug.padEnd(9)} ${f.padEnd(27)} ${String(m.w).padStart(4)}x${String(m.h).padEnd(5)} ` +
          `${ar.toFixed(2).padStart(6)}  ${alpha.padEnd(5)} ${m.clearPct.toFixed(1).padStart(6)} ` +
          `${m.meanLum.toFixed(0).padStart(6)} ${m.lowerLeftLum.toFixed(0).padStart(6)} ` +
          `${m.edgeLowerLeft.toFixed(0).padStart(7)} ${m.edgeWhole.toFixed(0).padStart(8)}  ` +
          m.dominant.map((c) => hex(c.r, c.g, c.b)).join(' ')
      );
    }
    report[slug] = { measured };
  }

  // ── classification: the plan, checked against the measurements
  console.log('\nCLASSIFICATION\n');
  const chosen = {};
  for (const p of projects) {
    const plan = PLAN[p.slug] ?? {};
    const items = report[p.slug]?.measured ?? [];
    const find = (name) => items.find((m) => m.file === name) ?? null;

    const wantLight = LIGHT_GROUND.has(p.slug);
    const matched = find(wantLight ? plan.logoLight : plan.logoDark);
    const other = find(wantLight ? plan.logoDark : plan.logoLight);

    // PREFER THE FLATTER GROUND, even when it means taking the wrong polarity and recolouring.
    //
    // Vyntrix's dark lockup sits on lit rock (ring sigma 13.4 against 0.5 for its light
    // variant), and its highlights are the same size and the same brightness as the mark's own
    // small type. Filtering that by component size ate the I from "BUILT" while leaving rock
    // behind; filtering by opacity did the same. The fix is not a better filter — it is not
    // keying a textured ground in the first place.
    let logo = matched;
    let flatten = null;
    if (
      matched &&
      other &&
      matched.clearPct <= 15 &&
      matched.ringStd > 8 &&
      other.ringStd < matched.ringStd - 5
    ) {
      logo = other;
      // Taken from the wrong side, so the mark now reads the wrong way round on this board
      // and is painted flat in the board's own contrasting tone. The metallic gradient is the
      // cost; debris on a print is worse.
      flatten = wantLight ? p.palette[0] : p.palette[2];
    }
    // HERO BY SEARCH, over every source this brand has that is not its logo.
    //
    // The rectangle is not chosen — it is found: the largest 16:9 window in any of the
    // brand's sources whose text fraction is under 0.5%. A brand with no qualifying window
    // gets no hero at all and its page falls back to board 01w, because shipping a second
    // headline behind the page's own is worse than shipping no photograph.
    const heroPool = items.filter((m) => m !== matched && m !== other);
    let hero = null;
    let heroRect = null;
    let heroText = null;
    const tried = [];
    let tier = null;
    // TWO TIERS. Maximising area against a single 0.5% ceiling picks whatever sits right at
    // the ceiling — four of six landed between 0.43% and 0.48%, which is compliant and still
    // visibly type. Ask for a genuinely clean crop first; only if no source can give one at a
    // usable size is the ceiling raised to the limit the brief actually sets.
    for (const [limit, name] of [
      [0.0005, 'clean'],
      [0.005, 'relaxed'],
    ]) {
      for (const cand of heroPool) {
        const found = await findPhotoRect(page, cand.url, plan.forbid?.[cand.file] ?? [], limit);
        const r = found?.best ?? null;
        if (name === 'clean') {
          tried.push(
            `${cand.file.replace(/\.[^.]+$/, '')} ${
              r ? `${(r.w * cand.w).toFixed(0)}px @ ${(r.text * 100).toFixed(2)}%` : 'none'
            }`
          );
        }
        if (!r) continue;
        const px = r.w * cand.w;
        // Minimum useful size in real source pixels — a qualifying sliver is not a hero.
        //
        // 360, lowered from 420. Once Voxaris's strapline band was excluded its best window
        // came to 368px, and 420 would have sent that brand to the board-01w fallback on the
        // strength of an arbitrary number rather than any property of the picture: the crop
        // passes text at 0.00%, carries the highest detail share of the six, and sits within
        // 15% of Rethread's 430px, which already ships.
        if (px < 360) continue;
        // Largest wins, but SUBJECT breaks near-ties. Vyntrix's sky and its hero shot of the
        // shoe both measured 830px; on size alone the sky won, and a hero with nothing in it
        // is not better than one with the product in it. Sizes within a 60px bucket are
        // treated as equal and the tonally richer frame takes it.
        const bucket = Math.round(px / 60);
        const better =
          !hero ||
          bucket > Math.round(heroRect.px / 60) ||
          (bucket === Math.round(heroRect.px / 60) && r.std > heroRect.std);
        if (better) {
          hero = cand;
          heroRect = {
            rect: [r.x, r.y, r.w, r.h],
            px,
            text: r.text,
            mean: r.mean,
            std: r.std,
            detail: r.detail,
          };
          heroText = r.text;
          tier = name;
        }
      }
      if (hero) break;
    }
    const gallery = (plan.gallery ?? [])
      .map((g) => ({ ...g, m: find(g.file) }))
      .filter((g) => g.m);

    console.log(`  ${p.slug}  (board 01 ground: ${wantLight ? 'LIGHT' : 'DARK'})`);
    if (flatten) {
      console.log(
        `    LOGO    switched to ${logo.file} — its ground is flat (sigma ${logo.ringStd.toFixed(1)}) ` +
          `where the polarity-matched file is textured (sigma ${matched.ringStd.toFixed(1)}); painted flat ${flatten}`
      );
    }
    if (!logo) {
      console.log('    LOGO    — missing, keeps its generated wordmark');
    } else {
      const keyed = logo.clearPct <= 15;
      console.log(
        `    LOGO    ${logo.file}  ${
          keyed
            ? `OPAQUE (${logo.clearPct.toFixed(1)}% clear) -> flat ground keyed out to real alpha`
            : `alpha already present (${logo.clearPct.toFixed(1)}% clear)`
        }`
      );
      console.log(
        `            the mark reads ${wantLight ? 'dark on light' : 'light on dark'}, matching this brand's board ground`
      );
    }
    console.log(
      hero
        ? `    HERO    ${hero.file} @ [${heroRect.rect.map((v) => v.toFixed(3)).join(', ')}] ` +
            `${heroRect.px.toFixed(0)}px wide, ${(heroText * 100).toFixed(2)}% text, ` +
            `lum ${heroRect.mean.toFixed(0)} sigma ${heroRect.std.toFixed(0)} ` +
            `detail ${(heroRect.detail * 100).toFixed(0)}% (${tier})`
        : '    HERO    — NO QUALIFYING CROP, page falls back to board 01w'
    );
    console.log(`            at the clean limit: ${tried.join(' | ')}`);
    console.log(
      gallery.length
        ? `    GALLERY ${gallery.map((g) => g.file).join(', ')}`
        : '    GALLERY — none, section skipped'
    );

    const photo = [hero, ...gallery.map((g) => g.m)].filter(Boolean);
    const photoLum = photo.length ? photo.reduce((a, m) => a + m.meanLum, 0) / photo.length : null;
    if (photoLum !== null) {
      console.log(
        `            imagery mean luminance ${photoLum.toFixed(0)} -> ${photoLum < 110 ? 'DARK' : 'LIGHT'} framing`
      );
    }
    chosen[p.slug] = {
      logo,
      flatten,
      hero,
      heroRect: heroRect?.rect ?? null,
      heroText,
      gallery,
      photoLum,
    };
  }

  if (INVENTORY_ONLY) {
    await browser.close();
    console.log('\n--inventory: nothing written.\n');
    return;
  }

  // ── convert
  console.log('\nCONVERT\n');
  for (const p of projects) {
    const c = chosen[p.slug];
    const dir = path.join(OUT, p.slug);
    await fs.mkdir(dir, { recursive: true });
    // Clear the previous run so a source removed from BRANDS cannot linger in public/.
    for (const f of await fs.readdir(dir)) await fs.unlink(path.join(dir, f));

    const manifest = { logo: null, hero: null, gallery: [], keyedLogo: false, accent: null };

    if (c.logo) {
      const out = await keyLogo(
        page,
        c.logo.url,
        LOGO_MAX,
        PLAN[p.slug]?.logoRect ?? null,
        c.flatten
      );
      if (out && out.data) {
        added += write(path.join(dir, 'logo.webp'), out.data);
        manifest.logo = `/brands/${p.slug}/logo.webp`;
        manifest.logoAspect = +(out.w / out.h).toFixed(3);
        manifest.keyedLogo = out.keyed;
        manifest.logoInk = out.ink;
        manifest.logoMode = out.mode;
        manifest.logoClearPct = +out.clearPct.toFixed(1);
        manifest.logoRetention = +out.retention.toFixed(3);
        manifest.logoDebris = out.debris;
      }
    }
    if (c.hero) {
      // 2x ceiling: once the baked headlines and the third-party marks are cropped away,
      // no source holds 2560px of usable hero. A bounded upscale beats a 620px full-bleed
      // image; an unbounded one would just be soft.
      const out = await cropTo(page, c.hero.url, c.heroRect, HERO_W, Q, 2);
      if (out && out.data) {
        added += write(path.join(dir, 'hero.webp'), out.data);
        manifest.hero = `/brands/${p.slug}/hero.webp`;
        manifest.heroW = out.w;
        manifest.heroH = out.h;
      }
    }
    for (let i = 0; i < c.gallery.length; i++) {
      const g = c.gallery[i];
      const out = await cropTo(page, g.m.url, g.rect, GALLERY_W, Q);
      if (!out || !out.data) continue;
      const name = `gallery-${String(i + 1).padStart(2, '0')}.webp`;
      added += write(path.join(dir, name), out.data);
      manifest.gallery.push({
        src: `/brands/${p.slug}/${name}`,
        aspect: +(out.w / out.h).toFixed(3),
      });
    }

    c.manifest = manifest;
    console.log(
      `  ${p.slug.padEnd(9)} logo ${
        manifest.logo
          ? `${manifest.logoMode} retention ${(manifest.logoRetention * 100).toFixed(0)}% debris ${manifest.logoDebris}`
          : '—'
      }`.padEnd(58) +
        `  hero ${manifest.hero ? `${manifest.heroW}x${manifest.heroH}` : '—'}` +
        `  gallery ${manifest.gallery.length}`
    );
  }

  // ── per-brand accent, sampled from the brand's own hero where it agrees with the palette
  console.log('\nACCENT RECONCILIATION\n');
  for (const p of projects) {
    const c = chosen[p.slug];
    if (!c.hero) {
      console.log(`  ${p.slug.padEnd(9)} no hero — palette accent ${p.accent} kept`);
      continue;
    }
    const sampled = await dominantChroma(page, c.hero.url, c.heroRect);
    const pal = hueOf(p.accent);
    if (!sampled) {
      console.log(
        `  ${p.slug.padEnd(9)} hero carries no usable chroma — palette accent ${p.accent} kept`
      );
      continue;
    }
    const gap = hueGap(sampled.h, pal);
    // Hue proximity alone is not enough. Every one of these photographs has a warm ambient
    // cast that lands within 30 degrees of a gold or a coral accent while actually being a
    // desaturated brown — #6b4e3d at 23deg "matches" gold and would be useless as type
    // colour. The sampled version has to be a comparable COLOUR, not just a comparable hue,
    // so it must also carry at least 70% of the palette accent's saturation.
    const satOf = (h) => {
      const n = parseInt(h.slice(1), 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      const mx = Math.max(r, g, b);
      return mx ? (mx - Math.min(r, g, b)) / mx : 0;
    };
    // ...and it has to be usable as TYPE, which means it cannot be much darker than the
    // palette value it replaces. #6b4e3d clears the hue and saturation tests against gold and
    // still measures 2.5:1 on obsidian — an accent nobody could read.
    const lumOf = (h) => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    const sSampled = satOf(sampled.hex);
    const sPalette = satOf(p.accent);
    const lSampled = lumOf(sampled.hex);
    const lPalette = lumOf(p.accent);
    if (gap <= 30 && sSampled >= sPalette * 0.7 && lSampled >= lPalette * 0.75) {
      c.manifest.accent = sampled.hex;
      console.log(
        `  ${p.slug.padEnd(9)} SAMPLED ${sampled.hex} (${sampled.h.toFixed(0)}deg) — palette ${p.accent} is ${pal.toFixed(0)}deg, gap ${gap.toFixed(0)}deg`
      );
    } else {
      console.log(
        `  ${p.slug.padEnd(9)} palette ${p.accent} kept — hero chroma ${sampled.hex} ` +
          `(${sampled.h.toFixed(0)}deg, sat ${(sSampled * 100).toFixed(0)}%, lum ${lSampled.toFixed(0)}) ` +
          `vs palette ${gap.toFixed(0)}deg away, sat ${(sPalette * 100).toFixed(0)}%, lum ${lPalette.toFixed(0)}`
      );
    }
  }

  await browser.close();

  // ── data module
  const out = {};
  for (const p of projects) {
    const c = chosen[p.slug];
    const lum = c.photoLum;
    out[p.slug] = {
      ...c.manifest,
      /** Mean luminance of this brand's own photography; drives dark vs light framing. */
      imageryLum: lum === null || lum === undefined ? null : +lum.toFixed(1),
      /** Below 110 the page frames the brand on its dark palette colour, above it the light. */
      framing: lum === null || lum === undefined ? null : lum < 110 ? 'dark' : 'light',
      /** Mean luminance of the hero's lower-left third, where the project name sits. */
      heroLowerLeftLum: c.hero ? +c.hero.lowerLeftLum.toFixed(1) : null,
      /** Fraction of the chosen hero crop that measured as text. */
      heroTextShare: c.heroText === null || c.heroText === undefined ? null : +c.heroText.toFixed(5),
    };
  }
  fss.writeFileSync(
    path.join(ROOT, 'app', 'data', 'brandAssets.ts'),
    '// Generated by scripts/ingest-brands.mjs — do not edit by hand.\n' +
      '// Brands absent from this map, or with null fields, fall back to generated artwork.\n' +
      'export type GalleryImage = { src: string; aspect: number };\n' +
      'export type BrandAssets = {\n' +
      '  logo: string | null;\n' +
      '  hero: string | null;\n' +
      '  gallery: GalleryImage[];\n' +
      '  keyedLogo: boolean;\n' +
      '  logoAspect?: number;\n' +
      '  logoInk?: string;\n' +
      '  logoMode?: string;\n' +
      '  logoClearPct?: number;\n' +
      '  logoRetention?: number;\n' +
      '  logoDebris?: number;\n' +
      '  heroW?: number;\n' +
      '  heroH?: number;\n' +
      '  accent: string | null;\n' +
      '  imageryLum: number | null;\n' +
      "  framing: 'dark' | 'light' | null;\n" +
      '  heroLowerLeftLum: number | null;\n' +
      '  heroTextShare: number | null;\n' +
      '};\n' +
      `export const brandAssets: Record<string, BrandAssets> = ${JSON.stringify(out, null, 2)};\n`
  );

  console.log(`\ndone   ${(added / 1024 / 1024).toFixed(2)} MB added -> public/brands\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

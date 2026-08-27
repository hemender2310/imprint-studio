/**
 * IMPRINT — monogram tiles for the cursor trail.
 *
 * One 240x240 tile per project: that brand's monogram, in that brand's typeface, on that
 * brand's ground, with the same 3% grain overlay every other board carries.
 *
 * These are IMPRINT's own six spec clients. Real-world marks are deliberately not used: a
 * studio site scattering trademarked logos reads as a claim to have worked for those
 * companies, which would undercut the six honest case studies a scroll away.
 *
 * Grounds and type colours match each brand's compositional system in generate-boards.mjs,
 * so a tile that flashes past the cursor is recognisably the same identity as the board.
 *
 * Usage: node scripts/generate-monograms.mjs
 */

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { projects } from '../app/data/projects.ts';
import { brandAssets } from '../app/data/brandAssets.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'monograms');
const SIZE = 240;

/** Google Fonts axis strings differ per family; a generic wght@400;700 404s for Anton. */
const FONT_CSS = {
  'Archivo Black': 'family=Archivo+Black',
  'Cormorant Garamond': 'family=Cormorant+Garamond:wght@400;600;700',
  'Work Sans': 'family=Work+Sans:wght@400;500;600;700',
  'Space Grotesk': 'family=Space+Grotesk:wght@400;500;700',
  Anton: 'family=Anton',
  'IBM Plex Sans': 'family=IBM+Plex+Sans:wght@400;500;600;700',
};

/**
 * ground / type / accent, and the weight each system sets its mark in. Indices are into the
 * project's own palette, so nothing here invents a colour.
 */
const SYSTEM = {
  vyntrix: { bg: 0, fg: 2, accent: 1, weight: 400 },
  vaelcron: { bg: 0, fg: 3, accent: 1, weight: 600 },
  // rethread and voyaze sit on their light grounds, matching boards 01/01w — the trail
  // is the same six identities the grid shows, so it carries the same value range.
  rethread: { bg: 2, fg: 0, accent: 1, weight: 600 },
  voyaze: { bg: 2, fg: 0, accent: 1, weight: 700 },
  voxaris: { bg: 0, fg: 1, accent: 3, weight: 400 },
  sentinel: { bg: 0, fg: 2, accent: 1, weight: 600 },
};

/** Inlined, because these tiles are rendered through setContent and have no origin. */
function logoDataUrl(slug) {
  const rel = brandAssets[slug]?.logo;
  if (!rel) return null;
  try {
    return (
      'data:image/webp;base64,' +
      fss.readFileSync(path.join(ROOT, 'public', rel.replace(/^\//, ''))).toString('base64')
    );
  } catch {
    return null; // the brand simply keeps its generated monogram
  }
}

function tile(p) {
  const sys = SYSTEM[p.slug];
  const bg = p.palette[sys.bg];
  const fg = p.palette[sys.fg];
  const accent = p.palette[sys.accent];
  // Every monogram is two characters (four of the six names begin with V), so they all sit
  // at the smaller size or they touch the tile edges.
  const size = Math.round(SIZE * (p.monogram.length > 1 ? 0.42 : 0.66));

  // A brand that shipped a logo puts THAT on the trail, on its own ground. The generated
  // monogram stays as the fallback, so a brand with no asset still has a tile.
  const logo = logoDataUrl(p.slug);
  const mark = logo
    ? `<img class="m" src="${logo}" alt="" style="width:${Math.round(SIZE * 0.76)}px;height:auto;
         max-height:${Math.round(SIZE * 0.6)}px;object-fit:contain">`
    : `<div class="m">${p.monogram}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?${FONT_CSS[p.typeface]}&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${SIZE}px;height:${SIZE}px;overflow:hidden}
.t{position:relative;width:${SIZE}px;height:${SIZE}px;background:${bg};
   display:flex;align-items:center;justify-content:center;overflow:hidden}
.m{font-family:'${p.typeface}',serif;font-weight:${sys.weight};font-size:${size}px;
   line-height:1;color:${fg}}
.rule{position:absolute;left:0;right:0;bottom:26px;height:3px;background:${accent}}
.lab{position:absolute;top:16px;left:0;right:0;text-align:center;
     font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.22em;
     text-transform:uppercase;color:${accent}}
/* The same grain every board carries — it is what keeps six identities reading as one studio. */
.grain{position:absolute;inset:0;pointer-events:none;opacity:.03;
  background-image:repeating-radial-gradient(circle at 0 0,#000 0 1px,transparent 1px 3px)}
</style></head><body>
<div class="t">
  <div class="lab">${p.slug}</div>
  ${mark}
  <div class="rule"></div>
  <div class="grain"></div>
</div>
</body></html>`;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });

  for (const p of projects) {
    await page.setContent(tile(p), { waitUntil: 'load', timeout: 60000 });
    // fonts.check() reports false for a face the page has not requested, so ask first.
    const loaded = await page.evaluate(async (family) => {
      try {
        await document.fonts.load(`400 100px "${family}"`);
      } catch {}
      await document.fonts.ready;
      return document.fonts.check(`400 100px "${family}"`);
    }, p.typeface);
    if (!loaded) throw new Error(`${p.slug}: typeface "${p.typeface}" never loaded`);

    await page.screenshot({
      path: path.join(OUT, `${p.slug}.webp`),
      type: 'webp',
      quality: 92,
    });
    process.stdout.write(`  ${p.slug}.webp\n`);
  }

  await browser.close();
  console.log(`\ndone   ${projects.length} monograms -> public/monograms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

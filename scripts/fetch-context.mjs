/**
 * IMPRINT — context photography.
 *
 * One context photo per project, searched on that project's own sector, cropped 3:2, tinted
 * with a 12% overlay of the brand's darkest palette colour so six different photographers'
 * work still reads as coming out of one studio, and written as WebP.
 *
 * SOURCE: Wikimedia Commons, not Pexels. Pexels now answers automated requests with a
 * Cloudflare bot-verification interstitial (HTTP 403, "Performing security verification"),
 * and defeating bot detection is off the table whatever the parsing approach. Commons has a
 * documented open API, permissive licensing, and returns real URLs — every URL used here
 * comes back from an API response, none is constructed from an id.
 *
 * Licensing is captured per image and rendered as the on-page caption, because Commons
 * images generally require attribution.
 *
 * Any project that fails is skipped. This must never block a build.
 *
 * Usage: node scripts/fetch-context.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { projects } from '../app/data/projects.ts';
import { brandAssets } from '../app/data/brandAssets.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'work');
const DATA = path.join(ROOT, 'app', 'data');

const UA = 'IMPRINT-spec-site/1.0 (static portfolio build script)';

/**
 * A plain search is not reproducible. Commons re-ranks between runs and throttles a burst by
 * returning an empty result set, so two builds a minute apart chose different photos and one
 * project came back with nothing at all. Once a project's photo has been chosen and reviewed,
 * its Commons title is recorded in context.ts and re-resolved by exact title on every later
 * run — still fetched from the API, never assembled from an id, but the same six every time.
 *
 *   node scripts/fetch-context.mjs                    # keep what is already chosen
 *   node scripts/fetch-context.mjs --refresh          # re-search every project
 *   node scripts/fetch-context.mjs --refresh=vyntrix  # re-search these projects only
 */
const refreshArg = process.argv.find((a) => a.startsWith('--refresh'));
const refreshAll = refreshArg === '--refresh';
const refreshSome = new Set(
  refreshArg && refreshArg.includes('=') ? refreshArg.split('=')[1].split(',') : []
);
const shouldRefresh = (slug) => refreshAll || refreshSome.has(slug);

/** Whatever the last run settled on, keyed by slug. Absent on a first run. */
async function priorSources() {
  try {
    const mod = await import('../app/data/context.ts');
    const out = {};
    for (const [slug, v] of Object.entries(mod.contextPhotos ?? {})) {
      if (v.source) out[slug] = { source: v.source, query: v.query ?? '' };
    }
    return out;
  } catch {
    return {};
  }
}

/** One image by its exact Commons title — the reproducible path. */
async function byTitle(title) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&titles=${encodeURIComponent(title)}` +
    '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1800';
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt));
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA } });
    } catch {
      res = null;
    }
    if (res && res.ok) break;
  }
  if (!res || !res.ok) return null;
  const json = await res.json();
  const page = Object.values(json?.query?.pages ?? {})[0];
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  const meta = ii.extmetadata ?? {};
  return {
    title: page.title,
    url: ii.thumburl || ii.url,
    artist: strip(meta.Artist?.value).slice(0, 60),
    licence: strip(meta.LicenseShortName?.value).slice(0, 30),
  };
}

/** Searched on each project's own sector. Fallbacks because the plate/illustration filter
 *  can empty a narrow query's results entirely. */
const QUERIES = {
  // Queries deliberately avoid branded goods. A sneaker or an airport terminal search on
  // Commons returns other companies' trademarks in frame, and a studio site carrying a real
  // brand's mark reads as a claim to have worked for them — the same reason the cursor trail
  // uses IMPRINT's own six monograms. Surfaces and materials, not products.
  vyntrix: ['athletics track lane markings', 'running track stadium empty', 'tartan track surface'],
  vaelcron: ['watch movement mechanism', 'wristwatch mechanical', 'watchmaker workbench'],
  rethread: ['cotton fabric texture', 'folded textile cloth', 'woven fabric close up'],
  voyaze: ['aircraft wing cloud', 'airplane window sky', 'runway approach lights'],
  voxaris: ['letterpress type case', 'movable type metal', 'printing press type'],
  sentinel: ['concrete wall architecture', 'minimal concrete interior', 'modern building entrance'],
};

const W = 1800;
const H = 1200; // 3:2
const TINT = 0.12;

const strip = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function darkest(palette) {
  let best = palette[0];
  let bestL = Infinity;
  for (const hex of palette) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L < bestL) {
      bestL = L;
      best = hex;
    }
  }
  return best;
}

/** Hues of the palette entries that actually carry chroma; greys contribute nothing. */
function paletteHues(palette) {
  const out = [];
  for (const hex of palette) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn < 18) continue;
    const d = mx - mn;
    let h;
    if (mx === r) h = ((g - b) / d) * 60;
    else if (mx === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    out.push((h + 360) % 360);
  }
  return out;
}

const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

async function search(query) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
    `&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}` +
    '&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1800';
  // Commons throttles a burst of API calls, and a throttled response is indistinguishable
  // from "nothing matched" unless it is retried — two projects were silently skipped that way.
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt));
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA } });
    } catch {
      res = null;
    }
    if (res && res.ok) break;
  }
  if (!res || !res.ok) return [];
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  return Object.values(pages)
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return null;
      const meta = ii.extmetadata ?? {};
      return {
        title: p.title,
        url: ii.thumburl || ii.url, // whatever the API returned; never assembled
        width: ii.thumbwidth || ii.width,
        height: ii.thumbheight || ii.height,
        artist: strip(meta.Artist?.value).slice(0, 60),
        licence: strip(meta.LicenseShortName?.value).slice(0, 30),
      };
    })
    .filter(
      (x) =>
        x &&
        x.url &&
        x.width >= 1000 &&
        x.width > x.height &&
        // Commons is full of scanned book plates; those are not context photography.
        !/book|illustration|plate|engraving|drawing|diagram|woodcut|lithograph|etching/i.test(
          x.title
        ) &&
        // And reject anything that looks like a portrait of a real, identifiable person.
        // These are fictional clients: attaching a named individual to one of their case
        // studies implies an endorsement that does not exist, licence notwithstanding.
        !/\(\d{4}\)|\(\d{4}\s*[-–]\s*\d{4}\)|portrait|selfie|mugshot|\bMr\b|\bMrs\b|\bDr\b/i.test(
          x.title
        ) &&
        // Commons also carries a lot of museum cataloguing: specimen shots with scale bars
        // and burnt-in copyright notices, and scanned ephemera. Neither is usable here.
        !/\(AM[\s_]|museum|specimen|catalog|collection|accession|ticket|poster|stamp|label/i.test(
          x.title
        ) &&
        // Archival survey photography (HAER/HABS) carries burnt-in edge strips and frame
        // numbers, and scholarly volumes carry maps and plates whatever the search term was.
        // Both arrive under titles that read as descriptions, so the title is the only tell.
        !/\bHAER\b|\bHABS\b|\bmap\b|atlas|manufactures|treatise|encyclop|antiquit/i.test(
          x.title
        ) &&
        // And no named commercial products — a real competitor's model number has no place
        // illustrating a fictional client's case study.
        !/[A-Z]{2,}[-\s]?\d{2,}[A-Z]?/.test(x.title) &&
        // Named brands, blocked outright. Commons indexes plenty of them, and a studio site
        // carrying a real company's mark reads as a claim to have worked for them — exactly
        // what the six spec case studies exist to avoid. Blunt, but the alternative is
        // shipping a competitor's logo beside a fictional client's.
        !/rolex|omega|seiko|casio|patek|cartier|tag[\s-]?heuer|breitling|nike|adidas|puma|reebok|asics|new balance|jins|ray[\s-]?ban|ikea|samsung/i.test(
          x.title
        )
    );
}

/** Crop, tint and measure one candidate in the browser. Returns null if it never decoded. */
function render(page, src, project) {
  return page.evaluate(
    async ({ src, w, h, tint, alpha }) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const loaded = await new Promise((res) => {
            img.onload = () => res(true);
            img.onerror = () => res(false);
            img.src = src;
          });
          if (!loaded || !img.naturalWidth) return null;
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d');
          const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);

          // Reject scanned line art by MEASUREMENT, not by filename. Commons is full of
          // manual figures and book plates whose titles say nothing ("Electrical door
          // locking and operating device"), and one of those shipped as a context photo.
          // The tell is a BIMODAL histogram: bare paper and ink, with almost nothing in
          // between. Low chroma alone is not enough — it also describes a macro of a steel
          // watch movement, which an earlier, looser version of this test threw away.
          const px = g.getImageData(0, 0, w, h).data;
          let chroma = 0;
          let paper = 0;
          let mid = 0;
          let n = 0;
          for (let i = 0; i < px.length; i += 4 * 37) {
            const r = px[i];
            const gg = px[i + 1];
            const b = px[i + 2];
            const mx = Math.max(r, gg, b);
            const mn = Math.min(r, gg, b);
            chroma += mx - mn;
            if (mn > 200) paper++;
            else if (mx > 55 && mx < 205) mid++;
            n++;
          }
          const lineArt = chroma / n < 16 && paper / n > 0.35 && mid / n < 0.22;

          // Dominant hue of the saturated pixels, so a photo that fights the brand's own
          // palette can be passed over. A hot pink fabric stack is a real photograph of the
          // right subject and still wrong for a forest-and-flax identity; no amount of
          // filename filtering catches that, but the pixels say it plainly.
          const bins = new Array(36).fill(0);
          let sat = 0;
          for (let i = 0; i < px.length; i += 4 * 37) {
            const r = px[i];
            const gg = px[i + 1];
            const b = px[i + 2];
            const mx = Math.max(r, gg, b);
            const mn = Math.min(r, gg, b);
            const d = mx - mn;
            if (d < 34 || mx < 40) continue;
            sat++;
            let h;
            if (mx === r) h = ((gg - b) / d) * 60;
            else if (mx === gg) h = ((b - r) / d + 2) * 60;
            else h = ((r - gg) / d + 4) * 60;
            bins[Math.floor(((h + 360) % 360) / 10)] += d;
          }
          let top = 0;
          for (let i = 1; i < 36; i++) if (bins[i] > bins[top]) top = i;

          g.globalAlpha = alpha;
          g.fillStyle = tint;
          g.fillRect(0, 0, w, h);
          g.globalAlpha = 1;
          try {
            return {
              lineArt,
              hue: top * 10 + 5,
              satShare: sat / n,
              data: c.toDataURL('image/webp', 0.86),
            };
          } catch {
            return null; // tainted canvas
          }
        },
    { src, w: W, h: H, tint: darkest(project.palette), alpha: TINT }
  );
}

/** The on-page credit line. Commons images generally require attribution. */
function caption(project, hit, query) {
  const who = hit.artist || 'Unknown';
  return {
    src: `/work/${project.slug}-context.webp`,
    caption: `${query || project.sector} · ${who}${hit.licence ? ` · ${hit.licence}` : ''} · Wikimedia Commons`,
    source: hit.title,
    query,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');

  const entries = {};
  const prior = await priorSources();
  let ok = 0;

  for (const p of projects) {
    try {
      // A brand with real photography of its own does not need a stand-in.
      if (brandAssets[p.slug]?.hero || brandAssets[p.slug]?.gallery?.length) {
        console.log(`  skip  ${p.slug}: has its own photography under public/brands`);
        continue;
      }
      // Locked in from a previous run: resolve that one file and skip the search entirely.
      const lock = prior[p.slug];
      if (lock && !shouldRefresh(p.slug)) {
        const hit = await byTitle(lock.source);
        if (hit) {
          const shot = await render(page, hit.url, p);
          if (shot?.data) {
            const buf = Buffer.from(shot.data.split(',')[1], 'base64');
            if (buf.length >= 8000) {
              fs.writeFileSync(path.join(OUT, `${p.slug}-context.webp`), buf);
              entries[p.slug] = caption(p, hit, lock.query || '');
              console.log(`  keep  ${p.slug}  ${(buf.length / 1024).toFixed(0)}KB  ${hit.title}`);
              ok++;
              continue;
            }
          }
        }
        console.log(`  warn  ${p.slug}: locked file did not resolve, re-searching`);
      }
      // Pool every query's hits rather than stopping at the first that returned something.
      // The palette-agreement score below can only help if it has a choice, and one query's
      // top result is not a choice.
      const seen = new Set();
      const pool = [];
      for (const q of QUERIES[p.slug]) {
        // Commons throttles a burst, and a throttled response arrives as an empty result
        // set rather than an error — whichever project ran last was the one that lost.
        await new Promise((r) => setTimeout(r, 400));
        for (const hit of await search(q)) {
          if (seen.has(hit.title)) continue;
          seen.add(hit.title);
          pool.push({ ...hit, query: q });
        }
      }
      // Pool order is query order, then Commons' own relevance order within each query.
      // Sorting it (by title, say) makes rebuilds reproducible but throws relevance away —
      // an alphabetical pass picked a 1966 college football photo over an athletics track.
      if (!pool.length) {
        console.log(`  skip  ${p.slug}: no usable results`);
        continue;
      }

      const hues = paletteHues(p.palette);
      let best = null;

      for (const hit of pool.slice(0, 8)) {
        // Centre-crop to 3:2 and lay the brand's darkest colour over it at 12%.
        const shot = await render(page, hit.url, p);

        if (!shot || typeof shot.data !== 'string' || !shot.data.startsWith('data:image/webp'))
          continue;

        if (shot.lineArt) {
          console.log(`  drop  ${p.slug}: ${hit.title.slice(0, 40)} measures as line art`);
          continue;
        }

        const buf = Buffer.from(shot.data.split(',')[1], 'base64');
        if (buf.length < 8000) continue;

        // A photo that fights the brand's palette is still the wrong photo, however good it
        // is: a hot pink fabric stack is genuinely fabric and genuinely wrong for a forest-
        // and-flax identity. No filename filter catches that; the pixels say it plainly.
        // Muted photography sits under any palette, so the penalty scales with how much
        // colour the photo actually carries.
        const gap = hues.length
          ? Math.min(...hues.map((h) => hueGap(h, shot.hue)))
          : 0;
        const penalty = shot.satShare * gap;
        if (!best || penalty < best.penalty) best = { buf, hit, shot, penalty };
        if (penalty < 8) break;
      }

      if (best) {
        const { buf, hit, shot, penalty } = best;
        fs.writeFileSync(path.join(OUT, `${p.slug}-context.webp`), buf);
        entries[p.slug] = caption(p, hit, hit.query);
        console.log(
          `  got   ${p.slug}  ${(buf.length / 1024).toFixed(0)}KB  hue ${shot.hue}` +
            `  clash ${penalty.toFixed(0)}  ${hit.title.slice(0, 38)}`
        );
        ok++;
      }
      else console.log(`  skip  ${p.slug}: no candidate decoded`);
    } catch (e) {
      console.log(`  skip  ${p.slug}: ${String(e).split('\n')[0].slice(0, 70)}`);
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(DATA, 'context.ts'),
    '// Generated by scripts/fetch-context.mjs — do not edit by hand.\n' +
      '// Projects absent from this map simply render without a context photo.\n' +
      'export type ContextPhoto = { src: string; caption: string; source: string; query: string };\n' +
      `export const contextPhotos: Record<string, ContextPhoto> = ${JSON.stringify(entries, null, 2)};\n`
  );

  console.log(`\n${ok}/${projects.length} context photos obtained`);
}

main().catch((e) => {
  console.error(String(e).split('\n')[0]);
  process.exit(0); // never block a build
});

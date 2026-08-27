/**
 * IMPRINT — screen recording.
 *
 * Captures two clips:
 *   captures/imprint-scroll.webm  slow scroll: ~20s through the hero scrub, then on through
 *                                 Manifesto / Services / Work / Process / Industries /
 *                                 ClosingCTA
 *   captures/imprint-cursor.webm  cursor hover states over a work tile and a CTA
 *   captures/imprint-project.webm one full project page scroll
 *   captures/imprint-transition.webm  a navigation into a project and back
 *   captures/imprint-menu.webm        the menu overlay opening and closing
 *   captures/imprint-intro.webm       the first-load intro sequence
 *
 * Frames are captured SEQUENTIALLY and driven by frame index rather than by wall clock, then
 * assembled at exactly 25fps. Puppeteer's screencast was tried first and its capture rate is
 * not uniform under varying load: the hero scrub took 42% of the elapsed time but produced
 * 65% of the frames, so no single retiming factor fixes it — the hero stretched to ~34s while
 * the sections rushed. Stepping the page one video frame at a time makes the timing exact by
 * construction, at the cost of taking longer to record than the clip lasts.
 *
 * Usage: node scripts/record.mjs [baseUrl]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:3100';

/**
 * `--only=brands` re-records one clip and leaves the rest of captures/ alone. Recording the
 * whole set to fix one of them costs four minutes of scrubbing per clip and rewrites files
 * that did not change.
 */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] || null;
const want = (name) => !ONLY || ONLY === name;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'captures');

const W = 1440;
const H = 900;
const FPS = 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolve ffmpeg directly: winget does not refresh PATH for an already-running shell. */
function findFfmpeg() {
  try {
    const p = execSync('where ffmpeg', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split(/\r?\n/)[0]
      .trim();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const pkgs = path.join(local, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(pkgs)) {
      for (const dir of fs.readdirSync(pkgs).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
        const base = path.join(pkgs, dir);
        for (const inner of fs.readdirSync(base)) {
          const c = path.join(base, inner, 'bin', 'ffmpeg.exe');
          if (fs.existsSync(c)) return c;
        }
      }
    }
  }
  return null;
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Let the page settle: two rAF ticks, so the hero's own loop has drawn this position. */
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  );

async function encode(dir, file, ffmpegPath) {
  execFileSync(
    ffmpegPath,
    [
      '-y', '-v', 'error',
      '-framerate', String(FPS),
      '-i', path.join(dir, 'f%05d.jpg'),
      '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
      '-deadline', 'good', '-cpu-used', '4',
      '-pix_fmt', 'yuv420p',
      file,
    ],
    { stdio: 'inherit' }
  );
}

async function main() {
  const ffmpegPath = findFfmpeg();
  if (!ffmpegPath) {
    console.error('ffmpeg not found — install it, then re-run.');
    process.exit(1);
  }
  console.log(`ffmpeg  ${ffmpegPath}`);
  fs.mkdirSync(OUT, { recursive: true });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-rec-'));
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', `--window-size=${W},${H}`],
  });

  // ── 1. Full scroll ──────────────────────────────────────────────────────
  if (want('scroll')) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
    // Let the preload land so the scrub is not painting fallbacks on camera.
    await sleep(10000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1200);

    const heroRange = H * 5 - H;
    const pageHeight = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );

    // One entry per video frame.
    const timeline = [];
    const push = (n, fn) => {
      for (let i = 0; i < n; i++) timeline.push(fn(n === 1 ? 0 : i / (n - 1)));
    };
    push(30, () => 0);                                                    // 1.2s hold
    push(FPS * 20, (t) => heroRange * easeInOut(t));                      // 20s hero scrub
    push(15, () => heroRange);                                            // 0.6s pause
    push(FPS * 24, (t) => heroRange + (pageHeight - heroRange) * easeInOut(t)); // 24s sections
    push(40, () => pageHeight);                                           // 1.6s hold

    const dir = path.join(tmp, 'scroll');
    fs.mkdirSync(dir);
    for (let i = 0; i < timeline.length; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(timeline[i]));
      await settle(page);
      await page.screenshot({
        path: path.join(dir, `f${String(i).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 90,
        captureBeyondViewport: false,
      });
      if ((i + 1) % 200 === 0) console.log(`        scroll ${i + 1}/${timeline.length}`);
    }
    await page.close();

    const file = path.join(OUT, 'imprint-scroll.webm');
    await encode(dir, file, ffmpegPath);
    console.log(`scroll  ${file}  ${(timeline.length / FPS).toFixed(1)}s`);
  }

  // ── 2. Cursor hover states ──────────────────────────────────────────────
  if (want('cursor')) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(5000);

    /**
     * Scroll an element to the middle of the viewport and return its centre in viewport
     * space. Selectors matter here: `a[data-cursor="view"]` matches the hero's SEE THE WORK
     * before any work tile, and 'START A PROJECT' matches the hero's beat-4 CTA before the
     * closing one — so both are scoped explicitly. scrollIntoView also did not stick, so
     * scroll by absolute offset and assert it landed.
     */
    const focusOn = async (which) => {
      const target = await page.evaluate((w) => {
        const el =
          w === 'tile'
            ? document.querySelector('#work a[href^="/work/"]')
            : [...document.querySelectorAll('a')]
                .filter((a) => a.textContent?.trim() === 'START A PROJECT')
                .pop();
        if (!el) return null;
        const r = el.getBoundingClientRect();
        // Clamp: the closing CTA sits near the foot of the page, so centring it would ask
        // for a scroll position past the end and the assertion below would fire.
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const want = window.scrollY + r.top - (window.innerHeight - r.height) / 2;
        return {
          y: Math.round(Math.max(0, Math.min(max, want))),
          label: el.textContent?.trim().slice(0, 40) ?? '',
        };
      }, which);
      if (!target) throw new Error(`hover target "${which}" not found`);

      await page.evaluate((y) => window.scrollTo(0, y), target.y);
      await sleep(1500);
      const got = await page.evaluate(() => Math.round(window.scrollY));
      if (Math.abs(got - target.y) > 40) {
        throw new Error(`scroll to ${which} did not land: wanted ${target.y}, got ${got}`);
      }
      const rect = await page.evaluate((w) => {
        const el =
          w === 'tile'
            ? document.querySelector('#work a[href^="/work/"]')
            : [...document.querySelectorAll('a')]
                .filter((a) => a.textContent?.trim() === 'START A PROJECT')
                .pop();
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, which);
      console.log(`        hover target ${which}: "${target.label}" at y=${got}`);
      return rect;
    };

    const tileNow = await focusOn('tile');

    // Mouse path, one position per video frame.
    const path_ = [];
    const seg = (from, to, n) => {
      for (let i = 0; i < n; i++) {
        const t = easeInOut(i / (n - 1));
        path_.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      }
    };
    const hold = (p, n) => {
      for (let i = 0; i < n; i++) path_.push(p);
    };

    const start = { x: tileNow.x - 300, y: tileNow.y + 300 };
    hold(start, 20);
    seg(start, tileNow, 55);          // approach the tile
    hold(tileNow, 55);                // rest: disc at full scale
    seg(tileNow, { x: tileNow.x + 380, y: tileNow.y - 320 }, 50); // leave: disc shrinks
    hold({ x: tileNow.x + 380, y: tileNow.y - 320 }, 30);
    seg({ x: tileNow.x + 380, y: tileNow.y - 320 }, tileNow, 45); // and back on
    hold(tileNow, 45);

    const dir = path.join(tmp, 'cursor');
    fs.mkdirSync(dir);
    let n = 0;
    const shoot = async () => {
      await page.screenshot({
        path: path.join(dir, `f${String(n).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 90,
        captureBeyondViewport: false,
      });
      n++;
    };

    for (const p of path_) {
      await page.mouse.move(p.x, p.y);
      await settle(page);
      await shoot();
    }

    // A sweep across a PROJECT page. On home the pool cycles all six marks; here it is that
    // one brand's mark only, which is the contrast the clip exists to show.
    await page.goto(`${BASE}/work/voxaris`, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(3500);
    path_.length = 0;
    let sweep = { x: 120, y: 240 };
    hold(sweep, 12);
    for (const to of [
      { x: 1280, y: 430 },
      { x: 200, y: 620 },
      { x: 1200, y: 300 },
    ]) {
      seg(sweep, to, 42);
      sweep = to;
    }
    hold(sweep, 26);
    for (const p of path_) {
      await page.mouse.move(p.x, p.y);
      await settle(page);
      await shoot();
    }

    // Then the closing CTA, back on the home page.
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(4000);
    const ctaNow = await focusOn('cta');
    path_.length = 0;
    const s2 = { x: ctaNow.x - 400, y: ctaNow.y - 240 };
    hold(s2, 20);
    seg(s2, ctaNow, 50);
    hold(ctaNow, 60);
    seg(ctaNow, { x: ctaNow.x + 380, y: ctaNow.y + 180 }, 45);
    hold({ x: ctaNow.x + 380, y: ctaNow.y + 180 }, 25);

    for (const p of path_) {
      await page.mouse.move(p.x, p.y);
      await settle(page);
      await shoot();
    }

    await page.close();
    const file = path.join(OUT, 'imprint-cursor.webm');
    await encode(dir, file, ffmpegPath);
    console.log(`cursor  ${file}  ${(n / FPS).toFixed(1)}s`);
  }

  // -- 2b. All six brand heroes, back to back ----------------------------
  //
  // The point of this clip is comparison. Each brand takes its own slice of the ink sequence
  // and its own photograph, and the only way to see that they are six different backgrounds
  // rather than one is to watch their openings consecutively. Eight seconds each, scrubbed
  // from the top of the track through the full reveal, so every brand is seen arriving out of
  // the ink and landing on its own photograph.
  if (want('brands')) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    const dir = path.join(tmp, 'brands');
    fs.mkdirSync(dir);
    let n = 0;
    const SECONDS_EACH = 8;

    for (const slug of ['vyntrix', 'vaelcron', 'rethread', 'voyaze', 'voxaris', 'sentinel']) {
      await page.goto(`${BASE}/work/${slug}`, { waitUntil: 'networkidle2', timeout: 90000 });
      // The hero preloads only its own frame window; give it time or the opening records a
      // half-loaded reveal.
      await sleep(7000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(600);

      const track = await page.evaluate(() => {
        const el = document.querySelector('[data-brand-hero-track]');
        return el ? el.offsetHeight - window.innerHeight : 0;
      });
      if (track <= 0) {
        console.log(`        brands: ${slug} has no hero track, skipped`);
        continue;
      }

      const frames = FPS * SECONDS_EACH;
      for (let i = 0; i < frames; i++) {
        const t = i / (frames - 1);
        // Through the reveal and a little past it, so the clean photograph is on screen at
        // the end of every brand's segment.
        const p = easeInOut(t) * 0.68;
        await page.evaluate((y) => window.scrollTo(0, y), Math.round(p * track));
        await settle(page);
        await page.screenshot({
          path: path.join(dir, `f${String(n).padStart(5, '0')}.jpg`),
          type: 'jpeg',
          quality: 90,
          captureBeyondViewport: false,
        });
        n++;
      }
      console.log(`        brands: ${slug} ${SECONDS_EACH}s`);
    }

    await page.close();
    const file = path.join(OUT, 'imprint-brands.webm');
    await encode(dir, file, ffmpegPath);
    console.log(`brands  ${file}  ${(n / FPS).toFixed(1)}s`);
  }

  // -- 3. One full project page ------------------------------------------
  if (want('project')) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    await page.goto(`${BASE}/work/voxaris`, { waitUntil: 'networkidle2', timeout: 90000 });
    // Longer than before: the masked brand hero has to finish preloading its own frame window
    // before the scrub starts, or the opening seconds record a half-loaded reveal.
    await sleep(9000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1200);

    const pageHeight = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );

    const timeline = [];
    const push = (n, fn) => {
      for (let i = 0; i < n; i++) timeline.push(fn(n === 1 ? 0 : i / (n - 1)));
    };
    push(25, () => 0);
    push(FPS * 28, (t) => pageHeight * easeInOut(t));
    push(35, () => pageHeight);

    const dir = path.join(tmp, 'project');
    fs.mkdirSync(dir);
    for (let i = 0; i < timeline.length; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(timeline[i]));
      await settle(page);
      await page.screenshot({
        path: path.join(dir, `f${String(i).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 90,
        captureBeyondViewport: false,
      });
      if ((i + 1) % 200 === 0) console.log(`        project ${i + 1}/${timeline.length}`);
    }
    await page.close();

    const file = path.join(OUT, 'imprint-project.webm');
    await encode(dir, file, ffmpegPath);
    console.log(`project ${file}  ${(timeline.length / FPS).toFixed(1)}s`);
  }

  // -- 4. Page transition, both directions --------------------------------
  //
  // This one cannot use frame-stepping: the transition is time-driven, not scroll-driven, so
  // there is no per-frame state to set. Frames are grabbed as fast as the screenshot pipeline
  // manages and the clip is assembled at the rate actually achieved, which keeps playback in
  // real time rather than pretending to a rate that was never captured.
  if (want('transition')) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(6000);
    await page.evaluate(() => document.querySelector('#work')?.scrollIntoView());
    await sleep(1500);

    const dir = path.join(tmp, 'transition');
    fs.mkdirSync(dir);
    let n = 0;
    const grab = async () => {
      await page.screenshot({
        path: path.join(dir, `f${String(n).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 88,
        captureBeyondViewport: false,
      });
      n++;
    };

    const t0 = Date.now();
    for (let i = 0; i < 10; i++) await grab();
    await page.evaluate(() => document.querySelector('#work a[href^="/work/"]').click());
    const untilInto = Date.now() + 4200;
    while (Date.now() < untilInto) await grab();

    await page.evaluate(() => document.querySelector('a[data-cursor="back"]')?.click());
    const untilBack = Date.now() + 4200;
    while (Date.now() < untilBack) await grab();
    for (let i = 0; i < 8; i++) await grab();
    const wall = (Date.now() - t0) / 1000;

    await page.close();

    const fps = Math.max(6, Math.round(n / wall));
    const file = path.join(OUT, 'imprint-transition.webm');
    execFileSync(
      ffmpegPath,
      [
        '-y', '-v', 'error',
        '-framerate', String(fps),
        '-i', path.join(dir, 'f%05d.jpg'),
        '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
        '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p',
        file,
      ],
      { stdio: 'inherit' }
    );
    console.log(`transit ${file}  ${(n / fps).toFixed(1)}s  (${n} frames at ${fps}fps)`);
  }

  // -- 5. Menu overlay ----------------------------------------------------
  // Time-driven like the transition, so frames are grabbed as fast as the pipeline manages
  // and assembled at the rate actually achieved.
  if (want('menu')) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    await page.goto(`${BASE}/work/vyntrix`, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(4000);

    const dir = path.join(tmp, 'menu');
    fs.mkdirSync(dir);
    let n = 0;
    const grab = async () => {
      await page.screenshot({
        path: path.join(dir, `f${String(n).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 88,
        captureBeyondViewport: false,
      });
      n++;
    };

    const t0 = Date.now();
    const hold = async (ms) => {
      const until = Date.now() + ms;
      while (Date.now() < until) await grab();
    };

    await hold(900);
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Menu')?.click()
    );
    await hold(2600);
    // Move the pointer down the project list so the hover slide is visible on camera.
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-menu-overlay] a[href^="/work/"]')].map((a) => {
        const r = a.getBoundingClientRect();
        return { x: r.x + 220, y: r.y + r.height / 2 };
      })
    );
    for (const r of rows.slice(0, 4)) {
      await page.mouse.move(r.x, r.y);
      const until = Date.now() + 700;
      while (Date.now() < until) await grab();
    }
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close')?.click()
    );
    await hold(2400);
    const wall = (Date.now() - t0) / 1000;
    await page.close();

    const fps = Math.max(6, Math.round(n / wall));
    const file = path.join(OUT, 'imprint-menu.webm');
    execFileSync(
      ffmpegPath,
      ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%05d.jpg'),
       '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4',
       '-pix_fmt', 'yuv420p', file],
      { stdio: 'inherit' }
    );
    console.log(`menu    ${file}  ${(n / fps).toFixed(1)}s  (${n} frames at ${fps}fps)`);
  }

  // -- 6. Intro sequence --------------------------------------------------
  // Needs a fresh session, since the intro stores a sessionStorage flag.
  if (want('intro')) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: W, height: H });

    // Throttled deliberately. Over a warm localhost cache the 24 coarse frames arrive in
    // well under a second and the counter is gone before it can be read — which is real, but
    // it is not what a first visitor over a network sees. This is the honest first-visit case.
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 90,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });

    const dir = path.join(tmp, 'intro');
    fs.mkdirSync(dir);
    let n = 0;
    const grab = async () => {
      await page.screenshot({
        path: path.join(dir, `f${String(n).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 88,
        captureBeyondViewport: false,
      });
      n++;
    };

    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const until = Date.now() + 6000;
    while (Date.now() < until) await grab();
    const wall = (Date.now() - t0) / 1000;
    await page.close();
    await context.close();

    const fps = Math.max(6, Math.round(n / wall));
    const file = path.join(OUT, 'imprint-intro.webm');
    execFileSync(
      ffmpegPath,
      ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%05d.jpg'),
       '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4',
       '-pix_fmt', 'yuv420p', file],
      { stdio: 'inherit' }
    );
    console.log(`intro   ${file}  ${(n / fps).toFixed(1)}s  (${n} frames at ${fps}fps)`);
  }

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  for (const f of fs.readdirSync(OUT)) {
    console.log(
      `        ${f}  ${(fs.statSync(path.join(OUT, f)).size / 1024 / 1024).toFixed(1)} MB`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

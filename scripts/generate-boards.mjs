/**
 * IMPRINT — brand board generator.
 *
 * A brand studio's deliverable is wordmarks, monograms, type and colour. All of that is vector,
 * so it is rendered here rather than photographed: Puppeteer lays out seven boards per project
 * and screenshots them.
 *
 *   -01  wordmark (4:5, the grid tile)      -01w wordmark (16:10, the project-page hero)
 *   -02  colour system                      -03  application artifact
 *   -04  type specimen                      -05  construction
 *   -06  lockups
 *
 * SIX COMPOSITIONAL SYSTEMS, NOT SIX COLOURWAYS
 *
 * One layout run through six palettes reads as a template — the opposite of what a brand
 * portfolio has to demonstrate. Each brand has its own system, defined once and applied across
 * all seven of its boards, so a project page reads as one coherent identity while the grid
 * reads as six different clients:
 *
 *   vyntrix     full-bleed cropped stencil type, one volt bar at the base
 *   vaelcron    wide margins, a single centred element, one hairline
 *   rethread    garment care label, hairline-boxed, wash-symbol marks
 *   voyaze      technical annotation, coordinates and a refund ticker
 *   voxaris     poster — display type hard-cropped, one phosphor rule
 *   sentinel    technical grid, measurement ticks and tolerance annotations
 *
 * Board 03 is a FLAT GRAPHIC ARTIFACT per brand, not attempted product photography — a
 * shoebox face, a dial layout, a care label, a boarding pass, a cover, a faceplate. That is
 * what an identity studio actually shows.
 *
 * The 3% grain overlay stays on every board regardless of system — that is what keeps six
 * systems reading as one studio's output.
 *
 * Board 01 is the grid tile, so it must carry at ~320px: the ground is always a mid or dark
 * palette colour (never the lightest), and the wordmark is fitted in the browser to at least
 * 55% of board width with >=4% padding on every side. Fitting is done against the live DOM
 * because six typefaces at six string lengths cannot share one font-size.
 */

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { projects } from '../app/data/projects.ts';
import { brandAssets } from '../app/data/brandAssets.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'work');

/**
 * A brand that shipped a real logo uses it on boards 01 and 01w in place of the generated
 * wordmark; everything else about its system — ground, accent bar, cropped monogram, grain —
 * is untouched, and boards 02-06 keep their generated type entirely.
 *
 * The file is inlined as a data URL because these pages are rendered through setContent and
 * have no origin to resolve a relative path against.
 */
const LOGO_CACHE = new Map();
function logoDataUrl(slug) {
  if (LOGO_CACHE.has(slug)) return LOGO_CACHE.get(slug);
  const rel = brandAssets[slug]?.logo;
  let url = null;
  if (rel) {
    try {
      url = 'data:image/webp;base64,' +
        fss.readFileSync(path.join(ROOT, 'public', rel.replace(/^\//, ''))).toString('base64');
    } catch {
      url = null; // a missing file just means this brand keeps its generated wordmark
    }
  }
  LOGO_CACHE.set(slug, url);
  return url;
}

/**
 * The wordmark slot for boards 01 and 01w.
 *
 * Returns null when the brand shipped no logo, and the caller falls back to the system's own
 * generated typography — so a missing asset degrades to exactly the board that was there
 * before rather than to a hole.
 *
 * When there IS a logo it gets a slot of its own, centred on the board inside a 6% margin,
 * rather than being substituted into the type block. Substituting was the first attempt and
 * it inherited the wrong things: the type block's top offset pushed marks off the bottom of
 * the 16:10 boards, and its text-align centring does nothing to a display:block image, which
 * left one mark at 2% from the left edge and 42% from the right. Everything that makes the
 * board that brand's — ground, accent bar, cropped monogram, grain — lives in frame() and is
 * untouched either way.
 */
function logoSlot(p, fitW = 0.8) {
  const url = logoDataUrl(p.slug);
  if (!url) return null;
  return `<div style="position:absolute;inset:0;display:flex;align-items:center;
                      justify-content:center;padding:4.5%;z-index:3">
      <img class="wm-fit" data-fit-w="${fitW}" data-fit-h="0.91" src="${url}" alt=""
           style="display:block;width:600px;height:auto"></div>`;
}

const W = 1000;
const H = 1250;
const WIDE_W = 1000;
const WIDE_H = 625;

/** Google Fonts axis strings differ per family; a generic wght@400;700 404s for Anton. */
const FONT_CSS = {
  'Archivo Black': 'family=Archivo+Black',
  'Cormorant Garamond': 'family=Cormorant+Garamond:wght@400;600;700',
  'Work Sans': 'family=Work+Sans:wght@400;500;600;700',
  'Space Grotesk': 'family=Space+Grotesk:wght@400;500;700',
  Anton: 'family=Anton',
  'IBM Plex Sans': 'family=IBM+Plex+Sans:wght@400;500;600;700',
};

/** Registration mark. The crosshair must overhang the circle or it reads as a target reticle. */
const reg = (size, color, sw = 1) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="7" stroke="${color}" stroke-width="${sw}"/>
  <line x1="12" y1="0.5" x2="12" y2="23.5" stroke="${color}" stroke-width="${sw}"/>
  <line x1="0.5" y1="12" x2="23.5" y2="12" stroke="${color}" stroke-width="${sw}"/>
</svg>`;

const base = (w, h) => `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
.board{position:relative;width:${w}px;height:${h}px;overflow:hidden}
/* Same faint grain on every board, whatever the system — this is what keeps six different
   compositions reading as one studio's output. */
.grain{position:absolute;inset:0;pointer-events:none;opacity:.03;
  background-image:repeating-radial-gradient(circle at 0 0,#000 0 1px,transparent 1px 3px)}
.mono{font-family:'JetBrains Mono',monospace}
.lab{font-size:12px;letter-spacing:.22em;text-transform:uppercase}
.abs{position:absolute}
.fit{display:inline-block;white-space:nowrap}
`;

function shell(fontKey, css, body, size = { w: W, h: H }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?${FONT_CSS[fontKey]}&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${base(size.w, size.h)}${css}</style></head><body>
<div class="board">${body}<div class="grain"></div></div>
</body></html>`;
}

/** VOXARIS -> Voxaris, for the type specimens that set the name in mixed case. */
const title = (n) => n[0] + n.slice(1).toLowerCase();

function contrastOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.52
    ? 'rgba(0,0,0,.72)'
    : 'rgba(255,255,255,.86)';
}

// ───────────────────────────────────── shared board-05/06 interiors
//
// Construction and lockups are the same *idea* for every brand, so they share an interior;
// the surrounding system furniture is what differentiates them.

function gridPlate(p, { fg, accent, weight, top, plate, inline = false }) {
  const G = 10;
  const step = plate / G;
  const lines = [];
  for (let i = 0; i <= G; i++) {
    const at = Math.round(i * step);
    const strong = i === 0 || i === G || i === G / 2;
    lines.push(
      `<div style="position:absolute;left:${at}px;top:0;width:1px;height:${plate}px;background:${accent};opacity:${strong ? 0.5 : 0.2}"></div>`,
      `<div style="position:absolute;top:${at}px;left:0;height:1px;width:${plate}px;background:${accent};opacity:${strong ? 0.5 : 0.2}"></div>`
    );
  }
  const pos = inline
    ? 'position:relative;margin:0 auto'
    : `position:absolute;left:50%;top:${top}px;transform:translateX(-50%)`;
  const size = Math.round(plate * (p.monogram.length > 1 ? 0.34 : 0.6));
  return `
    <div style="${pos};width:${plate}px;height:${plate}px">
      ${lines.join('')}
      <div style="position:absolute;left:${step}px;top:${step}px;width:${plate - step * 2}px;
                  height:${plate - step * 2}px;border:1px solid ${accent};opacity:.55"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                  font-family:'${p.typeface}',serif;font-weight:${weight};font-size:${size}px;
                  line-height:1;color:${fg}">${p.monogram}</div>
      <div class="mono" style="position:absolute;left:0;top:-30px;font-size:11px;letter-spacing:.18em;
           text-transform:uppercase;color:${accent}">x-height 6/10</div>
      <div class="mono" style="position:absolute;right:0;bottom:-30px;font-size:11px;letter-spacing:.18em;
           text-transform:uppercase;color:${accent}">grid 10 &middot; 1:1</div>
      <div class="abs" style="left:-13px;top:-13px">${reg(24, accent)}</div>
      <div class="abs" style="right:-13px;bottom:-13px">${reg(24, accent)}</div>
    </div>`;
}

function lockupRows(p, { fg, accent, bg, weight, top, inline = false }) {
  const rows = [
    ['Horizontal', `<span style="font-size:44px">${p.monogram}</span><span style="font-size:34px;margin-left:16px">${p.name}</span>`],
    ['Stacked', `<div style="text-align:center"><div style="font-size:38px">${p.monogram}</div><div style="font-size:21px;margin-top:4px">${p.name}</div></div>`],
    ['Monogram', `<span style="font-size:78px">${p.monogram}</span>`],
    ['Favicon 44px', `<span style="display:inline-flex;width:44px;height:44px;background:${fg};color:${bg};align-items:center;justify-content:center;font-size:21px">${p.monogram}</span>`],
  ];
  const pos = inline ? 'position:relative' : `position:absolute;left:58px;right:58px;top:${top}px`;
  return `
    <div style="${pos}">
      ${rows.map(([label, inner]) => `
        <div style="display:flex;align-items:center;gap:26px;border-top:1px solid ${accent};
                    padding:20px 0;min-height:108px">
          <div class="mono" style="width:130px;flex-shrink:0;font-size:11px;letter-spacing:.18em;
               text-transform:uppercase;color:${accent}">${label}</div>
          <div style="flex:1;display:flex;align-items:center;font-family:'${p.typeface}',serif;
                      font-weight:${weight};color:${fg}">${inner}</div>
        </div>`).join('')}
    </div>`;
}

/** Care-label wash symbols, drawn rather than fetched — four marks, no typeface needed. */
const washMarks = (color, scale = 1) => `
<svg width="${212 * scale}" height="${44 * scale}" viewBox="0 0 212 44" fill="none" stroke="${color}" stroke-width="2">
  <path d="M4 16 q6 -8 12 0 t12 0 t12 0 V34 a4 4 0 0 1 -4 4 H8 a4 4 0 0 1 -4 -4 Z"/>
  <path d="M62 38 L78 6 L94 38 Z"/>
  <rect x="118" y="8" width="30" height="30"/>
  <path d="M170 34 h34 l-6 -16 h-22 Z M176 18 v-6 h22 v6"/>
</svg>`;

// ─────────────────────────────────────────────────────────── the six systems

const SYS = {
  /* ─── VYNTRIX · full-bleed cropped stencil type, one volt bar ──────────── */
  vyntrix(p) {
    const [asphalt, volt, chalk, concrete] = p.palette;
    const pad = (s) => (s.h < s.w ? 40 : 54);
    // Stencil bridges: bars in the ground colour cut across the type, which is what makes a
    // stencil read as cut rather than drawn. They are anchored to the WORDMARK box rather than
    // to the board — the board is fixed but the fitted type is not, so board-relative bars
    // sliced one line and missed the other entirely.
    const bridges = (s) =>
      (s.h < s.w ? [0.4, 0.72] : [0.38, 0.71])
        .map((f) => `
          <div style="position:absolute;left:-60px;right:-60px;top:${(f * 100).toFixed(0)}%;
                      height:${s.h < s.w ? 9 : 12}px;background:${asphalt}"></div>`)
        .join('');
    const frame = (s, inner) => shell(
      p.typeface,
      `.b{background:${asphalt};width:${s.w}px;height:${s.h}px;position:relative;overflow:hidden;
          padding:${pad(s)}px}
       .voltbar{position:absolute;left:-40px;right:-40px;bottom:${Math.round(s.h * 0.09)}px;
                height:${Math.round(s.h * 0.075)}px;background:${volt}}
       .lab{color:${volt};position:relative;z-index:4}
       .ghost{position:absolute;right:-30px;bottom:-${Math.round(s.h * 0.06)}px;
              font-family:'${p.typeface}',sans-serif;font-size:${Math.round(s.h * 0.2)}px;
              color:${chalk};opacity:.09;line-height:.8}`,
      `<div class="b">
         <div class="mono lab">${p.sector} · ${p.year}</div>
         <div class="ghost">${p.monogram}</div>
         ${inner}
         <div class="voltbar"></div>
         <div class="abs" style="right:${pad(s)}px;bottom:${pad(s) - 16}px;z-index:4">${reg(18, asphalt)}</div>
       </div>`,
      s
    );

    return {
      wordmark: (s) => frame(s, logoSlot(p) ??
        `<div style="position:absolute;left:0;right:0;top:${Math.round(s.h * (s.h < s.w ? 0.24 : 0.3))}px;
                     text-align:center">
           <div style="position:relative;display:inline-block">
             <div class="wm-fit fit" data-fit-w="1.16" data-fit-h="0.5"
                  style="font-family:'${p.typeface}',sans-serif;font-size:120px;
                  line-height:.86;color:${chalk};letter-spacing:-.055em">${p.name}</div>
             ${bridges(s)}
           </div>
         </div>
         <div class="mono" style="position:absolute;left:${pad(s)}px;
              bottom:${Math.round(s.h * 0.2)}px;font-size:${s.h < s.w ? 12 : 15}px;
              letter-spacing:.2em;text-transform:uppercase;color:${concrete};line-height:2.1">
           Model 01 &middot; trainer<br/>${s.h < s.w ? '' : 'Cut from the outsole'}</div>`),
      colour: () => frame({ w: W, h: H },
        p.palette.map((hex, i) => `
          <div style="position:absolute;left:-40px;right:-40px;top:${150 + i * 178}px;height:150px;
                      background:${hex};border-top:1px solid ${concrete};display:flex;
                      align-items:flex-end;padding:14px 54px">
            <span class="mono lab" style="color:${contrastOn(hex)}">${hex}</span>
          </div>`).join('')),
      application: () => frame({ w: W, h: H },
        // Shoebox face.
        `<div style="position:absolute;left:50%;top:180px;transform:translateX(-50%);
                     width:560px;height:620px;background:${chalk};padding:44px;position:absolute">
           <div style="font-family:'${p.typeface}',sans-serif;font-size:76px;color:${asphalt};
                       line-height:.9;letter-spacing:-.02em">${p.name}</div>
           <div style="position:absolute;left:0;right:0;top:210px;height:26px;background:${volt}"></div>
           <div class="mono" style="position:absolute;left:44px;top:280px;font-size:13px;
                       letter-spacing:.2em;text-transform:uppercase;color:${concrete};line-height:2.4">
             Model 01 &middot; Trainer<br/>Colourway VLT-004<br/>UK 9 &middot; EU 43 &middot; US 10
           </div>
           <div style="position:absolute;right:44px;bottom:40px;font-family:'${p.typeface}',sans-serif;
                       font-size:110px;color:${asphalt};line-height:.8">S</div>
         </div>`),
      type: () => frame({ w: W, h: H },
        `<div style="position:absolute;left:${54}px;right:54px;top:260px">
           <div style="font-family:'${p.typeface}',sans-serif;font-size:150px;line-height:.9;
                       color:${chalk};letter-spacing:-.02em">Aa</div>
           <div style="font-family:'${p.typeface}',sans-serif;font-size:40px;color:${volt};
                       margin-top:26px">ABCDEFG 0123456789</div>
           <div class="mono lab" style="color:${concrete};margin-top:26px">${p.typeface}</div>
         </div>`),
      construction: () => frame({ w: W, h: H },
        gridPlate(p, { fg: chalk, accent: volt, weight: 400, top: 250, plate: 520 })),
      lockups: () => frame({ w: W, h: H },
        lockupRows(p, { fg: chalk, accent: volt, bg: asphalt, weight: 400, top: 190 })),
    };
  },

  /* ─── VAELCRON · wide margins, one centred element, one hairline ───────── */
  vaelcron(p) {
    const [obsidian, gold, platinum, bone] = p.palette;
    const frame = (s, inner) => shell(
      p.typeface,
      `.b{background:${obsidian};width:${s.w}px;height:${s.h}px;position:relative;overflow:hidden;
          display:flex;align-items:center;justify-content:center}
       .lab{color:${gold};position:absolute;top:${Math.round(s.h * 0.055)}px;left:0;right:0;
            text-align:center}
       .goldrule{position:absolute;left:50%;transform:translateX(-50%);
                 width:${Math.round(s.w * 0.46)}px;height:${s.h < s.w ? 11 : 15}px;background:${gold}}`,
      `<div class="b">
         <div class="mono lab">${p.sector}</div>
         ${inner}
         <div class="abs mono lab" style="top:auto;bottom:${Math.round(s.h * 0.05)}px;color:${platinum};opacity:.6">
           ${p.monogram} &middot; ${p.year}</div>
       </div>`,
      s
    );

    return {
      wordmark: (s) => frame(s, logoSlot(p, 0.74) ??
        `<div style="position:relative;text-align:center;width:100%">
           <div class="wm-fit fit" style="font-family:'${p.typeface}',serif;font-weight:600;
                font-size:120px;line-height:1;color:${bone};letter-spacing:.07em">${p.name}</div>
           <div class="goldrule" style="position:relative;left:auto;transform:none;margin:${s.h < s.w ? 26 : 40}px auto 0"></div>
         </div>`),
      colour: () => frame({ w: W, h: H },
        `<div style="position:relative;display:flex;gap:26px">
           ${p.palette.map((hex) => `
             <div style="text-align:center">
               <div style="width:124px;height:300px;background:${hex};outline:1px solid ${platinum}66"></div>
               <div class="mono lab" style="color:${platinum};margin-top:16px;position:static">${hex}</div>
             </div>`).join('')}
         </div>`),
      application: () => frame({ w: W, h: H },
        // Dial layout: indices, no hands, maison name at 12.
        `<div style="position:relative;width:520px;height:520px;border:1px solid ${platinum};
                     border-radius:50%;display:flex;align-items:center;justify-content:center">
           ${Array.from({ length: 12 }, (_, i) => {
             const a = (i * 30 * Math.PI) / 180;
             const r = 224;
             const x = 260 + Math.sin(a) * r;
             const y = 260 - Math.cos(a) * r;
             const major = i % 3 === 0;
             return `<div style="position:absolute;left:${x}px;top:${y}px;
                       width:${major ? 3 : 1}px;height:${major ? 26 : 16}px;background:${gold};
                       transform:translate(-50%,-50%) rotate(${i * 30}deg)"></div>`;
           }).join('')}
           <div style="position:absolute;top:104px;left:0;right:0;text-align:center;
                       font-family:'${p.typeface}',serif;font-size:30px;color:${bone};
                       letter-spacing:.24em">${p.name}</div>
           <div class="mono" style="position:absolute;bottom:120px;left:0;right:0;text-align:center;
                       font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${platinum};opacity:.7">
             Calibre H-01</div>
         </div>`),
      type: () => frame({ w: W, h: H },
        `<div style="position:relative;text-align:center">
           <div style="font-family:'${p.typeface}',serif;font-size:116px;color:${bone};
                       letter-spacing:.1em">${title(p.name)}</div>
           <div class="goldrule" style="position:relative;left:auto;transform:none;margin:34px auto 0"></div>
           <div style="font-family:'${p.typeface}',serif;font-size:34px;color:${platinum};margin-top:34px">
             AaBbCcDd 0123456789</div>
           <div class="mono lab" style="color:${gold};margin-top:28px;position:static;top:auto">${p.typeface}</div>
         </div>`),
      construction: () => frame({ w: W, h: H },
        `<div style="position:relative">${gridPlate(p, {
          fg: bone, accent: gold, weight: 400, top: 0, plate: 440, inline: true,
        })}</div>`),
      lockups: () => frame({ w: W, h: H },
        `<div style="position:relative;width:${W * 0.66}px">${lockupRows(p, {
          fg: bone, accent: gold, bg: obsidian, weight: 400, top: 0, inline: true,
        })}</div>`),
    };
  },

  /* ─── RETHREAD · garment care label, hairline-boxed ───────────────────── */
  rethread(p) {
    const [ink, forest, flax, hemp] = p.palette;
    const pad = (s) => (s.h < s.w ? 40 : 54);
    // Boards 01 and 01w print the label the right way round — dark ink on flax stock, which
    // is what a garment label actually is. The rest of the system keeps the forest ground.
    // This is a VALUE decision, not a colour one: six dark grounds read as six dark
    // rectangles in the grid however far apart their hues are.
    const frame = (s, inner, light = false) => {
      const ground = light ? flax : forest;
      const mark = light ? ink : flax;
      const rule = light ? forest : flax;
      return shell(
        p.typeface,
        `.b{background:${ground};width:${s.w}px;height:${s.h}px;position:relative;overflow:hidden;
            padding:${pad(s)}px}
         .labelbox{position:absolute;left:${pad(s)}px;right:${pad(s)}px;top:${pad(s)}px;
                   bottom:${pad(s)}px;border:1px solid ${rule};opacity:.55}
         .lab{color:${rule};position:relative;z-index:2;opacity:.75}
         .stitch{position:absolute;left:${pad(s) + 18}px;right:${pad(s) + 18}px;
                 bottom:${Math.round(s.h * 0.14)}px;height:1px;
                 background:repeating-linear-gradient(to right,${rule} 0 8px,transparent 8px 16px);
                 opacity:.6}`,
        `<div class="b">
           <div class="labelbox"></div>
           <div class="mono lab" style="padding:6px 0 0 14px">${p.sector} · ${p.year}</div>
           ${inner}
           <div class="stitch"></div>
           <div class="abs" style="right:${pad(s) + 16}px;bottom:${pad(s) + 12}px">${reg(16, mark)}</div>
         </div>`,
        s
      );
    };

    return {
      wordmark: (s) => frame(s, logoSlot(p, 0.76) ??
        `<div style="position:absolute;left:${pad(s) + 20}px;right:${pad(s) + 20}px;
                     top:50%;transform:translateY(-58%);text-align:center">
           <div class="wm-fit fit" style="font-family:'${p.typeface}',sans-serif;font-weight:600;
                font-size:120px;line-height:.96;color:${ink};letter-spacing:-.01em">${p.name}</div>
           <div style="display:flex;justify-content:center;margin-top:${s.h < s.w ? 26 : 44}px">
             ${washMarks(forest, s.h < s.w ? 1.1 : 1.7)}
           </div>
         </div>
         <div class="mono" style="position:absolute;left:0;right:0;bottom:${Math.round(s.h * 0.08)}px;
              text-align:center;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${forest}">
           Buy-back code ${p.monogram}-${p.year}</div>`, true),
      colour: () => frame({ w: W, h: H },
        p.palette.map((hex, i) => `
          <div style="position:absolute;left:${pad({ h: H, w: W }) + 26}px;
                      right:${pad({ h: H, w: W }) + 26}px;top:${180 + i * 200}px;height:150px;
                      background:${hex};outline:1px solid ${hemp};display:flex;align-items:center;
                        padding-left:20px">
            <span class="mono lab" style="color:${contrastOn(hex)};opacity:1">${hex}</span>
          </div>`).join('')),
      application: () => frame({ w: W, h: H },
        // The care label itself, at scale.
        `<div style="position:absolute;left:50%;top:190px;transform:translateX(-50%);
                     width:470px;height:600px;background:${flax};padding:38px">
           <div style="font-family:'${p.typeface}',sans-serif;font-weight:700;font-size:34px;
                       color:${ink};letter-spacing:-.01em">${p.name}</div>
           <div style="height:1px;background:${hemp};margin:20px 0"></div>
           <div class="mono" style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;
                       color:${ink};line-height:2.2">
             68% organic cotton<br/>28% recycled wool<br/>4% elastane<br/>Made in Porto
           </div>
           <div style="margin-top:26px">${washMarks(ink)}</div>
           <div style="height:1px;background:${hemp};margin:26px 0 18px"></div>
           <div class="mono" style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;
                       color:${forest};line-height:1.9">
             Return this garment<br/>for 30% of purchase<br/>price, any condition.
           </div>
           <div class="mono" style="position:absolute;left:38px;bottom:34px;font-size:11px;
                       letter-spacing:.24em;color:${hemp}">${p.monogram}-${p.year}-004871</div>
         </div>`),
      type: () => frame({ w: W, h: H },
        `<div style="position:absolute;left:${pad({ h: H, w: W }) + 26}px;right:54px;top:300px">
           <div style="font-family:'${p.typeface}',sans-serif;font-weight:600;font-size:104px;
                       color:${flax};line-height:.96">${title(p.name)}</div>
           <div style="font-family:'${p.typeface}',sans-serif;font-weight:400;font-size:34px;
                       color:${hemp};margin-top:26px">AaBbCcDd 0123456789</div>
           <div class="mono lab" style="color:${flax};margin-top:28px;padding:0">${p.typeface}</div>
         </div>`),
      construction: () => frame({ w: W, h: H },
        gridPlate(p, { fg: flax, accent: hemp, weight: 600, top: 280, plate: 460 })),
      lockups: () => frame({ w: W, h: H },
        lockupRows(p, { fg: flax, accent: hemp, bg: forest, weight: 600, top: 220 })),
    };
  },

  /* ─── VOYAZE · technical annotation, coordinates, refund ticker ───── */
  voyaze(p) {
    const [sea, coral, salt, slate] = p.palette;
    const pad = (s) => (s.h < s.w ? 42 : 56);
    // As with rethread, boards 01/01w invert to the light ground so the work grid carries a
    // range of values and not just a range of hues. The annotation system is unchanged —
    // it is the paper that flips, not the drawing on it.
    const frame = (s, inner, light = false) => {
      const ground = light ? salt : sea;
      const type = light ? sea : salt;
      const rule = light ? sea : slate;
      return shell(
        p.typeface,
        `.b{background:${ground};width:${s.w}px;height:${s.h}px;position:relative;overflow:hidden;
            padding:${pad(s)}px}
         .ticker{position:absolute;left:-30px;right:-30px;bottom:${Math.round(s.h * 0.1)}px;
                 height:${Math.round(s.h * 0.078)}px;background:${coral};display:flex;
                 align-items:center;justify-content:center;gap:34px;overflow:hidden}
         .ticker span{font-family:'JetBrains Mono',monospace;font-size:${s.h < s.w ? 14 : 17}px;
                      letter-spacing:.22em;text-transform:uppercase;color:${sea};white-space:nowrap}
         .vrule{position:absolute;left:${pad(s) + 26}px;top:${Math.round(s.h * 0.16)}px;
                bottom:${Math.round(s.h * 0.22)}px;width:1px;background:${rule};opacity:.6}
         .lab{color:${light ? sea : coral}}
         .ann{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
              text-transform:uppercase;color:${light ? sea : slate};${light ? 'opacity:.72' : ''}}`,
        `<div class="b">
           <div class="mono lab">${p.sector}</div>
           <div class="vrule"></div>
           ${inner}
           <div class="ticker">
             <span>10,000,000 views</span><span>&middot;</span><span>full refund</span>
             <span>&middot;</span><span>10,000,000 views</span>
           </div>
           <div class="abs" style="right:${pad(s)}px;bottom:${pad(s) - 18}px">${reg(18, light ? sea : salt)}</div>
         </div>`,
        s
      );
    };

    return {
      wordmark: (s) => frame(s, logoSlot(p) ??
        `<div style="position:absolute;left:${pad(s) + 54}px;right:${pad(s)}px;top:${Math.round(s.h * 0.3)}px">
           <div class="wm-fit fit" style="font-family:'${p.typeface}',sans-serif;font-weight:700;
                font-size:120px;line-height:.94;color:${sea};letter-spacing:-.04em">${p.name}</div>
           <div class="ann" style="margin-top:20px">28&deg;36'N &nbsp; 77&deg;13'E &nbsp;&mdash;&nbsp; 64&deg;08'N &nbsp; 21&deg;56'W</div>
         </div>`, true),
      colour: () => frame({ w: W, h: H },
        p.palette.map((hex, i) => `
          <div style="position:absolute;left:126px;right:56px;top:${200 + i * 165}px;height:130px;
                      display:flex;align-items:stretch">
            <div style="width:160px;background:${hex};outline:1px solid ${slate}"></div>
            <div style="flex:1;border-bottom:1px solid ${slate}88"></div>
            <div class="ann" style="align-self:flex-end;padding-bottom:6px">${hex}</div>
          </div>`).join('')),
      application: () => frame({ w: W, h: H },
        // Boarding pass.
        `<div style="position:absolute;left:50%;top:200px;transform:translateX(-50%);
                     width:560px;height:560px;background:${salt};display:flex">
           <div style="flex:1;padding:36px">
             <div class="mono" style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${slate}">Boarding</div>
             <div style="font-family:'${p.typeface}',sans-serif;font-weight:700;font-size:62px;
                         color:${sea};letter-spacing:-.04em;margin-top:14px;line-height:1">DEL<br/>KEF</div>
             <div class="mono" style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;
                         color:${slate};margin-top:24px;line-height:2.1">
               28&deg;36'N 77&deg;13'E<br/>64&deg;08'N 21&deg;56'W<br/>Seat 14A &middot; Zone 2
             </div>
             <div style="position:absolute;left:36px;bottom:34px;background:${coral};color:${sea};
                         font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.16em;
                         text-transform:uppercase;padding:10px 16px">Refund at 10M views</div>
           </div>
           <div style="width:1px;background:repeating-linear-gradient(${slate} 0 8px,transparent 8px 16px)"></div>
           <div style="width:150px;padding:36px 20px;display:flex;flex-direction:column;
                       justify-content:space-between;align-items:center">
             <div class="mono" style="font-size:10px;letter-spacing:.2em;color:${slate}">${p.name}</div>
             <div style="font-family:'${p.typeface}',sans-serif;font-weight:700;font-size:56px;color:${sea}">K</div>
             <div class="mono" style="font-size:10px;letter-spacing:.2em;color:${slate}">14A</div>
           </div>
         </div>`),
      type: () => frame({ w: W, h: H },
        `<div style="position:absolute;left:${56 + 54}px;right:56px;top:300px">
           <div style="font-family:'${p.typeface}',sans-serif;font-weight:700;font-size:112px;
                       color:${salt};letter-spacing:-.05em;line-height:.94">${title(p.name)}</div>
           <div style="font-family:'${p.typeface}',sans-serif;font-weight:400;font-size:34px;
                       color:${coral};margin-top:24px">AaBbCcDd 0123456789</div>
           <div class="ann" style="margin-top:24px">${p.typeface} &middot; 700 / 400</div>
         </div>`),
      construction: () => frame({ w: W, h: H },
        gridPlate(p, { fg: salt, accent: coral, weight: 700, top: 280, plate: 450 })),
      lockups: () => frame({ w: W, h: H },
        lockupRows(p, { fg: salt, accent: slate, bg: sea, weight: 700, top: 220 })),
    };
  },

  /* ─── VOXARIS · poster, display type hard-cropped, one phosphor rule ── */
  voxaris(p) {
    const [voidc, phosphor, paper, ash] = p.palette;
    // 5% gutter: at 34px the glyph's own side bearing put measured ink at 3.9%, inside
    // the 4% keep-clear the grid tile depends on. The poster crops its image, not its type.
    const gut = (s) => Math.round(s.w * 0.05);
    const GUT = Math.round(W * 0.05);
    const frame = (s, inner) => shell(
      p.typeface,
      `.b{background:${voidc};width:${s.w}px;height:${s.h}px;position:relative;overflow:hidden}
       .lab{color:${phosphor};position:absolute;top:${Math.round(s.h * 0.05)}px;
            left:${Math.round(s.w * 0.05)}px;z-index:4}
       .rule{position:absolute;left:-40px;right:-40px;height:${Math.round(s.h * 0.02)}px;
             background:${phosphor}}`,
      `<div class="b">
         <div class="mono lab">${p.sector} · ${p.year}</div>
         ${inner}
         <div class="abs mono" style="right:${Math.round(s.w * 0.05)}px;
              bottom:${Math.round(s.h * 0.05)}px;z-index:4;font-size:11px;
              letter-spacing:.22em;text-transform:uppercase;color:${ash}">Printed sheet no. 04</div>
       </div>`,
      s
    );

    return {
      wordmark: (s) => frame(s, (logoSlot(p) &&
        // The phosphor rule belongs to the poster system, not to the wordmark it happened
        // to sit beside. Dropping it with the type left the tile with no phosphor at all.
        `${logoSlot(p)}<div class="rule" style="top:${Math.round(s.h * 0.82)}px"></div>`) ??
        `<div style="position:absolute;left:${gut(s)}px;right:${gut(s)}px;top:${Math.round(s.h * 0.16)}px">
           <div class="wm-fit fit" style="font-family:'${p.typeface}',sans-serif;font-size:120px;
                line-height:.8;color:${phosphor};letter-spacing:-.02em">
             ${s.h < s.w ? p.name : 'VO<br/>XARIS'}</div>
         </div>
         <div class="rule" style="top:${Math.round(s.h * 0.7)}px"></div>
         <div style="position:absolute;left:${gut(s)}px;right:${gut(s)}px;top:${Math.round(s.h * 0.76)}px;
                     font-family:'JetBrains Mono',monospace;font-size:${s.h < s.w ? 13 : 17}px;
                     letter-spacing:.14em;text-transform:uppercase;color:${paper};line-height:2">
           A sheet nailed up in public<br/>${s.h < s.w ? '' : 'Credited to the source event'}</div>
`),
      colour: () => frame({ w: W, h: H },
        `<div style="position:absolute;inset:0;display:flex">
           ${p.palette.map((hex) => `
             <div style="flex:1;background:${hex};position:relative;box-shadow:inset 1px 0 0 ${ash}">
               <div class="mono" style="position:absolute;bottom:38px;left:0;right:0;font-size:12px;
                    letter-spacing:.22em;text-transform:uppercase;text-align:center;
                    color:${contrastOn(hex)}">${hex}</div>
             </div>`).join('')}
         </div>`),
      application: () => frame({ w: W, h: H },
        // Game cover: full-bleed title, source-event credit line.
        `<div style="position:absolute;left:${GUT}px;right:-40px;top:130px;
                     font-family:'${p.typeface}',sans-serif;font-size:212px;line-height:.78;
                     color:${phosphor};letter-spacing:-.02em">THE<br/>LONG<br/>WINTER</div>
         <div class="rule" style="top:700px"></div>
         <div style="position:absolute;left:${GUT}px;right:${GUT}px;top:750px;
                     font-family:'${p.typeface}',sans-serif;font-size:54px;line-height:1.02;
                     color:${paper}">BASED ON THE<br/>WINTER OF 1946</div>
         <div style="position:absolute;left:${GUT}px;right:${GUT}px;top:900px;display:flex;gap:40px;
                     font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.1em;
                     text-transform:uppercase;color:${ash};line-height:2.1">
           <div style="flex:1;border-top:1px solid ${ash}66;padding-top:16px">
             Sources credited<br/>in full at launch.<br/>No composite<br/>characters.</div>
           <div style="flex:1;border-top:1px solid ${ash}66;padding-top:16px">
             Print this sheet.<br/>Paste it where<br/>someone will<br/>read it.</div>
         </div>
         <div class="mono" style="position:absolute;left:${GUT}px;bottom:22px;font-size:12px;
              letter-spacing:.22em;text-transform:uppercase;color:${phosphor}">${title(p.name)} &middot; Issue-led games</div>`),
      type: () => frame({ w: W, h: H },
        `<div style="position:absolute;left:-14px;right:-40px;top:180px;
                     font-family:'${p.typeface}',sans-serif;font-size:210px;line-height:.8;
                     color:${phosphor}">Aa</div>
         <div class="rule" style="top:600px"></div>
         <div style="position:absolute;left:${GUT}px;top:670px;font-family:'${p.typeface}',sans-serif;
                     font-size:64px;color:${paper}">ABCDEF 0123</div>
         <div class="mono" style="position:absolute;left:${GUT}px;top:800px;font-size:12px;
              letter-spacing:.22em;text-transform:uppercase;color:${phosphor}">${p.typeface}</div>`),
      construction: () => frame({ w: W, h: H },
        gridPlate(p, { fg: phosphor, accent: ash, weight: 400, top: 260, plate: 520 })),
      lockups: () => frame({ w: W, h: H },
        lockupRows(p, { fg: phosphor, accent: ash, bg: voidc, weight: 400, top: 210 })),
    };
  },

  /* ─── SENTINEL · technical grid, ticks and tolerances ────────────────── */
  sentinel(p) {
    const [graphite, indigo, quartz, steel] = p.palette;
    const pad = (s) => (s.h < s.w ? 42 : 56);
    const ticks = (s) =>
      Array.from({ length: 25 }, (_, i) => {
        const long = i % 5 === 0;
        return `<div style="position:absolute;top:0;left:${(i * s.w) / 24}px;width:1px;
                 height:${long ? 18 : 9}px;background:${steel};opacity:.7"></div>`;
      }).join('');
    const frame = (s, inner) => shell(
      p.typeface,
      `.b{background:${graphite};width:${s.w}px;height:${s.h}px;position:relative;overflow:hidden;
          padding:${pad(s)}px}
       .ruler{position:absolute;top:0;left:0;right:0;height:18px}
       .grid{position:absolute;inset:${Math.round(s.h * 0.12)}px ${pad(s)}px ${Math.round(s.h * 0.12)}px ${pad(s)}px;
             background-image:linear-gradient(${steel} 1px,transparent 1px),
                              linear-gradient(90deg,${steel} 1px,transparent 1px);
             background-size:${Math.round(s.w / 10)}px ${Math.round(s.w / 10)}px;opacity:.12}
       .lab{color:${indigo}}
       .ann{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
            text-transform:uppercase;color:${steel}}
       .active{background:${indigo};display:inline-block}`,
      `<div class="b">
         <div class="ruler">${ticks(s)}</div>
         <div class="grid"></div>
         <div class="mono lab" style="margin-top:14px">${p.sector} · tol &plusmn;0.02</div>
         ${inner}
         <div class="abs" style="right:${pad(s)}px;bottom:${pad(s) - 18}px">${reg(18, steel)}</div>
       </div>`,
      s
    );

    return {
      wordmark: (s) => frame(s, logoSlot(p, 0.8) ??
        `<div style="position:absolute;left:${pad(s)}px;right:${pad(s)}px;top:${Math.round(s.h * 0.34)}px">
           <div class="wm-fit fit" style="font-family:'${p.typeface}',sans-serif;font-weight:600;
                font-size:120px;line-height:.96;color:${quartz};letter-spacing:-.03em">
             ${s.h < s.w ? p.name : 'SENT<br/>INEL'}</div>
           <div class="ann" style="margin-top:20px">Faceplate 148 &times; 42 &times; 11 mm</div>
         </div>
         <div class="active" style="position:absolute;right:${pad(s)}px;top:${Math.round(s.h * 0.2)}px;
              width:${Math.round(s.w * 0.28)}px;height:${s.h < s.w ? 24 : 34}px"></div>
         <div class="ann" style="position:absolute;right:${pad(s)}px;
              top:${Math.round(s.h * 0.2) + (s.h < s.w ? 34 : 46)}px;color:${indigo}">Active state</div>`),
      colour: () => frame({ w: W, h: H },
        p.palette.map((hex, i) => `
          <div style="position:absolute;left:56px;right:56px;top:${210 + i * 190}px;height:140px;
                      display:flex;align-items:stretch">
            <div style="width:170px;background:${hex};outline:1px solid ${steel}"></div>
            <div style="flex:1;border-bottom:1px solid ${steel}66"></div>
            <div class="ann" style="align-self:flex-end;padding-bottom:6px">${hex}</div>
          </div>`).join('')),
      application: () => frame({ w: W, h: H },
        // Lock faceplate: scanner aperture, indicator, tolerance ticks.
        `<div style="position:absolute;left:50%;top:210px;transform:translateX(-50%);
                     width:300px;height:660px;background:${quartz};padding:34px;
                     display:flex;flex-direction:column;align-items:center;justify-content:space-between">
           <div class="mono" style="font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${steel}">${p.name}</div>
           <div style="width:150px;height:150px;border:2px solid ${graphite};border-radius:50%;
                       display:flex;align-items:center;justify-content:center">
             <div style="width:60px;height:60px;border:1px solid ${steel};border-radius:50%"></div>
           </div>
           <div style="width:64px;height:6px;background:${indigo}"></div>
           <div class="mono" style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;
                       color:${steel};text-align:center;line-height:2">
             148 &times; 42 mm<br/>&plusmn;0.02 tol</div>
         </div>
         ${[
           ['Aperture &oslash;38', 460],
           ['Bezel 2.0', 386],
           ['Indicator 64&times;6', 665],
         ].map(([text, y]) => `
           <div class="ann" style="position:absolute;left:56px;top:${y - 8}px">${text}</div>
           <div style="position:absolute;left:200px;top:${y}px;width:${350 - 200}px;height:1px;
                       background:${steel};opacity:.5"></div>
           <div style="position:absolute;left:346px;top:${y - 3}px;width:7px;height:7px;
                       background:${indigo}"></div>`).join('')}`),
      type: () => frame({ w: W, h: H },
        `<div style="position:absolute;left:56px;right:56px;top:320px">
           <div style="font-family:'${p.typeface}',sans-serif;font-weight:600;font-size:100px;
                       color:${quartz};letter-spacing:-.03em;line-height:.98">${title(p.name)}</div>
           <div style="font-family:'${p.typeface}',sans-serif;font-weight:400;font-size:34px;
                       color:${indigo};margin-top:26px">AaBbCcDd 0123456789</div>
           <div class="ann" style="margin-top:24px">${p.typeface} &middot; 600 / 400</div>
         </div>`),
      construction: () => frame({ w: W, h: H },
        gridPlate(p, { fg: quartz, accent: indigo, weight: 600, top: 300, plate: 460 })),
      lockups: () => frame({ w: W, h: H },
        lockupRows(p, { fg: quartz, accent: indigo, bg: graphite, weight: 600, top: 240 })),
    };
  },
};

// ─────────────────────────────────────────────────────────── render

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();

  let n = 0;
  for (const p of projects) {
    const sys = SYS[p.slug](p);
    const boards = {
      1: sys.wordmark({ w: W, h: H }),
      '1w': sys.wordmark({ w: WIDE_W, h: WIDE_H }),
      2: sys.colour(),
      3: sys.application(),
      4: sys.type(),
      5: sys.construction(),
      6: sys.lockups(),
    };

    for (const idx of [1, '1w', 2, 3, 4, 5, 6]) {
      const size = idx === '1w' ? { w: WIDE_W, h: WIDE_H } : { w: W, h: H };
      await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1 });

      // 'load' rather than 'networkidle0': keep-alive sockets to the font CDN mean the
      // network never actually goes idle, and setContent just times out.
      await page.setContent(boards[idx], { waitUntil: 'load', timeout: 60000 });

      // fonts.check() alone reports false for a face the page never uses, so request it
      // explicitly first. Weight 400 is the one weight every family here provides.
      const loaded = await page.evaluate(async (family) => {
        try {
          await document.fonts.load(`400 100px "${family}"`);
        } catch {}
        await document.fonts.ready;
        return document.fonts.check(`400 100px "${family}"`);
      }, p.typeface);
      if (!loaded) throw new Error(`${p.slug}-0${idx}: typeface "${p.typeface}" never loaded`);

      // Fit the wordmark against the live DOM. Six typefaces at six string lengths cannot
      // share one font-size, and hand-guessing is what left four boards reading as blank.
      const fit = await page.evaluate(
        ([boardW, boardH, defH]) => {
          const el = document.querySelector('.wm-fit');
          if (!el) return null;
          // A bleeding wordmark declares its own budget: fitting it to 72% of the board and
          // then pushing it outwards would leave the crop to chance.
          const maxW = boardW * (parseFloat(el.dataset.fitW) || 0.72);
          // A logo gets far more vertical room than a line of type does. It has to: the
          // >=55% WIDTH rule is the one that matters for the grid tile, and a squarish mark
          // cannot reach 55% of a 16:10 board's width inside a headline's height budget.
          const isImgEl = el.tagName === 'IMG';
          const maxH =
            boardH *
            (parseFloat(el.dataset.fitH) || (isImgEl ? (boardH < boardW ? 0.86 : 0.66) : defH));
          // One search, two units: type is sized by font-size, a logo by width. Both are
          // measured off the live box, which is the whole point of fitting in the browser.
          const isImg = isImgEl;
          const apply = (v) => {
            if (isImg) el.style.width = `${v}px`;
            else el.style.fontSize = `${v}px`;
          };
          let lo = 20;
          let hi = isImg ? boardW * 1.4 : 460;
          for (let i = 0; i < 34; i++) {
            const mid = (lo + hi) / 2;
            apply(mid);
            const r = el.getBoundingClientRect();
            // Both dimensions: on the 16:10 board a width-only fit overflows vertically.
            if (r.width > maxW || r.height > maxH) hi = mid;
            else lo = mid;
          }
          apply(lo);
          const r = el.getBoundingClientRect();
          return { size: Math.round(lo), width: Math.round(r.width), height: Math.round(r.height) };
        },
        [size.w, size.h, size.h < size.w ? 0.4 : 0.44]
      );

      if (fit) {
        const share = (fit.width / size.w) * 100;
        if (share < 55) {
          throw new Error(`${p.slug}-0${idx}: wordmark only ${share.toFixed(1)}% of board width`);
        }
        // A declared bleed that does not actually reach the edges is a silent regression:
        // the board still passes >=55% and quietly stops being the full-bleed system.
        // Only the generated type bleeds. Once a real logo takes the slot it is a mark, not
        // a cropped headline, and it has to sit inside the board like any other logo.
        if (p.wordmarkBleed === 'horizontal' && !logoDataUrl(p.slug) && share <= 100) {
          throw new Error(
            `${p.slug}-0${idx}: declares a horizontal bleed but sits at ${share.toFixed(1)}% of width`
          );
        }
      }

      await page.screenshot({
        path: path.join(OUT, `${p.slug}-0${idx}.webp`),
        type: 'webp',
        quality: 90,
      });
      n++;
    }
    process.stdout.write(`  ${p.slug}: 7 boards\n`);
  }

  await browser.close();
  console.log(`\ndone   ${n} boards -> public/work`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

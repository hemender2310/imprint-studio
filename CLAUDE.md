# IMPRINT — build rules

Fictional brand & advertising studio portfolio. Next.js App Router, React 19, TypeScript.
This file is the authority on tokens and constraints. Re-read it before writing any component.

## Design tokens — use these, introduce no others

| Token    | Hex/value                | Use                        |
| -------- | ------------------------ | -------------------------- |
| Paper    | `#F2EEE6`                | page background            |
| Deckle   | `#E4DED1`                | alternate surface bands    |
| Ink      | `#17150F`                | display type               |
| Graphite | `#55504A`                | body copy                  |
| Cyan     | `#0090C1`                | the SINGLE accent          |
| Cyan-hi  | `#00A6DE`                | CTA hover only             |
| Rule     | `rgba(23,21,15,0.14)`    | hairlines                  |

Cyan appears on: eyebrow labels, registration marks, CTA buttons, link underlines, focus
rings. Nowhere else — note the cursor is NOT cyan (see gotchas). No second accent. **No terracotta, warm clay, or any orange-red, anywhere.**

Exception: the six client brands have their own palettes. Those colours appear ONLY inside
generated project imagery and project-page swatches — never in IMPRINT's own chrome.

## Type

- Display — `Instrument_Serif` 400 → `--font-instrument`
- Body — `Archivo` 300/400/500 → `--font-archivo`
- Utility — `JetBrains_Mono` 400 → `--font-mono`

Only these three faces ship. Client typefaces are rendered into board images by Puppeteer at
build time; they are never loaded as web fonts.

Labels: mono, `0.68rem`, `letter-spacing: 0.22em`, uppercase. Cyan on paper backgrounds;
`#F2EEE6` with a cyan registration mark beside them when they sit over the hero canvas.
Scale: h1 `clamp(3rem,9vw,8rem)` · h2 `clamp(2rem,5vw,4rem)` · body `1.05rem/1.65`.

## Signature element — registration marks

Crosshair-in-a-circle, as used to align colour plates. It is the section divider, the process
step marker, and the accent beside hero labels. (It used to be the cursor too; the cursor is
now a blurred disc.) **The crosshair lines must extend past the circle on all four sides** — that overhang is what makes it a printer's mark rather than a target reticle.
Registration marks replace horizontal rules as section dividers.

## Non-negotiables

- No footer, no cookie banner. The no-navbar rule is retired: a fixed top bar (IMPRINT / MENU)
  plus a full-screen overlay carries navigation across the eight routes. The bar hides over the
  hero on home and is visible immediately elsewhere.
- No lorem ipsum.
- No `border-radius`. No drop shadows. No gradients beyond the hero scrims and the CTA glow.
  The one exception is the cursor, which is a disc.
- No `<video>` for the scrub — canvas + preloaded WebP frames only.
- **The ink canvas is a fixed layer under the whole document** (`InkCanvas`, mounted once in
  `layout.tsx`), driven by whole-document scroll: the hero maps to the first 72% of the
  sequence, the rest of the page to the last 28%. It is NOT owned by ScrollHero. Section
  grounds are transparent; a fixed paper veil ramps 0 -> 0.88 across the hero's last 40vh and
  holds. Work tiles and the Process list carry solid paper cards for legibility.
- No scroll event listener for the canvas — rAF + `getBoundingClientRect` only.
- The hero text overlay is NEVER gated behind an image-preload or ready state.
- The frame tracker NEVER advances past a target until that image has actually painted.
- Never `setState` on mousemove — refs and direct style writes only.
- Stack everything below 768px. Cursor and trail off on touch.
- Respect `prefers-reduced-motion` throughout — including the hero, which is JS-driven and
  therefore untouched by the CSS reset.

## Gotchas that have already cost time

- **Do not give the hero scrim a dark stop at an edge.** The original was darkest at 0% — the
  bottom — so the hero's last row met the page's cream head-on and read as a hard seam. It now
  fades to transparent at both edges with its darkest point mid-viewport.
- **`MaskedLines` renders `<span>` by default.** Section headings and project titles must pass
  `as="h2"` / `as="h1"` or the page ends up with no heading structure at all.
- **The cursor lives in the layout and never remounts**, so anything it observes must be
  re-measured per frame. A mount-time IntersectionObserver on `[data-hero]` goes stale after
  the first client-side navigation.
- **The trail's live pool and its DOM count are different numbers.** Tiles keep their node
  through an 0.8s exit; `data-exiting` marks them so the cap can be asserted on the live pool.

- **The intro panel is server-rendered and gated before paint.** A client-only panel lets the
  hero paint for a frame first; an always-on panel flashes on repeat visits. An inline script
  in `layout.tsx` sets `data-intro-seen` on `<html>` before paint and CSS does the rest.
- **The hero identity entrance waits on `useIntroDone()`**, so the stagger is not played
  behind an opaque panel. Anything testing that entrance must poll the gate
  (`[data-hero][data-intro-done]`), not the absence of `[data-intro]` — absence passes
  instantly on the first tick, before React has hydrated.
- **The menu locks scroll via `window.__lenis.stop()`**, not `overflow: hidden`. Lenis keeps
  scrolling underneath an overflow lock.

- **The cursor is a soft blurred disc with NO blend mode** — 34px at rest, 84px on
  `[data-cursor]`, `rgba(23,21,15,0.10)` rising to `0.16`, blur 8px, lerp 0.14, no label and
  no rotation. The fill flips to `rgba(242,238,230,·)` over the hero via an
  IntersectionObserver on `[data-hero]`.
  `mix-blend-mode: difference` was tried and is wrong on a light page: it renders as a dark
  smudge over paper and a muddy blob over the cyan CTA. Measured darkening must stay under
  12% over paper, a work tile and the CTA — `verify.mjs` asserts it.
- **`AnimatePresence initial={false}` suppresses the mount animation of every descendant**,
  not just its direct child. Wrapping the app in one silently killed the hero's staggered
  identity entrance. `PageTransition` uses a keyed `motion.div` instead.
- **Never put an animated property in a motion element's `style` object.** A static
  `scaleY: 0` alongside `animate` wins for a frame on re-render — that flashed page content
  through the transition panel mid-navigation.
- **Radial backdrops need `farthest-side`.** The default farthest-corner sizes the ellipse to
  the box corners, so along the horizontal midline the ramp is still part-opaque where the box
  ends and the backdrop shows as a hard rectangle.
- **Each brand has its own compositional system** (see `generate-boards.mjs`), applied across
  all seven of its boards. Do not add a shared layout back — six colourways of one layout is
  what this replaced.
  Board 03 is a FLAT GRAPHIC ARTIFACT per brand — shoebox face, dial layout, care label,
  boarding pass, game cover, lock faceplate. Do not attempt procedural product photography.
- **Board 01 needs ink MASS, not just width.** The >=55% width fit passes on a hairline:
  Cormorant at 400 with .14em tracking covered 0.5% of the board, the contrast check could
  not find a wordmark at all, and the grid tile read as an empty black square. Weight and
  tracking are part of carrying at 320px.
- **A palette's own ground is invisible on its colour board.** Every one of the six leads with
  the brand's ground, so swatch 01 vanishes into the board behind it. Hairline every swatch.
- **`.gitignore` must anchor `/frames/` and `/assets/` with a leading slash.** Unanchored,
  those patterns match a directory of that name at ANY depth, so `frames` silently swallows
  `public/frames` — the whole 180-frame hero sequence — and git will not let a later negation
  re-include a file that sits inside an ignored directory. Everything under `public/` is
  committed on purpose: Python, Puppeteer and ffmpeg do not run on Vercel, so an ignored
  `public/` subdirectory still builds green and deploys a site with no imagery.
- **`rm -rf .next` after changing the slug set.** Next reuses the prerender cache, so the new
  routes were served from the old build's 404 entries — `.next/server/app/work/<slug>.meta`
  said `"status": 404` while the build log said all six prerendered.
- **Context photos are locked by Commons title in `context.ts`.** A plain search is not
  reproducible: Commons re-ranks between runs and answers a burst with an EMPTY result set
  rather than an error, so two builds a minute apart chose different photos and whichever
  project ran last got none. Re-run with `--refresh` or `--refresh=slug` to re-search one.
- **Two things filter context photos that a filename cannot.** Scanned line art is caught by a
  bimodal histogram (bare paper plus ink, almost no mid-tones) — low chroma alone also
  describes a macro of a steel watch movement. And a photo whose dominant hue fights the
  brand's palette is scored down: a hot pink fabric stack is genuinely fabric and genuinely
  wrong for a forest-and-flax identity.
- **No real-world marks in context photography either.** Sneaker and airport-terminal queries
  returned a swoosh and a ROLEX sign in frame. Queries name surfaces and materials, not
  products, and a brand blocklist backs it up.
- **`destination-in` masks by ALPHA, and a colour filter cannot invent alpha.** The brand hero
  masks photography with the ink frames; `filter: invert(1)` before a `destination-in` draw
  looked right and did nothing, because the frames are fully opaque WebPs. The mask is an
  inline SVG `feColorMatrix` writing `alpha = 1 - luminance`, referenced as `ctx.filter =
  url(#id)`. Without it every composite is the bare photograph.
- **A sticky hero's beats cannot ride `useSectionProgress`.** That measures an element's
  passage through the viewport, so a 300vh sticky track is already past 0.16 on the first
  frame and beat 1 mounts at opacity 0. BrandHero writes one `useMotionValue` from the track's
  own scroll — the same number the frame index uses — and every beat reads it.
- **Clear `.next/cache/images` after regenerating boards.** Next's image optimizer caches by
  URL, so a regenerated board keeps being served from the old optimized copy and every
  measurement of the work grid is a measurement of the previous run.
- **A scrim solved from a region's MEAN is solved for the wrong pixel.** Contrast is
  worst-case. BrandHero samples the box the copy actually occupies, read off the DOM, and
  solves against the 85th luminance percentile of it.
- **Board 01 measurement differs for a logo.** Generated type is one flat colour, so "pixels
  near the ink colour" isolates it. A real logo runs from near-black to mid-green to brushed
  silver and measured 0-28% that way. For a logo the mask is inverted — everything far enough
  from the GROUND — confined to the logo slot's own 4.5% margin box, and eroded on both axes
  (x +/-1, enough to drop 1px furniture without eating outline letterforms).
- **Only one of the twelve supplied logo files carries real alpha.** The rest are lockups on a
  ground, and half of those grounds are textured photography, so a flat-colour key leaves the
  rock behind. They are keyed on LUMINANCE against the border ring's own percentiles, with an
  alpha floor to clear the residue — and keyed BEFORE any crop, because a crop that trims a
  feature row cuts the wordmark and fills the ring with glyphs.
- **The supplied advertisements carry third-party trademarks** — a Lamborghini badge, Steam /
  PS5 / Xbox marks, LEGION and INZONE booth signage, social icons. Every hero and gallery
  rectangle in `ingest-brands.mjs` is placed to exclude them. Same rule as the cursor trail.
- **The ads are finished layouts, not photography.** Each already has a headline where the
  brand hero puts the project name, so heroes are cropped OUT of the photographic region
  rather than used whole. `/BRANDS` is a source folder and is gitignored.
- **The brand hero's ink is a TRANSITION, not a background.** Masked by the ink alone every
  hero sat at 20-47% revealed and all six read as the home page's backdrop. The mask carries a
  scroll-driven floor — `max(inkAlpha, revealFloor(p))` — reaching 100% at progress 0.55, past
  which the photograph is simply the page. The floor is applied in the LUMINANCE domain
  (a `darken` blend against a flat grey) because alpha = 1 - luminance: compositing it as a
  translucent layer instead would be a cross-fade, and the blots would stop opening outward.
- **Reveal cannot be measured by distance from paper.** The frames' own paper sits at
  luminance 0.93, so alpha is ~0.07 even where the mask conceals, and 7% of a dark photograph
  moves a pixel far enough from `#F2EEE6` to read as revealed — vyntrix measured 98% revealed
  at progress 0. The canvas publishes the mask's mean alpha as `data-reveal` instead.
- **Do not `getImageData` a full canvas every frame.** Reading 2.9M pixels per draw to publish
  that figure pinned the main thread hard enough that the page never reached network idle. It
  reads a 48x30 downsample.
- **Every file in `/BRANDS` is a finished advertisement.** Hero crops are SEARCHED for the
  largest 16:9 window that is text-free, tonally rich, and at least a quarter detail — not
  hand-placed. The tonal gates matter: sigma alone admitted a blank marble wall (21) and an
  empty sky (27), and a detail-share floor is what distinguishes a photograph with a subject
  from a backdrop with one dark corner in it.
- **The text detector is reliable on isolated type and not on dense composite scenes.** A
  photographed trade stand marks a third of its pixels as edges at any sensitivity that still
  catches small captions, every letter touches its neighbours, and Sentinel's stand came back
  as a single 632x427 component with no glyphs in it. Where that happens the copy-bearing
  regions are listed in `PLAN[slug].forbid` by inspection — the same mechanism the trademarks
  needed, since a badge on a steering wheel is not type either. The COMPOSITE check in
  verify.mjs is the real gate: grading separates print that the source-side test misses, and
  it is what caught a garment printed with four lines of display copy at 11%.
- **Key logos on the FLATTEST ground, not the polarity-matched one.** Vyntrix's dark lockup
  sits on lit rock (ring sigma 13.4 against 0.5 for its light variant) whose highlights are
  the same size and brightness as its own small type; filtering that by component size ate the
  I from "BUILT" and left rock behind. The light variant is keyed instead and painted flat in
  the board's tone. Debris went from a scatter to zero.
- **A luminance key's threshold belongs just past the GROUND's extreme.** At a fraction of the
  range it cut Voyaze's tagline in half — the near-black words survived and the coral ones did
  not. And retention must be defined at the ramp's midpoint, or every soft key reports a loss
  it did not make.
- **The grid hue detector's chroma floor is 12, not 18.** Rethread is legitimately low-chroma
  (forest 23% saturated, flax 10%) and under the tile's own `grayscale(0.25)` not one of its
  colours cleared 18. This calibrates the instrument; the assertions above it are unchanged.
- **Reduced-motion reset needs `animation-iteration-count: 1 !important`.** Without it,
  `animation-duration: .01ms` loops the marquee ~100k times/sec instead of stopping it.
- **Restore `cursor: auto` under reduced-motion as well as touch**, or those users get no
  cursor at all.
- **`overflow-x: clip`, not `hidden`**, on body — avoids the ancestor-scroll-container class of
  `position: sticky` bug.
- **Cap `devicePixelRatio` at 1.5.** Source frames are 1280px wide; a 2× backing store on a
  1440p display upscales into ~5120px for zero visible gain and 4× the fill rate.
- **`FRAME_COUNT` is imported from `app/data/frames.ts`**, generated by the frame script. Never
  hardcode it in a component.
- One scroll-progress source: the rAF loop writes a `useMotionValue`; every beat `useTransform`s
  off it. Do not also run framer's `useScroll`.
- **Every section below the hero uses `useSectionProgress`** — one shared rAF loop with a Set
  of subscribers, measured in a single pass per frame. Never add a scroll listener, and
  animate transform and opacity only.
- **Use `useReducedMotionFlag`, not framer's `useReducedMotion`.** The latter initialises its
  listener lazily and was observed returning true on one route and false on another in the
  same session, leaving the project page pinned for reduced-motion users.
- **Board 01 is the grid tile**, so it must carry at 320px: ground is a mid or dark palette
  colour (never the lightest) and the wordmark is browser-fitted to >=55% of board width.
  Four of six once sat as small marks on near-white and read as unloaded images.
- **Hero frame composition is a generator concern, not a component one.** A level set on plain
  fBm spreads blots evenly and reads as leopard print even when blot count, size range and
  speck count all measure correctly. `generate_frames.py` carries a long-wavelength density
  field plus explicit suppression of the sparsest lobes; `analyse_frames.py` has the metrics
  that catch it (4x4 coverage spread, largest clean-paper rectangle).
- **Mono labels over the hero canvas are `#F2EEE6`**, with a cyan registration mark beside
  them. Cyan at 0.68rem over a mid-tone canvas is low contrast whatever the scrim does.

## Commands

```
npm run dev              # localhost:3000
npm run build
npm run generate:frames  # python scripts/generate_frames.py
npm run generate:boards  # node scripts/generate-boards.mjs
npm run generate:monograms  # cursor-trail tiles, one per client

python scripts/analyse_frames.py            # hero frame image metrics
node scripts/verify.mjs http://localhost:3100   # 197 browser checks
node scripts/record.mjs http://localhost:3100   # captures/ screen recordings (needs ffmpeg)
```

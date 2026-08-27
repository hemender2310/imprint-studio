# Deploying IMPRINT

The deploy is `next build` and nothing else. Every piece of imagery on this site is generated
on a developer's machine by Python, Puppeteer and ffmpeg, committed to the repository, and
served as a static file. **None of those tools run on Vercel and none of them need to.** If you
take one thing from this document: the generators are a local authoring step, not a build step.

---

## 1. Prerequisites

**To deploy, you need:**

| | |
| --- | --- |
| Node | 18.18 or newer. Built and verified here on 24.14.1; Vercel's default 22.x is fine. |
| npm | Any version that reads a v3 `package-lock.json`. Verified on 11.11.0. |
| A git remote | GitHub, GitLab or Bitbucket. |
| A Vercel account | The Hobby (free) tier is sufficient — see §5 for the numbers. |

**You do NOT need** Python, ffmpeg, a Chromium install, any environment variable, any API key,
any database, or any Vercel project setting other than the defaults.

**To regenerate imagery** — only if you change the frames, the brands or the boards — you also
need Python 3.11+ with Pillow and NumPy, ffmpeg on `PATH` for `record.mjs`, and the local
`BRANDS/` source folder, which is deliberately not in the repository. Run the generators,
commit their output under `public/`, and deploy as normal.

---

## 2. The exact git commands

The project directory is not yet a repository. From `D:\WEB MAKER`:

```bash
git init -b main
```

```bash
git add -A
```

Before the first commit, check what `git add` actually staged. This is the one step worth not
skipping, because the failure it prevents is silent — the site deploys, and every image is a
broken rectangle:

```bash
git ls-files public/ | awk -F/ '{print $2}' | sort | uniq -c
```

Expected exactly:

```
     25 brands
    180 frames
      6 monograms
     42 work
```

303 files are staged in total. If `frames` shows 0, a `.gitignore` rule has matched
`public/frames` — see the note at the top of `.gitignore` about anchoring. Do not work around
it with `git add -f`; fix the rule, because git will not re-include a file that sits inside an
ignored directory.

```bash
git commit -m "IMPRINT: brand and advertising studio portfolio"
```

```bash
git remote add origin git@github.com:<you>/<repo>.git
```

```bash
git push -u origin main
```

The push moves about 10.2 MB. No file is anywhere near GitHub's 50 MB warning or its 100 MB
hard limit — the largest single file in the repository is `public/brands/vaelcron/logo.webp`
at 457 KB. Git LFS is not needed and should not be used: LFS-backed files are not checked out
by Vercel's default clone, which would put you right back at a site with no imagery.

---

## 3. Vercel import

1. **New Project → Import Git Repository**, and pick the repository you just pushed.
2. Vercel detects **Next.js**. Leave every field at its detected value:
   - Framework Preset — Next.js
   - Root Directory — `./`
   - Build Command — `next build` (the default; do not override it)
   - Output Directory — default
   - Install Command — `npm ci` (the default when a lockfile is present)
3. **Environment Variables — add none.** The application reads no `process.env` value anywhere
   outside the generator scripts, and those do not run here.
4. **Deploy.**

There is no `vercel.json` and none is needed.

### One optional setting

`puppeteer` is a devDependency, and Vercel installs devDependencies. Puppeteer's `postinstall`
downloads a Chrome build plus a headless shell into the browser cache. Measured on a cold cache
here: **681 MB**, discarded at the end of the build, since nothing in `next build` launches a
browser.

To skip it, add one **build-time** environment variable in the Vercel project:

```
PUPPETEER_SKIP_DOWNLOAD = true
```

Measured, on a fresh install of this project's dependency set against an empty browser cache:

| install | browser cache after | `npm install` |
| --- | --- | --- |
| default | 681 MB | slow — the download dominates |
| `PUPPETEER_SKIP_DOWNLOAD=true` in the environment | **0 bytes** | **14 s** |

This is an optimization, not a requirement. Set it **in Vercel only**.

**Do not commit an `.npmrc` to do this.** Two reasons, both checked rather than assumed. It does
not work: with puppeteer 24.43.1 and npm 11, neither `PUPPETEER_SKIP_DOWNLOAD=true` nor the
documented lowercase `puppeteer_skip_download=true` in a root `.npmrc` had any effect — both
installs still pulled the full 681 MB. And if it did work it would be the wrong place for it,
because `.npmrc` applies to every fresh local `npm install` as well. A new clone would then have
no browser, and `npm run generate:boards`, `npm run generate:monograms` and `scripts/verify.mjs`
would all fail at launch with:

```
Could not find Chrome (ver. 148.0.7778.97).
```

An environment variable set on the Vercel project affects the deploy and nothing else, which is
exactly the scope this needs. If someone does end up with a skipped download locally, `npx
puppeteer browsers install chrome` repairs it without reinstalling anything.

---

## 4. Expected build time

Measured on a clean copy containing only the files git would track, with no `node_modules` and
no `.next` present:

| Step | Local | Vercel, first deploy | Vercel, later deploys |
| --- | --- | --- | --- |
| `npm ci` | 31 s (warm npm + browser cache) | 2–4 min cold — the 681 MB browser download dominates; ~20 s with `PUPPETEER_SKIP_DOWNLOAD` | same |
| `next build` | 45 s | 60–90 s | 60–90 s |
| **Total** | **~76 s** | **4–6 min**, or **~2 min** with `PUPPETEER_SKIP_DOWNLOAD` | **~2 min** |

The build compiles in about 19 s and then prerenders 11 static pages: `/`, `/_not-found`,
`/icon.svg`, and the six `/work/[slug]` routes via `generateStaticParams`. A successful build
ends with `✓ Generating static pages (11/11)` and a route table in which `/work/[slug]` is
marked **● (SSG)**. If it is marked **ƒ (Dynamic)** instead, something has made the page
request-dependent and the six case studies are being rendered per visit — that is a
regression, not a deployment problem.

Nothing in the build shells out to Python, ffmpeg or a browser. If a deploy log ever mentions
one of them, a generator has been wired into `build` and should be taken back out.

---

## 5. After the first deploy

Work through these in order on the live URL. The first two are the ones that actually fail.

**1. The hero moves.** Load `/` and scroll. The ink sequence should advance continuously
through the hero and keep advancing down the rest of the page. A hero that renders a single
static blot means `public/frames` did not reach the deploy — check §2's file counts.

**2. All six case studies resolve.**

```bash
for s in vyntrix vaelcron rethread voyaze voxaris sentinel; do curl -s -o /dev/null -w "$s %{http_code}\n" https://YOUR-DOMAIN/work/$s; done
```

Six `200`s. A `404` on all six alongside a successful build is the stale-prerender-cache
symptom documented in `CLAUDE.md`; on a fresh Vercel deploy it more likely means the slug set
in `app/data/projects.ts` and the committed boards disagree.

**3. Board imagery loads through the optimizer.** Open `/work/vyntrix` with the network panel
on. `/_next/image?url=%2Fwork%2Fvyntrix-01w.webp&…` should return **200** with a
`content-type` of `image/jpeg` or `image/webp`. About 3.5 MB of boards and brand imagery goes
through Vercel Image Optimization; the 6.6 MB of hero frames and monogram tiles does not,
because both are loaded with a bare `new Image()` rather than `next/image`. That keeps the site
comfortably inside the Hobby tier's transformation allowance.

**4. The cursor trail paints.** Move the pointer across the home page on a non-touch device.
The trail tiles are the six client monograms from `/monograms/`. Blank tiles mean
`public/monograms` is missing.

**5. Nothing in the console.** Zero errors and zero warnings on `/` and on one `/work` route.

**6. Reduced motion.** Turn on the OS "reduce motion" setting and reload `/`. The hero should
hold on a mid-sequence frame rather than animating, the marquee should be stopped rather than
racing, and the cursor should be the system arrow.

**7. 375 px.** Everything stacks into one column, and the custom cursor and trail are gone.

### The full check suite

`scripts/verify.mjs` runs 431 browser assertions against a running instance, and works equally
well against a deployed URL:

```bash
node scripts/verify.mjs https://YOUR-DOMAIN
```

It drives Puppeteer, so run it from your machine rather than from CI.

---

## 6. Redeploying after regenerating imagery

Generators write into `public/`, which is committed, so a regeneration is an ordinary commit.
Two local caches will otherwise serve you the previous run's images and quietly invalidate
every measurement you take afterwards:

```bash
rm -rf .next/cache/images
```

```bash
rm -rf .next
```

Clear the first after `npm run generate:boards`, and the second after any change to the slug
set. Neither affects Vercel, which always builds from a clean checkout.

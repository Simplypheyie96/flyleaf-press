/* Generates every PWA image from the one rosette path — install icons at all
   the sizes Android and iOS ask for, a maskable pair with the mark pulled well
   inside the safe circle, the favicon, and the iOS launch images.
   Run with `npm run icons`. Needs ImageMagick (`magick`) on PATH; it is a
   build-time tool, not a dependency of the app. */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import * as fontkit from 'fontkit'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = join(ROOT, 'public/icons')
const SPLASH = join(ROOT, 'public/splash')

const PAPER = '#F4F2ED'
const INK = '#1B1917'

/* The launch images are lettered by converting the text to outlines here,
   rather than by asking the renderer for a font. Two reasons, both learned the
   hard way: ImageMagick's own SVG renderer needs FreeType fonts registered in
   type.xml and a Homebrew install has none — `magick -list font` returns
   nothing, so every <text> silently produced a wordless image — and the app's
   faces come off Google's CDN, so they are not installed on this machine
   either (Playfair happened to be, IBM Plex Mono was not). Outlines settle
   both: the SVG carries only <path>, exactly like the rosette above it, and it
   renders identically on any host with no font engine in the picture.

   The faces are the real ones, read straight out of the fontsource packages so
   they match what the app itself loads: Playfair Display at 500 and Archivo at
   500, which are the weights #splash b and #splash small use. The two lines
   were IBM Plex Mono and are not any more — the launch image has to resolve
   into the first screen, so when index.html's #splash moves, this moves. */
const req = createRequire(import.meta.url)
const face = (pkg, file) => fontkit.openSync(join(dirname(req.resolve(pkg + '/package.json')), 'files', file))
const SERIF = face('@fontsource/playfair-display', 'playfair-display-latin-500-normal.woff2')
const SANS = face('@fontsource/archivo', 'archivo-latin-500-normal.woff2')

/* One line of text as <path>s, centred on cx and sitting on baseline y.
   `track` is letter-spacing in user units, added between glyphs and — the part
   that is easy to get wrong — NOT after the last one. Include it and the run
   measures a full space wider than it draws, so a centred line sits half a
   space to the left of true centre. */
function line(font, str, size, track, cx, y, ink, opacity = 1) {
  const k = size / font.unitsPerEm
  const glyphs = font.layout(str).glyphs
  const width = glyphs.reduce((n, g) => n + g.advanceWidth * k + track, 0) - track
  let x = cx - width / 2
  const paths = glyphs.map((g) => {
    const d = g.path.toSVG()
    const at = x
    x += g.advanceWidth * k + track
    /* glyph outlines are y-up from the baseline; the negative y scale flips
       them into SVG's y-down space */
    return d ? `<path d="${d}" transform="translate(${at.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" fill="${ink}" fill-opacity="${opacity}"/>` : ''
  })
  return paths.join('\n  ')
}

/* the same rosette the cards and the nav draw — kept in sync by hand, since
   the app imports it as a TS constant and this script runs outside the bundle */
const MARK =
  'M256 57.6 A74.67 59.73 -90 1 1 256 206.93 A74.67 59.73 -90 1 1 256 57.6 Z M444.69 194.69 A74.67 59.73 -18 1 1 302.66 240.85 A74.67 59.73 -18 1 1 444.69 194.69 Z M372.61 416.51 A74.67 59.73 54 1 1 284.84 295.68 A74.67 59.73 54 1 1 372.61 416.51 Z M139.39 416.51 A74.67 59.73 126 1 1 227.16 295.68 A74.67 59.73 126 1 1 139.39 416.51 Z M67.31 194.69 A74.67 59.73 198 1 1 209.34 240.85 A74.67 59.73 198 1 1 67.31 194.69 Z M217.6 256 A38.4 38.4 0 1 1 294.4 256 A38.4 38.4 0 1 1 217.6 256 Z'

/* the path itself spans about 78% of its 512 box, so `frac` below is the share
   of the canvas the drawn mark covers, not the share the box covers */
/* `words` adds the name and the two lines under the mark, for the launch
   images only — icons stay wordless. */
function svg(w, h, frac, ground = PAPER, ink = INK, words = false) {
  const span = Math.min(w, h) * frac
  const k = span / (512 * 0.7575)
  const tx = w / 2 - 256 * k
  /* with words below it, the group sits above centre so the block as a whole
     reads centred rather than the mark alone */
  const ty = h / 2 - 256 * k - (words ? span * 0.42 : 0)
  const base = ty + 512 * k
  const text = words
    ? [
        line(SERIF, 'Flyleaf Press', span * 0.29, 0, w / 2, base + span * 0.34, ink),
        /* #splash draws the mark at 88px, so a CSS size here is that size over
           88: 12px -> .136, and .1em of 12px -> .0136 of tracking. */
        line(SANS, 'LONG BOOK REVIEWS, PRINTED', span * 0.136, span * 0.0136, w / 2, base + span * 0.61, ink, 0.62),
        line(SANS, 'AND EVERY MONTH AS A COLLAGE', span * 0.136, span * 0.0136, w / 2, base + span * 0.775, ink, 0.62),
      ].join('\n  ')
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${ground}"/>
  <g transform="translate(${tx} ${ty}) scale(${k})"><path d="${MARK}" fill="${ink}"/></g>
  ${text}
</svg>`
}

function png(out, w, h, frac, ground, ink, words) {
  const tmp = join(ROOT, '.icon-tmp.svg')
  writeFileSync(tmp, svg(w, h, frac, ground, ink, words))
  execFileSync('magick', ['-background', 'none', tmp, '-strip', out])
  rmSync(tmp)
}

mkdirSync(ICONS, { recursive: true })
mkdirSync(SPLASH, { recursive: true })

/* — install icons — full-bleed; iOS rounds the corners itself */
for (const s of [64, 180, 192, 256, 384, 512]) {
  png(join(ICONS, `icon-${s}.png`), s, s, 0.48)
}
/* — maskable — Android crops to a circle of 80% width, so the mark sits small */
for (const s of [192, 512]) {
  png(join(ICONS, `maskable-${s}.png`), s, s, 0.36)
}
writeFileSync(join(ICONS, 'icon.svg'), svg(512, 512, 0.48))

/* public/icons/og-2.png — the social card — is deliberately NOT generated here.
   It was drawn on a <canvas> in a real browser, at 1200x630, with the same
   composition as the launch screen, and it is the one image whose filename
   matters: link-preview scrapers cache by URL and never re-fetch, so changing
   the artwork means changing the number on the end. Leaving it out of this
   script is the point — `npm run icons` cannot silently replace a card that
   other people's servers have already cached. */

/* — iOS launch images — the device pixel sizes Safari matches on, portrait.
   Landscape falls back to the icon-less ground, which is the right thing:
   a stretched mark reads worse than plain paper. */
const DEVICES = [
  [1290, 2796, 3], [1179, 2556, 3], [1284, 2778, 3], [1170, 2532, 3],
  [1125, 2436, 3], [1242, 2688, 3], [828, 1792, 2], [750, 1334, 2], [1242, 2208, 3],
  [1640, 2360, 2], [1668, 2388, 2], [2048, 2732, 2], [1536, 2048, 2], [1620, 2160, 2],
]
const links = []
for (const [w, h, dpr] of DEVICES) {
  /* the name and the line go here too, so the native launch image and the
     in-page splash that replaces it show the same thing */
  png(join(SPLASH, `launch-${w}x${h}.png`), w, h, 0.2, PAPER, INK, true)
  png(join(SPLASH, `launch-${w}x${h}-dark.png`), w, h, 0.2, '#151515', '#E9E9E9', true)
  const q = `(device-width:${w / dpr}px) and (device-height:${h / dpr}px) and (-webkit-device-pixel-ratio:${dpr}) and (orientation:portrait)`
  links.push(`<link rel="apple-touch-startup-image" media="${q} and (prefers-color-scheme:dark)" href="/splash/launch-${w}x${h}-dark.png" />`)
  links.push(`<link rel="apple-touch-startup-image" media="${q}" href="/splash/launch-${w}x${h}.png" />`)
}
/* the <link> tags belong in index.html; written out here so they are never
   hand-typed and never drift from the files that actually exist */
writeFileSync(join(SPLASH, 'links.html'), links.join('\n') + '\n')

console.log(`Wrote 8 icons, ${DEVICES.length * 2} launch images, and public/splash/links.html.`)

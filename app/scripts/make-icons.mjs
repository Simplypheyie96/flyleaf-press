/* Generates every PWA image from the one rosette path — install icons at all
   the sizes Android and iOS ask for, a maskable pair with the mark pulled well
   inside the safe circle, the favicon, and the iOS launch images.
   Run with `npm run icons`. Needs ImageMagick (`magick`) on PATH; it is a
   build-time tool, not a dependency of the app. */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = join(ROOT, 'public/icons')
const SPLASH = join(ROOT, 'public/splash')

const PAPER = '#F4F2ED'
const INK = '#1B1917'

/* the same rosette the cards and the nav draw — kept in sync by hand, since
   the app imports it as a TS constant and this script runs outside the bundle */
const MARK =
  'M256 57.6 A74.67 59.73 -90 1 1 256 206.93 A74.67 59.73 -90 1 1 256 57.6 Z M444.69 194.69 A74.67 59.73 -18 1 1 302.66 240.85 A74.67 59.73 -18 1 1 444.69 194.69 Z M372.61 416.51 A74.67 59.73 54 1 1 284.84 295.68 A74.67 59.73 54 1 1 372.61 416.51 Z M139.39 416.51 A74.67 59.73 126 1 1 227.16 295.68 A74.67 59.73 126 1 1 139.39 416.51 Z M67.31 194.69 A74.67 59.73 198 1 1 209.34 240.85 A74.67 59.73 198 1 1 67.31 194.69 Z M217.6 256 A38.4 38.4 0 1 1 294.4 256 A38.4 38.4 0 1 1 217.6 256 Z'

/* the path itself spans about 78% of its 512 box, so `frac` below is the share
   of the canvas the drawn mark covers, not the share the box covers */
/* `words` adds the name and the one-line description under the mark, for the
   launch images only — icons stay wordless. Each family ends in a generic name,
   since this renders on whatever host runs the script and the app's own faces
   may not be installed there. */
function svg(w, h, frac, ground = PAPER, ink = INK, words = false) {
  const span = Math.min(w, h) * frac
  const k = span / (512 * 0.7575)
  const tx = w / 2 - 256 * k
  /* with words below it, the group sits above centre so the block as a whole
     reads centred rather than the mark alone */
  const ty = h / 2 - 256 * k - (words ? span * 0.42 : 0)
  const text = words
    ? `<text x="${w / 2}" y="${ty + 512 * k + span * 0.34}" fill="${ink}" text-anchor="middle"
      font-family="Playfair Display, Georgia, serif" font-size="${span * 0.29}" font-weight="500">Flyleaf Press</text>
  <text x="${w / 2}" y="${ty + 512 * k + span * 0.61}" fill="${ink}" fill-opacity="0.62" text-anchor="middle"
      font-family="IBM Plex Mono, monospace" font-size="${span * 0.115}" letter-spacing="${span * 0.017}">LONG BOOK REVIEWS, PRINTED</text>
  <text x="${w / 2}" y="${ty + 512 * k + span * 0.775}" fill="${ink}" fill-opacity="0.62" text-anchor="middle"
      font-family="IBM Plex Mono, monospace" font-size="${span * 0.115}" letter-spacing="${span * 0.017}">AND EVERY MONTH AS A COLLAGE</text>`
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

/* ImageMagick's own SVG renderer needs FreeType fonts configured, and on a bare
   Homebrew install there are none — it fails outright rather than substituting.
   Probe once: with fonts we set the name and the line into the launch images;
   without, they stay wordless and the in-page splash carries the words on its
   own a moment later. Never a hard failure over a lettering nicety. */
const WORDS = (() => {
  const tmp = join(ROOT, '.font-probe.svg')
  const out = join(ROOT, '.font-probe.png')
  try {
    writeFileSync(tmp, svg(64, 64, 0.3, PAPER, INK, true))
    execFileSync('magick', ['-background', 'none', tmp, '-strip', out], { stdio: 'ignore' })
    return true
  } catch {
    return false
  } finally {
    rmSync(tmp, { force: true })
    rmSync(out, { force: true })
  }
})()
if (!WORDS) console.warn('No usable font for ImageMagick — launch images are the mark alone.')

/* — install icons — full-bleed; iOS rounds the corners itself */
for (const s of [64, 180, 192, 256, 384, 512]) {
  png(join(ICONS, `icon-${s}.png`), s, s, 0.48)
}
/* — maskable — Android crops to a circle of 80% width, so the mark sits small */
for (const s of [192, 512]) {
  png(join(ICONS, `maskable-${s}.png`), s, s, 0.36)
}
writeFileSync(join(ICONS, 'icon.svg'), svg(512, 512, 0.48))

/* public/icons/og.png — the social card — is deliberately NOT generated here.
   It carries the name in Playfair and the line in Plex Mono, and this script
   cannot draw either: ImageMagick has no usable font on a bare install (see
   the WORDS probe above), and a launch image can survive that because the
   in-page splash supplies the words a moment later. A link preview gets one
   frame and no second chance, so a wordless social card is not an acceptable
   fallback — it would just be a flower on paper.
   It was drawn instead on a <canvas> in a real browser, where the web fonts
   the app already loads are available, at 1200x630 with the same composition
   as the launch screen. Regenerating it means doing that again; leaving it out
   of this script is the point, so that `npm run icons` cannot overwrite a card
   that has words with one that does not. */

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
  png(join(SPLASH, `launch-${w}x${h}.png`), w, h, 0.2, PAPER, INK, WORDS)
  png(join(SPLASH, `launch-${w}x${h}-dark.png`), w, h, 0.2, '#151515', '#E9E9E9', WORDS)
  const q = `(device-width:${w / dpr}px) and (device-height:${h / dpr}px) and (-webkit-device-pixel-ratio:${dpr}) and (orientation:portrait)`
  links.push(`<link rel="apple-touch-startup-image" media="${q} and (prefers-color-scheme:dark)" href="/splash/launch-${w}x${h}-dark.png" />`)
  links.push(`<link rel="apple-touch-startup-image" media="${q}" href="/splash/launch-${w}x${h}.png" />`)
}
/* the <link> tags belong in index.html; written out here so they are never
   hand-typed and never drift from the files that actually exist */
writeFileSync(join(SPLASH, 'links.html'), links.join('\n') + '\n')

console.log(`Wrote 8 icons, ${DEVICES.length * 2} launch images, and public/splash/links.html.`)

/* Every face the app uses, self-hosted — and the same bytes handed to the
   rasterizer.

   They used to come from Google's CDN, and that is what broke sharing. A
   <link> stylesheet is fetched without CORS, so the copy Workbox put in the
   cache was opaque; html-to-image, which inlines every @font-face it can find
   before it draws, then read an empty stylesheet, found no Kalam, and rendered
   the review in whatever the fallback was. It looked like a font bug and was
   really a cross-origin one — which is exactly why it came right on a second
   attempt often enough to be maddening.

   Serving the files ourselves settles it three times over: the app is
   genuinely offline (the woff2 files are precached like everything else), the
   export reads its own origin, and there is one list of faces rather than a
   URL in index.html that has to be kept in step with the CSS.

   Latin subsets only. @fontsource's index CSS pulls in latin-ext and the rest,
   and every one of those would be another file to embed in every PNG. */

import kalam400 from '@fontsource/kalam/files/kalam-latin-400-normal.woff2?url'
import kalam700 from '@fontsource/kalam/files/kalam-latin-700-normal.woff2?url'
import mono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url'
import mono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url'
import serif400 from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2?url'
import serif400i from '@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff2?url'
import serif500 from '@fontsource/playfair-display/files/playfair-display-latin-500-normal.woff2?url'
import serif600 from '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff2?url'
import caveat400 from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url'
import patrick400 from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?url'
import architect400 from '@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2?url'
import indie400 from '@fontsource/indie-flower/files/indie-flower-latin-400-normal.woff2?url'
import sans400 from '@fontsource/archivo/files/archivo-latin-400-normal.woff2?url'
import sans500 from '@fontsource/archivo/files/archivo-latin-500-normal.woff2?url'
import sans600 from '@fontsource/archivo/files/archivo-latin-600-normal.woff2?url'

import type { HandId } from './types'

type Face = { family: string; weight: number; style: 'normal' | 'italic'; url: string }

/* Every face a CARD asks for. Nothing here is optional: a weight missing from
   this list is a weight the browser synthesises on screen and the export draws
   differently — and this is also, exactly, the list handed to the rasterizer. */
const CARD_FACES: Face[] = [
  { family: 'Kalam', weight: 400, style: 'normal', url: kalam400 },
  { family: 'Kalam', weight: 700, style: 'normal', url: kalam700 },
  { family: 'IBM Plex Mono', weight: 400, style: 'normal', url: mono400 },
  { family: 'IBM Plex Mono', weight: 500, style: 'normal', url: mono500 },
  { family: 'Playfair Display', weight: 400, style: 'normal', url: serif400 },
  { family: 'Playfair Display', weight: 400, style: 'italic', url: serif400i },
  { family: 'Playfair Display', weight: 500, style: 'normal', url: serif500 },
  { family: 'Playfair Display', weight: 600, style: 'normal', url: serif600 },
]

/* The chrome face, and the reason it is a separate list. The app around the
   cards is set in Archivo; a card never is. Chrome is also never rasterized —
   only cards go through html-to-image — so embedding these in every PNG would
   add three woff2 files of base64 to an image that cannot use them. They are
   installed like any other face and precached like any other asset; they just
   do not travel inside a share. */
const CHROME_FACES: Face[] = [
  { family: 'Archivo', weight: 400, style: 'normal', url: sans400 },
  { family: 'Archivo', weight: 500, style: 'normal', url: sans500 },
  { family: 'Archivo', weight: 600, style: 'normal', url: sans600 },
]

/* THE HANDS A REVIEW BODY CAN BE SET IN.

   Handwriting faces disagree wildly about how much of the em the letters
   actually use, and what the eye reads as "size" is the x-height, not the
   font-size. Measured in the browser at 100px (the `1ex` trick — fontkit's
   sxHeight and a canvas probe both lied here, the canvas one by silently
   falling back on every face): Kalam .511, Architects Daughter .469, Patrick
   Hand .468, Indie Flower .389, Caveat .357. Set all five at 17px and Caveat
   looks like a mistake — a third smaller than the face beside it.

   So each hand carries its OWN size and line-height, derived rather than
   guessed. The size matches Kalam's x-height at 17px (8.69px). The
   line-height is Kalam's absolute leading (29.24px) over that size, with the
   face's own default line box as a FLOOR — Caveat and Indie Flower have long
   ascenders and deep descenders, and an even-leading figure alone would set
   them tighter than the face itself asks for, which is where lines start
   touching. Measured on a real 415-character paragraph in a 600px column:
   Kalam 6 lines / 175px, Patrick Hand 5 / 146, Architects Daughter 7 / 205,
   Caveat 7 / 215, Indie Flower 7 / 228. Nothing runs the card away.

   Kalam is the default, and its faces stay in CARD_FACES rather than moving
   here: the 700 cut is the pinboard collage's rating numeral, which has
   nothing to do with a review body and must ship whatever hand is chosen. The
   other four are installed for the screen but reach a PNG only when the review
   being exported is actually written in one — see fontEmbedCss. */
type Hand = { family: string; size: number; lh: number; faces: Face[] }

export const HANDS: Record<HandId, Hand> = {
  kalam: { family: 'Kalam', size: 17, lh: 1.72, faces: [] },
  caveat: {
    family: 'Caveat', size: 24.5, lh: 1.26,
    faces: [{ family: 'Caveat', weight: 400, style: 'normal', url: caveat400 }],
  },
  patrick: {
    family: 'Patrick Hand', size: 18.5, lh: 1.58,
    faces: [{ family: 'Patrick Hand', weight: 400, style: 'normal', url: patrick400 }],
  },
  architect: {
    family: 'Architects Daughter', size: 18.5, lh: 1.58,
    faces: [{ family: 'Architects Daughter', weight: 400, style: 'normal', url: architect400 }],
  },
  indie: {
    family: 'Indie Flower', size: 22.5, lh: 1.46,
    faces: [{ family: 'Indie Flower', weight: 400, style: 'normal', url: indie400 }],
  },
}

const HAND_FACES: Face[] = Object.values(HANDS).flatMap((h) => h.faces)

/** The custom properties that put a card's writing in one hand. Stamped on the
    card root rather than on the body, so a plate caption is in the same hand
    the review is — two handwritings on one card would read as two people.

    The family is quoted with an APOSTROPHE, not a double quote: this string goes
    inside a `style="…"` attribute in a card's template literal, and a double
    quote there closes the attribute — which silently truncated the declaration
    to `--hand-fam:` and dropped the card's body back to the chrome face. */
export function handVars(hand?: HandId): string {
  const h = HANDS[hand ?? 'kalam'] ?? HANDS.kalam
  return `--hand-fam:'${h.family}',cursive;--hand-size:${h.size}px;--hand-lh:${h.lh}`
}

/** The same three, for a React `style` — the editor's own writing canvas takes
    them, so a review is written in the hand it will be printed in. */
export function handProps(hand?: HandId): Record<string, string> {
  const h = HANDS[hand ?? 'kalam'] ?? HANDS.kalam
  return {
    '--hand-fam': `"${h.family}",cursive`,
    '--hand-size': `${h.size}px`,
    '--hand-lh': String(h.lh),
  }
}

const FACES: Face[] = [...CARD_FACES, ...HAND_FACES, ...CHROME_FACES]

const rule = (f: Face, src: string) =>
  `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};` +
  `font-display:swap;src:url(${src}) format("woff2")}`

/** Install the @font-face rules. Called before React renders. */
export function installFonts(): void {
  const el = document.createElement('style')
  el.textContent = FACES.map((f) => rule(f, f.url)).join('\n')
  document.head.appendChild(el)
}

/* The same faces as data URIs, for html-to-image. Handing it this means it
   never goes looking through document.styleSheets itself — which is where the
   opaque-response problem lived, and is also the slow part of an export.

   It is keyed by the HANDS the pages being exported actually use, not built
   once for everything: the shared card faces are always in, and a review's own
   hand joins them only if it is not Kalam. Caveat is 48KB, which is 64KB of
   base64 inside every PNG — five hands embedded unconditionally would put four
   fonts nobody can see into every image the app ever hands out. Cached per key
   rather than globally, because a share of a three-page review would otherwise
   pay for the fetches three times over. */
const embedded = new Map<string, Promise<string>>()

async function embedFace(f: Face): Promise<string> {
  try {
    const res = await fetch(f.url)
    if (!res.ok) return ''
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    return rule(f, `data:font/woff2;base64,${btoa(bin)}`)
  } catch {
    /* one face that won't load is a face the export falls back on — far
       better than an exception that loses the whole image */
    return ''
  }
}

/** @param hands the hands the pages use. Read off the DOM, so anything that is
    not a real id (or is Kalam, whose faces are already shared) simply drops. */
export function fontEmbedCss(hands: Iterable<string> = []): Promise<string> {
  const extra = [...new Set(hands)]
    .filter((h): h is HandId => h in HANDS && HANDS[h as HandId].faces.length > 0)
    .sort()
  const key = extra.join(',')
  const hit = embedded.get(key)
  if (hit) return hit
  const faces = [...CARD_FACES, ...extra.flatMap((h) => HANDS[h].faces)]
  const built = Promise.all(faces.map(embedFace))
    .then((rules) => rules.join('\n'))
    /* never cache a failure: the next share should try again */
    .catch(() => { embedded.delete(key); return '' })
  embedded.set(key, built)
  return built
}

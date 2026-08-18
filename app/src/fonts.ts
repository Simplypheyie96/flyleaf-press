/* The three faces, self-hosted — and the same bytes handed to the rasterizer.

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

type Face = { family: string; weight: number; style: 'normal' | 'italic'; url: string }

/* Every face the app or a card actually asks for. Nothing here is optional:
   a weight missing from this list is a weight the browser synthesises on
   screen and the export draws differently. */
const FACES: Face[] = [
  { family: 'Kalam', weight: 400, style: 'normal', url: kalam400 },
  { family: 'Kalam', weight: 700, style: 'normal', url: kalam700 },
  { family: 'IBM Plex Mono', weight: 400, style: 'normal', url: mono400 },
  { family: 'IBM Plex Mono', weight: 500, style: 'normal', url: mono500 },
  { family: 'Playfair Display', weight: 400, style: 'normal', url: serif400 },
  { family: 'Playfair Display', weight: 400, style: 'italic', url: serif400i },
  { family: 'Playfair Display', weight: 500, style: 'normal', url: serif500 },
  { family: 'Playfair Display', weight: 600, style: 'normal', url: serif600 },
]

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
   Built once and reused: eight files is eight round trips, and a share of a
   three-page review would otherwise pay for them three times over. */
let embedded: Promise<string> | null = null

export function fontEmbedCss(): Promise<string> {
  if (!embedded)
    embedded = Promise.all(
      FACES.map(async (f) => {
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
      })
    )
      .then((rules) => rules.join('\n'))
      /* never cache a failure: the next share should try again */
      .catch(() => { embedded = null; return '' })
  return embedded
}

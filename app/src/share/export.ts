/* Share = images, always. A review renders onto paper pages, splitting at a
   paragraph boundary; each page becomes one PNG.
   The pages build inside a hidden host in THIS document, at the COLUMN width
   the chosen option composes on: Large lays the review on a 988px card
   (1020px leaf → 2040px file), Small on the standard 688px card (720px leaf →
   1440px file). Both export at exactly 2×, so text renders the same size in
   both files — the large one is wider and correspondingly shorter, never a
   scaled copy of the small one. The compact class is on-screen sizing and
   never enters an export. */

import type { Review, StyleId, CollageId, ExportShape } from '../types'
import { SHAPE_FILE_W, SHAPE_W } from '../types'
import { renderReviewCard } from '../cards/review'
import { renderCollage, renderStory, type MonthData } from '../cards/collage'
import { paragraphs } from '../format'
import { fontEmbedCss } from '../fonts'
import { isIOS } from '../pwa'
import { encodePng, CAN_STREAM_PNG } from './png'

/* Neither layout splits. The wide one stopped first, on the argument that a
   leaf which can grow is the whole point of a printed card and a page break
   only buys a second file to send. The phone shape kept a ceiling on the
   theory that a 350px column runs to a picture nobody can read — but a review
   arriving as three or four separate images is worse than a tall one: a phone
   scrolls, and a set of files has to be sent in order and looked at in order
   to make sense. So one review is one image, at either shape.

   Infinity rather than a very large number: every test below is
   `> PAGE_LIMIT`, so this is exactly "never", with no height at which it
   quietly starts breaking again. The splitter itself is left standing — it is
   unreachable at this constant and reachable again the moment a real limit is
   put back, which is a cheaper way to hold the option than deleting it. */
const PAGE_LIMIT = Infinity

export function makeHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.className = 'card-wrap share-host'
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;'
  document.body.appendChild(host)
  return host
}

/* The host composes at the chosen option's column width — that width IS the
   choice. The one thing it never does is apply .card-compact: the compact
   phone layout (plates stacked in a narrow column) once served as "Small
   card" and made the options different-looking objects rather than the same
   card on two widths of paper. */
function prepHost(host: HTMLDivElement, shape: ExportShape): void {
  host.style.width = `${SHAPE_W[shape]}px`
  host.classList.remove('card-compact')
}

/* Put a leaf on the tight ground at its option's column width, and stamp it
   with the FILE width that option chose. The stamp is what the scale is
   derived from later (file ÷ leaf), so the choice travels with the page itself
   and the rasterizer never has to guess which option built it. This has to
   happen the moment a page exists, BEFORE anything on it is measured. */
function ground(pages: HTMLElement[], shape: ExportShape): HTMLElement[] {
  for (const p of pages) {
    p.style.width = `${SHAPE_W[shape]}px`
    p.dataset.fileW = String(SHAPE_FILE_W[shape])
    p.classList.add('share-page--tight')
  }
  return pages
}

/* Build the paper pages for a review; returns the page elements (still in the
   hidden host — caller exports then disposes, or adopts them for a preview).
   The review runs onto as many leaves as it needs. Two was the old ceiling, and
   it held only by luck on the wide layout: everything that didn't fit page one
   was dumped on page two with nothing checking whether it fit there. The narrow
   phone layout made that visible — a 756px leaf followed by a 1499px "page". */
export function paginateReview(
  rec: Review,
  style: StyleId,
  host: HTMLDivElement,
  shape: ExportShape
): HTMLElement[] {
  prepHost(host, shape)
  host.innerHTML = `<div class="share-page"><div>${renderReviewCard(rec, style)}</div>
    <div class="share-page-no"></div></div>`
  const page1 = host.querySelector('.share-page') as HTMLElement
  ground([page1], shape)
  const card1 = page1.querySelector('.card') as HTMLElement
  /* an unwritten review has no .body element at all — nothing to split, and
     a card that short can never outgrow one page */
  const body1 = card1.querySelector('.body') as HTMLElement | null

  if (!body1) return ground([page1], shape)

  const grounds = card1.className.split(' ').filter((c) => c.startsWith('card--')).join(' ')
  const title = card1.querySelector('.title')?.textContent || ''
  /* Both of these close the review, so they belong on whichever leaf turns out
     to be the last — held aside now, appended once the count is known. The
     plates travel whole rather than being orphaned under a lone paragraph. */
  const colo = card1.querySelector('.colo')
  const plates = card1.querySelector('.plate-row')
  colo?.remove()
  plates?.remove()

  /* The two tail pieces are not the same kind of thing, and treating them alike
     is what made the page count wrong in both directions. The PLATES are
     content — a row of photographs, tall enough to need a leaf of their own, so
     they are allowed to open one. The COLOPHON is a mark: letting it open a leaf
     produced a second image holding a page number and nothing else. So plates
     go on before the last fit test and the colophon goes on after it, where the
     only thing it can do is make the final leaf a little taller — which costs
     nothing, since every page is saved tight. */
  const finish = (): HTMLElement[] => {
    if (colo) lastCard.appendChild(colo)
    const all = [...host.querySelectorAll('.share-page')] as HTMLElement[]
    if (all.length > 1)
      all.forEach((p, i) => {
        ;(p.querySelector('.share-page-no') as HTMLElement).textContent =
          `Flyleaf Press · Nº ${rec.no} · ${i + 1}`
      })
    return ground(all, shape)
  }
  let lastCard = card1
  if (!plates && card1.offsetHeight <= PAGE_LIMIT) return finish()

  const addPage = (): { card: HTMLElement; body: HTMLElement } => {
    const page = document.createElement('div')
    page.className = 'share-page'
    page.innerHTML = `<div>
        <article class="card ${grounds}" style="--rot:0deg">
          <div class="lbl" style="margin-bottom:18px">${title} · continued</div>
          <div class="body"></div>
        </article>
      </div>
      <div class="share-page-no"></div>`
    host.appendChild(page)
    ground([page], shape)
    return {
      card: page.querySelector('.card') as HTMLElement,
      body: page.querySelector('.body') as HTMLElement,
    }
  }

  /* Overflow cascades forward: fill a leaf, push what's left onto the next, then
     ask the same question of that one. A paragraph too tall for a whole leaf on
     its own can't be split further, so it stays and the loop moves on — the
     `>1 child` test is what stops that becoming an empty-page spiral. */
  let body = body1
  let guard = 24
  const spill = () => {
    while (lastCard.offsetHeight > PAGE_LIMIT && body.children.length > 1 && guard-- > 0) {
      /* the plates come off before the leaf is measured — leaving them on would
         report it as full and strip every paragraph from underneath them */
      plates?.remove()
      const next = addPage()
      while (lastCard.offsetHeight > PAGE_LIMIT && body.children.length > 1) {
        next.body.insertBefore(body.lastElementChild as Element, next.body.firstChild)
      }
      lastCard = next.card
      body = next.body
      if (plates) lastCard.appendChild(plates)
    }
  }
  spill()
  /* the plates land on whichever leaf is last, and are then themselves subject
     to the same question — a full-width photo row can push the prose it was
     sharing a leaf with onto one more */
  if (plates) {
    lastCard.appendChild(plates)
    spill()
  }
  return finish()
}

/* Collage: one free-height page (a short month still fills one paper leaf) */
export function buildCollagePage(
  m: MonthData,
  style: CollageId,
  host: HTMLDivElement,
  shape: ExportShape
): HTMLElement[] {
  prepHost(host, shape)
  /* The broad column holds MORE cells, not bigger ones — the column chooser
     needs to know which card it is composing for, and this is the only place
     that knows. Callers pass a MonthData describing the reading; the shape is
     a property of the export, so it is stamped on here rather than threaded
     through every page that builds one. */
  const laid: MonthData = { ...m, wide: shape === 'wide' }
  host.innerHTML = `<div class="share-page share-page--free"><div>${renderCollage(laid, style)}</div></div>`
  return ground([host.querySelector('.share-page') as HTMLElement], shape)
}

/* Story: one book, on a leaf of a FIXED height. Every other page here grows
   to whatever it is holding; this one cannot, because the shape is the point —
   a 688px card 1248px tall on the 720px leaf is 1440 × 2560, which is 9:16 to
   the pixel. So it is always the phone column — the broad one would be a
   different aspect and no longer a story — and the card's own fixed height is
   what the tight leaf then measures. */
export function buildStoryPage(
  m: MonthData,
  style: CollageId,
  host: HTMLDivElement
): HTMLElement[] {
  prepHost(host, 'phone')
  host.innerHTML = `<div class="share-page share-page--free"><div>${renderStory(m, style)}</div></div>`
  const pages = ground([host.querySelector('.share-page') as HTMLElement], 'phone')
  fitStoryCover(pages[0])
  return pages
}

/* Give the picture every pixel the type does not want.

   The card is 1248px tall and the head, the book block and the foot are all
   `flex:none`, so the hero is the remainder — and that remainder does NOT
   depend on how tall the cover is (measured: identical at a 640px cover and at
   a 2000px one). That is the whole reason this can be one pass rather than a
   loop: read the space, subtract the style's own chrome, state the height.

   It is done here rather than in CSS because CSS cannot do it. A percentage
   `max-height` on the cover resolves against an auto-height frame and is
   simply inert; making the frame a flex column so the cap could reach the
   cover by shrinking it clamps the height and then gets the WIDTH wrong,
   because a `width:fit-content` frame takes its width from the cover's
   unshrunk contribution — the cabinet's plate measured 608px around a 434px
   cover, and the board's nested plate lost the aspect transfer altogether.
   Both were measured before this was written.

   Every export and every preview goes through `buildStoryPage`, so there is no
   path on which the card is built and this is not run; `--st-cov` in the
   stylesheet is the value a card would take if one ever were. */
function fitStoryCover(page: HTMLElement): void {
  const hero = page.querySelector('.st-hero') as HTMLElement | null
  const frame = page.querySelector('.st-frame') as HTMLElement | null
  const cov = page.querySelector('.st-cov') as HTMLElement | null
  const card = page.querySelector('.card') as HTMLElement | null
  if (!hero || !frame || !cov || !card) return

  const pad = getComputedStyle(hero)
  const avail =
    hero.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom)

  /* Everything between the cover's own box and the hero's inner edge: the
     plate's padding, the frame number above it, the perforated foot — and the
     bounding boxes of the two things that are rotated, since a tilted plate
     stands taller than it lays out and would lean into the title. */
  const lean = (el: HTMLElement): number =>
    Math.max(0, el.getBoundingClientRect().height - el.offsetHeight)
  const chrome = frame.offsetHeight - cov.offsetHeight + lean(frame) + lean(cov)

  /* The other ceiling is the column. `.cov` states `aspect-ratio:2/3`, so the
     cover's width is two thirds of whatever height is set here — on a short
     card the hero is roomy enough that the 632px of content would run out
     first, and a compartment 584px wide inside its own border is narrower
     still. So the widest the cover may be is the hero's inner width less every
     padding and border between the two, and the tallest it may be is that
     times three halves. */
  let room = hero.clientWidth
  for (let el = cov.parentElement; el && el !== hero; el = el.parentElement) {
    const cs = getComputedStyle(el)
    room -=
      parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) +
      parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
  }

  const h = Math.floor(Math.min(avail - chrome, room * 1.5))
  if (h > 0) card.style.setProperty('--st-cov', `${h}px`)
}

/* `var()` inside an SVG presentation attribute has to be resolved to a literal
   before anything is rasterized. html-to-image deep-clones an <svg> subtree
   wholesale and copies computed styles onto the <svg> ELEMENT alone — its
   children keep only their presentation attributes, and the card stylesheet is
   not in the cloned document at all. So `fill="var(--star)"` arrives with
   nothing to resolve against: an invalid fill falls back to black and an
   invalid stroke to none. That is exactly the rating that came out black on the
   coal catalogue card, and the empty stars that disappeared from every share
   while looking right on screen. */
const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g
function resolveSvgVars(root: HTMLElement): void {
  for (const el of root.querySelectorAll<SVGElement>('svg [fill], svg [stroke]')) {
    let cs: CSSStyleDeclaration | undefined
    for (const attr of ['fill', 'stroke'] as const) {
      const v = el.getAttribute(attr)
      if (!v || !v.includes('var(')) continue
      cs = cs || getComputedStyle(el)
      el.setAttribute(
        attr,
        v.replace(VAR_RE, (_m, name: string, fallback?: string) =>
          cs!.getPropertyValue(name).trim() || (fallback || '').trim() || 'currentColor'
        )
      )
    }
  }
}

/* Every picture decoded before anything is rasterized. The rasterizer paints
   the DOM by loading it as one big SVG, and a picture the browser has not
   decoded is simply not in that paint — which is why a cover or a plate would
   show in the preview, be missing from the file, and come back if you went and
   did it again: the second attempt found it already decoded.

   The obvious way to wait for that is `img.decode()`, and it is a trap. That
   promise settles when the image has been decoded FOR PRESENTATION, so it
   waits on the element being painted — and the export host is deliberately
   never painted. Measured on this app's own cover: `load` fired in 1ms and
   `decode()` on the same element took 530 SECONDS, against 12ms for an
   identical image sitting visibly in the page. That is the report of a share
   that "hangs" and of one that comes back blank, and it is the same fact
   twice: nothing had decoded when the leaf was serialized.

   `createImageBitmap` decodes on its own account and has no opinion about
   whether anyone can see the element, so it answers in tens of milliseconds
   for the same picture. The bitmap is closed immediately — the point is the
   side effect, that the image is now in the decoded cache the rasterizer will
   draw from.

   The whole wait is capped at 10s. Failures are swallowed on purpose: a cover
   that will not decode is not a reason to refuse to export the review, and the
   leaf is read back afterwards anyway. */
async function settleImages(pages: HTMLElement[]): Promise<void> {
  const imgs = pages.flatMap((p) => [...p.querySelectorAll('img')])
  await Promise.all(
    imgs.map(async (img) => {
      try {
        img.fetchPriority = 'high'
        img.loading = 'eager'
        await Promise.race([
          (async () => {
            if (!img.complete)
              await new Promise<void>((r) => {
                img.addEventListener('load', () => r(), { once: true })
                img.addEventListener('error', () => r(), { once: true })
              })
            if (img.naturalWidth) (await createImageBitmap(img)).close()
          })(),
          new Promise<void>((r) => setTimeout(r, 10_000)),
        ])
      } catch {
        /* undecodable — let it render as whatever it renders as */
      }
    })
  )
}

/* Is every pixel in this region the same colour? Used on both ends of the
   trip — on the way in to note which pictures carry ink, and on the way out to
   catch one that arrived as an empty rectangle. The tolerance is for JPEG:
   flat paper does not survive a quantizer perfectly flat. It returns on the
   first pixel that differs, so a healthy photograph costs a handful of reads
   and only a genuinely blank region is scanned to the end. */
function isFlat(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean {
  if (w < 4 || h < 4) return true
  let d: Uint8ClampedArray
  try {
    d = g.getImageData(x, y, Math.round(w), Math.round(h)).data
  } catch {
    /* tainted, so unreadable. "Cannot verify" must mean "carry on", never a
       thrown export — a check that can refuse to hand over the file is worse
       than the fault it was added to catch. */
    return false
  }
  const r = d[0], gr = d[1], b = d[2]
  for (let i = 4; i < d.length; i += 4) {
    if (Math.abs(d[i] - r) > 8 || Math.abs(d[i + 1] - gr) > 8 || Math.abs(d[i + 2] - b) > 8) return false
  }
  return true
}

/* And then re-drawn, at the size the file will actually use them.

   settleImages above proves the browser HAS the picture; it does not make the
   picture survive the trip. The rasterizer paints by serializing the DOM into
   one <svg> and loading THAT as an image, so every <img> inside it travels as
   whatever string is in its src — a stored cover is a dataURL of the original
   catalogue art, which can be 2000px wide and a megabyte of base64 for a box
   that renders 104px across. Several of those on one leaf build a data: URL
   big enough to hit the length ceiling an <img> src has, and a src over the
   ceiling does not error: the image is simply blank. That is the bug where a
   cover shows in the preview, vanishes from the file, and comes back if you
   go and do it again — a second attempt differs only in what else happened to
   be in flight, which is exactly the shape of a limit you are sitting on the
   edge of.

   Baking removes the edge rather than moving it. Each picture is drawn to a
   canvas at its laid-out box times the export scale and handed back as JPEG,
   so the string in the src is the size of the thing on the card instead of
   the size of the thing the catalogue had — typically 30-60x smaller. It also
   makes the decode a fact rather than a hope: drawImage cannot succeed on a
   picture the browser has not got.

   A draw that throws is left exactly as it was. That is the cross-origin case
   (a tainted canvas cannot be read back), and there the old path is no worse
   than it ever was. */
async function bakeImages(pages: HTMLElement[]): Promise<void> {
  for (const page of pages) {
  const scale = scaleOf(page)
  for (const img of page.querySelectorAll('img')) {
    try {
      if (!img.naturalWidth || !img.naturalHeight) continue
      const box = img.getBoundingClientRect()
      const w = Math.max(1, Math.round(box.width * scale))
      const h = Math.max(1, Math.round(box.height * scale))
      /* never upscale: a 60px thumbnail asked to fill 300px gains nothing but
         bytes, so the natural size is the ceiling */
      const k = Math.min(1, img.naturalWidth / w, img.naturalHeight / h)
      const cw = Math.max(1, Math.round(w * k))
      const ch = Math.max(1, Math.round(h * k))
      const c = document.createElement('canvas')
      c.width = cw
      c.height = ch
      const g = c.getContext('2d')!
      /* the grounds are all light, so a photo with alpha lands on paper
         rather than on the black a JPEG would otherwise give it */
      g.fillStyle = PAPER
      g.fillRect(0, 0, cw, ch)
      g.drawImage(img, 0, 0, cw, ch)
      /* Remember whether this picture has anything in it. It is the only
         honest way to check the rasterized leaf afterwards: a cover that came
         out blank and a cover that is genuinely a flat grey rectangle look
         identical in the output and can only be told apart by what went in. */
      img.dataset.ink = isFlat(g, 0, 0, cw, ch) ? '0' : '1'
      const baked = c.toDataURL('image/jpeg', 0.92)
      if (baked.length > 32 && baked.length < img.src.length) img.src = baked
    } catch {
      /* tainted or undrawable — leave the original src alone */
    }
  }
  }
  /* the swapped sources are new images; give them the same guarantee */
  await settleImages(pages)
}

/* The two ceilings a canvas has, both enforced by quietly handing back
   something other than what was asked for. The area one is about 16.7 million
   pixels (WebKit's; Chrome's is far higher, but the file has to survive being
   made on a phone) and the side one is 16384 — measured, not assumed: a
   684 × 24530 export came back from Chrome as 456 × 16384, scaled down
   without complaint and without an error.

   These bound the *canvas*, not the PNG, which addresses 2^31 a side. So a
   leaf too tall for one canvas is drawn in horizontal bands and written
   through `encodePng`, which streams scanlines and never holds the picture.
   Length stops costing sharpness: every export comes out at its shape's full
   file width, whatever the review's length. See src/share/png.ts. */
/* the ground a saved image is painted on, matching --paper */
const PAPER = '#F4F2ED'
const MAX_CANVAS_PX = 16_777_216
const MAX_CANVAS_SIDE = 16_384
/* How much of one band is resident as pixels at a time. Well under the area
   ceiling on purpose: at 900px wide this is a 27MB ImageData, and a phone
   that has to hold two of them mid-swap is the machine this has to work on.
   Smaller bands would be gentler still and cost a full re-rasterization each,
   since every band re-renders the leaf clipped to its own slice. */
const BAND_PX = 6_000_000

function fitsOneCanvas(w: number, h: number, k: number): boolean {
  const dw = Math.round(w * k)
  const dh = Math.round(h * k)
  return dw <= MAX_CANVAS_SIDE && dh <= MAX_CANVAS_SIDE && dw * dh <= MAX_CANVAS_PX
}

/* The export scale is the ratio that makes THIS leaf the file width its
   option asked for — read off the stamp `ground()` left on the page, divided
   by the leaf's own laid-out width. Deriving it this way is what makes the
   file width EXACT: round(w × FILE_W/w) cannot land anywhere but FILE_W.
   A page with no stamp (the print path builds its own) is a wide file. */
function scaleOf(page: HTMLElement): number {
  const w = page.offsetWidth
  if (!w) return 1
  return (Number(page.dataset.fileW) || SHAPE_FILE_W.wide) / w
}

function gcd(a: number, b: number): number {
  while (b) { const t = a % b; a = b; b = t }
  return a
}

/* Only reached where CompressionStream is missing — Safari before 16.4, and
   nothing else current. There the old behaviour is the honest one: drop the
   pixel ratio until the canvas will hold the image, and let `pixelSize` print
   the reduced figure so the sheet still describes the file it is about to
   write. */
function exportScale(page: HTMLElement): number {
  const w = page.offsetWidth
  const h = page.offsetHeight
  if (!w || !h) return 1
  const base = scaleOf(page)
  if (CAN_STREAM_PNG || fitsOneCanvas(w, h, base)) return base
  return Math.min(
    base,
    Math.sqrt(MAX_CANVAS_PX / (w * h)),
    MAX_CANVAS_SIDE / w,
    MAX_CANVAS_SIDE / h
  )
}

/* The serialized leaf, as an SVG string.

   html-to-image hands it back as a data: URL, and that is the last place in
   this pipeline where a length ceiling can still bite. The string carries the
   whole card AND the three embedded faces as base64 — several hundred
   kilobytes before a single cover is counted — and `encodeURIComponent`
   inflates every byte that is not URL-safe on top of that. Baking the images
   took the covers out of the total; it did not take out the fonts, and on
   WebKit an over-long `img.src` still does not error. It renders blank.

   A blob: URL would lift the ceiling outright, and it is the obvious answer
   until you try it: an SVG `<img>` loaded from blob: TAINTS the canvas it is
   drawn into, in Chrome and in WebKit both, so the leaf can be neither read
   back nor encoded. Measured, not assumed — the first attempt threw
   SecurityError out of `getImageData`. The data: URL stays, and the ceiling
   is handled from the other end instead: the covers are baked down to their
   printed size before they get here, and the leaf is checked after it is
   drawn (see `onePng`). */
async function leafSvg(
  page: HTMLElement,
  toSvg: (n: HTMLElement, o: Record<string, unknown>) => Promise<string>,
  fontEmbedCSS: string
): Promise<string> {
  const url = await toSvg(page, {
    width: page.offsetWidth,
    height: page.offsetHeight,
    backgroundColor: PAPER,
    fontEmbedCSS,
  })
  return decodeURIComponent(url.slice(url.indexOf(',') + 1))
}

/* An <img> holding that markup, decoded and ready to draw. `decode()` rather
   than a load listener: it is the one promise that resolves only when there is
   a frame ready to paint, which is the guarantee drawImage actually needs. */
async function svgImage(svg: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  return img
}

/* Where each picture sits on the leaf, and whether it had anything in it —
   the map the check below reads. Only pictures `bakeImages` could measure are
   listed: a cross-origin one it could not draw is one it cannot vouch for
   either, and guessing there would mean retrying an export forever over an
   image that was never going to arrive. */
/* Where each picture that carries ink sits on the leaf, in the leaf's own
   coordinates. Share pages force `rotate(0deg)` on the card, so these boxes are
   axis-aligned and can be drawn back into without any transform. */
type InkBox = { el: HTMLImageElement; x: number; y: number; w: number; h: number }
function inkedBoxes(page: HTMLElement): InkBox[] {
  const pr = page.getBoundingClientRect()
  return [...page.querySelectorAll('img')]
    .filter((i) => i.dataset.ink === '1')
    .map((i) => {
      const r = i.getBoundingClientRect()
      return { el: i, x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height }
    })
}

/* Draw one picture into its own box with `object-fit: cover` semantics — the
   whole box filled, the overflowing axis cropped evenly at both ends, which is
   what the card's CSS asks for on both `.cover` and `.plate-photo`. */
function drawCover(g: CanvasRenderingContext2D, b: InkBox, k: number, dy = 0): void {
  const nw = b.el.naturalWidth
  const nh = b.el.naturalHeight
  if (!nw || !nh) return
  const scale = Math.max((b.w * k) / nw, (b.h * k) / nh)
  const sw = (b.w * k) / scale
  const sh = (b.h * k) / scale
  /* anything past the edge of the canvas is simply clipped by drawImage, which
     is what makes the same call correct for a whole leaf and for one band of
     a leaf that a box straddles */
  g.drawImage(
    b.el,
    (nw - sw) / 2, (nh - sh) / 2, sw, sh,
    Math.round(b.x * k), Math.round(b.y * k) + dy, Math.round(b.w * k), Math.round(b.h * k)
  )
}

/* Sampled well inside each box, so a plate's white border and the rounding at
   its corners can't be mistaken for the photograph. The sample is clipped to
   the canvas rather than abandoned when it runs off it: on the banded path a
   box straddling a seam is only ever partly on either canvas, and a check that
   gave up there would be blind at exactly the joins. */
function isMissing(g: CanvasRenderingContext2D, b: InkBox, k: number, dy = 0): boolean {
  const inset = 0.18
  const x0 = Math.max(0, Math.round((b.x + b.w * inset) * k))
  const y0 = Math.max(0, Math.round((b.y + b.h * inset) * k) + dy)
  const x1 = Math.min(g.canvas.width, Math.round((b.x + b.w * (1 - inset)) * k))
  const y1 = Math.min(g.canvas.height, Math.round((b.y + b.h * (1 - inset)) * k) + dy)
  if (x1 - x0 < 4 || y1 - y0 < 4) return false
  return isFlat(g, x0, y0, x1 - x0, y1 - y0)
}

/* Every fix above removes a *cause* of a blank picture. This removes the
   consequence, whatever the cause turns out to be on a device none of us is
   holding: the leaf is read back, and any photograph that went in and did not
   come out is painted straight onto the canvas from the <img> we already hold.

   Drawing it back rather than rasterizing the whole leaf again is the point.
   Serializing is deterministic — a second identical attempt at an operation
   that just failed is a wish, not a fix, and it costs a second of the reader's
   time to arrive at the same picture. The <img> is decoded (bakeImages proved
   it by drawing it once already), the box is axis-aligned, and `object-fit:
   cover` is four numbers. So the repair cannot fail the way the thing it is
   repairing failed. It is exactly the "go back and do it again" that used to
   work, done by the app, before anything is handed to the share sheet. */
async function onePng(
  page: HTMLElement,
  toSvg: (n: HTMLElement, o: Record<string, unknown>) => Promise<string>,
  fontEmbedCSS: string
): Promise<Blob> {
  const k = exportScale(page)
  const boxes = inkedBoxes(page)
  const c = document.createElement('canvas')
  c.width = Math.round(page.offsetWidth * k)
  c.height = Math.round(page.offsetHeight * k)
  /* deliberately NOT willReadFrequently: the reads this path makes are a few
     hundred pixels inside each picture's box, once, which is not the repeated
     read-back the hint exists for — and the hint moves the canvas off the GPU
     to pay for it. Measured either way it is a wash (2012/1839/1692ms without
     against 1672/1705/1677ms with), so the default keeps the accelerated draw
     and gives up nothing. */
  const g = c.getContext('2d')!

  const img = await svgImage(await leafSvg(page, toSvg, fontEmbedCSS))
  g.fillStyle = PAPER
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  for (const b of boxes) if (isMissing(g, b, k)) drawCover(g, b, k)

  return new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('canvas would not encode'))), 'image/png')
  )
}

/* One leaf, at full scale, however tall it is.

   html-to-image paints by serializing the DOM into a single <svg> and loading
   that as an image, so the expensive half — cloning, inlining the cover,
   embedding the faces — is done once here and the result is a string. Each
   band then wraps that same string in an outer <svg> whose viewBox is panned
   down the leaf, which crops without re-cloning anything.

   The band boundaries are chosen in device rows, snapped to where the device
   grid and the CSS grid realign: a band origin lands on an integer CSS pixel
   only every dw / gcd(dw, w) device rows — every second row now that both
   options export at exactly 2× (the general rule survives any future scale).
   That is what keeps the joins invisible: a band whose origin landed on a
   fractional CSS pixel would resample the text a hair differently from its
   neighbour and draw a line across the review. */
async function tallPng(
  page: HTMLElement,
  toSvg: (n: HTMLElement, o: Record<string, unknown>) => Promise<string>,
  fontEmbedCSS: string
): Promise<Blob> {
  const w = page.offsetWidth
  const h = page.offsetHeight
  const k = scaleOf(page)
  const boxes = inkedBoxes(page)
  const inner = await leafSvg(page, toSvg, fontEmbedCSS)

  const dw = Math.round(w * k)
  const dh = Math.round(h * k)
  const step = dw / gcd(dw, Math.round(w))
  const bandDev =
    Math.max(step, step * Math.floor(Math.min(MAX_CANVAS_SIDE, BAND_PX / dw) / step))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  async function* bands() {
    for (let top = 0; top < dh; top += bandDev) {
      const dhi = Math.min(bandDev, dh - top)
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${dhi / k}" ` +
        `viewBox="0 ${top / k} ${w} ${dhi / k}">${inner}</svg>`
      const img = await svgImage(svg)
      canvas.width = dw
      canvas.height = dhi
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, dw, dhi)
      ctx.drawImage(img, 0, 0, dw, dhi)
      /* the same repair as the single-canvas path, band by band */
      for (const b of boxes) if (isMissing(ctx, b, k, -top)) drawCover(ctx, b, k, -top)
      const px = ctx.getImageData(0, 0, dw, dhi)
      yield { data: px.data, width: dw, height: dhi }
    }
  }

  return encodePng(dw, dh, bands())
}

/* Pages are always saved TIGHT: the leaf collapses to hug the card on a slim
   even mat, so the file is the card, never the ground it was composed on. The
   full leaf survives only in the print/PDF path, where paper pages mean
   something. `ground()` above has already done this at build time — the shape
   is baked into the layout, not painted on afterwards. */
async function pagesToPngs(pages: HTMLElement[]): Promise<Blob[]> {
  /* The rasterizer is a third of the bundle and nobody needs it to read a
     review — it loads the first time someone actually shares. */
  const { toSvg } = await import('html-to-image')
  await document.fonts.ready
  /* Hand it the faces rather than letting it hunt for them. Left to itself it
     walks document.styleSheets and refetches every @font-face it finds, which
     is where the wrong-face bug lived and is also the slowest part of an
     export — and it would repeat the whole search once per page. */
  /* Which hands are actually on these pages. A review stamps its own onto the
     card root, so the export embeds that face and no other — asking for all
     five would put four fonts nobody can see inside every image. */
  const hands = pages.flatMap((p) =>
    [...p.querySelectorAll<HTMLElement>('[data-hand]')].map((el) => el.dataset.hand ?? '')
  )
  const fontEmbedCSS = await fontEmbedCss(hands)
  await settleImages(pages)
  await bakeImages(pages)
  const blobs: Blob[] = []
  for (const page of pages) {
    resolveSvgVars(page)
    /* One canvas while one canvas will hold it, which is every ordinary
       review and every collage — that path is the faster one and it is the
       one this app spends nearly all its time on. The banded writer takes
       over only where the alternative used to be a soft image. */
    if (CAN_STREAM_PNG && !fitsOneCanvas(page.offsetWidth, page.offsetHeight, scaleOf(page))) {
      blobs.push(await tallPng(page, toSvg, fontEmbedCSS))
      continue
    }
    blobs.push(await onePng(page, toSvg, fontEmbedCSS))
  }
  return blobs
}

/* What a saved image will actually measure, for the download sheet to print
   before anyone commits to it. Read straight off the laid-out page — an earlier
   version reconstructed it from the card plus a hardcoded mat, and reported
   figures 48px short in each direction once the mat grew. */
export function pixelSize(pages: HTMLElement[]): { w: number; h: number; n: number } {
  const first = pages[0]
  if (!first) return { w: 0, h: 0, n: 0 }
  /* the same scale the file will actually be written at, not the nominal one —
     printing 2× figures over an image the canvas ceiling forced down to 1.4×
     would make the sheet lie about the thing it exists to show */
  const k = exportScale(first)
  return {
    w: Math.round(first.offsetWidth * k),
    h: Math.round(first.offsetHeight * k),
    n: pages.length,
  }
}

export interface ExportResult {
  ok: boolean
  /** 'save' is a download that went through the system sheet — see below */
  method: 'share' | 'download' | 'save' | 'none'
  pages: number
}

/** Whether Download has to go through the system sheet to reach the photo
    library. iOS only: it is the single platform with no file download a
    person can find afterwards. */
export function savesViaSystemSheet(): boolean {
  return isIOS() && canShareFiles()
}

export type ExportMode = 'share' | 'download'

/* whether this device can hand image files to other apps (Web Share Level 2) */
export function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob(['x'], { type: 'image/png' })], 'probe.png', { type: 'image/png' })
    return !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

async function pagesToFiles(pages: HTMLElement[], baseName: string): Promise<File[]> {
  const blobs = await pagesToPngs(pages)
  return blobs.map((b, i) => new File([b], fileName(baseName, i, blobs.length), { type: 'image/png' }))
}

/* Share and Download are separate, explicit actions now: Share hands the
   images to other apps via the native sheet; Download always saves files. */
async function exportPages(
  pages: HTMLElement[],
  baseName: string,
  mode: ExportMode
): Promise<ExportResult> {
  const files = await pagesToFiles(pages, baseName)
  if (mode === 'share') {
    if (!navigator.canShare?.({ files })) return { ok: false, method: 'none', pages: files.length }
    try {
      await navigator.share({ files, title: baseName })
      return { ok: true, method: 'share', pages: files.length }
    } catch {
      /* the user closing the share sheet is not an error */
      return { ok: false, method: 'none', pages: files.length }
    }
  }
  /* iOS has no download that reaches the camera roll. `<a download>` there is
     Safari's download manager, which writes to Files — and worse, it honours
     only the FIRST synthetic click in a burst, so a two-leaf review arrived as
     one image in the wrong place. The system sheet is the only route to Photos
     on that platform, and it takes every file at once, so Download uses it and
     says so on the button. Share and Download are still different acts: Share
     hands the images to an app you pick, Download's sheet is opened for the
     one purpose of saving them. */
  if (savesViaSystemSheet() && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: baseName })
      return { ok: true, method: 'save', pages: files.length }
    } catch {
      return { ok: false, method: 'none', pages: files.length }
    }
  }
  /* Everywhere else: one anchor per file, spaced out. Fired back to back,
     Chrome and Safari both drop all but the first — the gap is what makes a
     split review actually arrive as three files. */
  for (const [i, f] of files.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 350))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(f)
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  return { ok: true, method: 'download', pages: files.length }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)

/* A file that lands in a downloads folder among a thousand others should say
   what it is without being opened: the book, who wrote it, and what kind of
   thing this is. Multi-page reviews number themselves "1-of-2" rather than
   "page-1", so a lone file still admits there is another half somewhere. */
export function reviewBaseName(rec: Review): string {
  return [slug(rec.title), slug(rec.author), 'review'].filter(Boolean).join('-')
}

export function collageBaseName(m: MonthData): string {
  /* A hopefuls card is not a record of reading, so it may not be named for
     one — a file called july-2026-reading holding books nobody has opened
     misdescribes itself the moment it is out of the app. */
  return `${slug(m.name)}-${m.span === 'hopefuls' ? 'hopefuls' : 'reading'}`
}

export function fileName(base: string, i: number, total: number): string {
  return `${base}${total > 1 ? `-${i + 1}-of-${total}` : ''}.png`
}

export async function shareReviewImages(
  rec: Review,
  style: StyleId,
  mode: ExportMode,
  shape: ExportShape
): Promise<ExportResult> {
  const host = makeHost()
  try {
    const pages = paginateReview(rec, style, host, shape)
    return await exportPages(pages, reviewBaseName(rec), mode)
  } finally {
    host.remove()
  }
}

export async function shareCollageImage(
  m: MonthData,
  style: CollageId,
  mode: ExportMode,
  shape: ExportShape
): Promise<ExportResult> {
  const host = makeHost()
  try {
    const pages = buildCollagePage(m, style, host, shape)
    return await exportPages(pages, collageBaseName(m), mode)
  } finally {
    host.remove()
  }
}

/* A story card is one book, so it is named for the book and not for the
   month it happens to sit in — `${slug(m.name)}-reading` would give every
   currently-reading card of a month the same filename, and the second one to
   land in a downloads folder would be "(1)". */
export function storyBaseName(m: MonthData): string {
  const b = m.books[0]
  if (!b) return `${slug(m.name)}-reading`
  return [slug(b.title), slug(b.author), 'reading'].filter(Boolean).join('-')
}

export async function shareStoryImage(
  m: MonthData,
  style: CollageId,
  mode: ExportMode
): Promise<ExportResult> {
  const host = makeHost()
  try {
    const pages = buildStoryPage(m, style, host)
    return await exportPages(pages, storyBaseName(m), mode)
  } finally {
    host.remove()
  }
}

/* how many paper pages a review needs, in a given style and shape */
export function pageCount(rec: Review, style: StyleId, shape: ExportShape = 'phone'): number {
  const host = makeHost()
  try {
    /* Always 1 while PAGE_LIMIT is Infinity. Kept as a measurement rather than
       a hardcoded 1 so the sheet's copy follows the splitter instead of
       asserting something about it. */
    return paginateReview(rec, style, host, shape).length
  } finally {
    host.remove()
  }
}

/* PDF is a settings thing, not a share thing: when the toggle is on, this
   opens the print dialog over the paginated pages (print → save as PDF). */
export function printReviewPdf(rec: Review, style: StyleId): void {
  const host = makeHost()
  host.style.cssText = 'position:fixed;left:0;top:0;width:720px;z-index:9999;background:#fff;'
  host.classList.add('print-host')
  /* print pages are portrait paper — the standard 720px leaf, never the broad
     export column */
  paginateReview(rec, style, host, 'phone')
  const cleanup = () => {
    host.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  requestAnimationFrame(() => window.print())
}

/* Whole-library PDF: every review paginated in its own saved style, all the
   pages in one print host, oldest finish first — the shelf as one document. */
export function printLibraryPdf(reviews: Review[]): void {
  const host = makeHost()
  host.style.cssText = 'position:fixed;left:0;top:0;width:720px;z-index:9999;background:#fff;'
  host.classList.add('print-host')
  const sorted = [...reviews].sort((a, b) => a.finished.localeCompare(b.finished))
  /* the stage must live in the document while paginating — the split point is
     found by measuring offsetHeight, which is 0 in a detached node */
  const stage = document.createElement('div')
  host.appendChild(stage)
  for (const rec of sorted) {
    const pages = paginateReview(rec, rec.style, stage, 'phone')
    for (const p of pages) host.insertBefore(p, stage)
  }
  stage.remove()
  const cleanup = () => {
    host.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  requestAnimationFrame(() => window.print())
}


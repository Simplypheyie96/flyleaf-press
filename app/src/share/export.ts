/* Share = images, always. A review renders onto paper pages, splitting at a
   paragraph boundary; each page becomes one PNG.
   The pages build inside a hidden host in THIS document, at a width the CALLER
   chooses — the card CSS has no viewport media queries (compact is a class),
   so the host's width, not the phone's, decides which layout the card composes
   in. That is exactly what the export shape selects. */

import type { Review, StyleId, CollageId, ExportShape } from '../types'
import { EXPORT_SCALE, SHAPE_W } from '../types'
import { renderReviewCard } from '../cards/review'
import { renderCollage, type MonthData } from '../cards/collage'
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

/* Set the host to the shape's composition width and put it on the right side
   of the card's compact threshold. Everything downstream — where the review
   splits, how wide the leaf is, what the file measures — follows from this. */
function prepHost(host: HTMLDivElement, shape: ExportShape): void {
  host.style.width = `${SHAPE_W[shape]}px`
  host.classList.toggle('card-compact', shape === 'phone')
}

/* Put a leaf into its shape: the shape's width, and the tight ground.
   This has to happen the moment a page exists, BEFORE anything on it is
   measured. Doing it at the end instead — which is what it used to do — meant
   every page was composed at the base rule's 720px while the splitter decided
   where to break, and only then narrowed: the phone shape picked its split
   points against a 632px column and reflowed into a 350px one, so the leaf it
   had just measured as full came out twice the height of its own page. */
function ground(pages: HTMLElement[], shape: ExportShape): HTMLElement[] {
  for (const p of pages) {
    p.style.width = `${SHAPE_W[shape]}px`
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
  host.innerHTML = `<div class="share-page share-page--free"><div>${renderCollage(m, style)}</div></div>`
  return ground([host.querySelector('.share-page') as HTMLElement], shape)
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

/* Every picture decoded before anything is rasterized. html-to-image paints the
   DOM by loading it as one big SVG data URL, and an image the browser has not
   finished decoding is simply not in that paint — which is why a cover or a
   plate would show in the preview and then be missing from the file, and why
   going back and doing it again "fixed" it: the second attempt found the image
   already decoded. Failures are swallowed on purpose; a cover that will not
   decode is not a reason to refuse to export the review. */
async function settleImages(pages: HTMLElement[]): Promise<void> {
  const imgs = pages.flatMap((p) => [...p.querySelectorAll('img')])
  await Promise.all(
    imgs.map(async (img) => {
      try {
        if (!img.complete) {
          /* The export host is offscreen, and an offscreen image is the first
             thing a busy renderer defers — measured at 142 SECONDS for one
             400x600 cover, on the run where the leaf underneath it was 36000px
             tall. Asking for it explicitly is most of the cure; the 10s race
             is the rest, because a wait that can be starved indefinitely is
             not a wait, it is a hang. Losing the race costs the cover in that
             one file, which is the same thing that happens if the image is
             simply broken, and is plainly better than an export that never
             returns. */
          img.fetchPriority = 'high'
          img.loading = 'eager'
          await Promise.race([
            new Promise<void>((r) => {
              img.addEventListener('load', () => r(), { once: true })
              img.addEventListener('error', () => r(), { once: true })
            }),
            new Promise<void>((r) => setTimeout(r, 10_000)),
          ])
        }
        await img.decode()
      } catch {
        /* undecodable — let it render as whatever it renders as */
      }
    })
  )
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
  const imgs = pages.flatMap((p) => [...p.querySelectorAll('img')])
  for (const img of imgs) {
    try {
      if (!img.naturalWidth || !img.naturalHeight) continue
      const box = img.getBoundingClientRect()
      const w = Math.max(1, Math.round(box.width * EXPORT_SCALE))
      const h = Math.max(1, Math.round(box.height * EXPORT_SCALE))
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
      const baked = c.toDataURL('image/jpeg', 0.92)
      if (baked.length > 32 && baked.length < img.src.length) img.src = baked
    } catch {
      /* tainted or undrawable — leave the original src alone */
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
   Length stops costing sharpness: every export is EXPORT_SCALE, whatever the
   review's length. See src/share/png.ts. */
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

/* Only reached where CompressionStream is missing — Safari before 16.4, and
   nothing else current. There the old behaviour is the honest one: drop the
   pixel ratio until the canvas will hold the image, and let `pixelSize` print
   the reduced figure so the sheet still describes the file it is about to
   write. */
function exportScale(page: HTMLElement): number {
  const w = page.offsetWidth
  const h = page.offsetHeight
  if (!w || !h) return EXPORT_SCALE
  if (CAN_STREAM_PNG || fitsOneCanvas(w, h, EXPORT_SCALE)) return EXPORT_SCALE
  return Math.min(
    EXPORT_SCALE,
    Math.sqrt(MAX_CANVAS_PX / (w * h)),
    MAX_CANVAS_SIDE / w,
    MAX_CANVAS_SIDE / h
  )
}

/* One leaf, at full scale, however tall it is.

   html-to-image paints by serializing the DOM into a single <svg> and loading
   that as an image, so the expensive half — cloning, inlining the cover,
   embedding the faces — is done once here and the result is a string. Each
   band then wraps that same string in an outer <svg> whose viewBox is panned
   down the leaf, which crops without re-cloning anything.

   The band boundaries are chosen in device rows and are even, so at
   EXPORT_SCALE = 2 every band maps exactly two device pixels to one CSS
   pixel at an integer offset. That is what keeps the joins invisible: a band
   whose origin landed on a half pixel would resample the text a hair
   differently from its neighbour and draw a line across the review. */
async function tallPng(
  page: HTMLElement,
  toSvg: (n: HTMLElement, o: Record<string, unknown>) => Promise<string>,
  fontEmbedCSS: string
): Promise<Blob> {
  const w = page.offsetWidth
  const h = page.offsetHeight
  const k = EXPORT_SCALE
  const url = await toSvg(page, { width: w, height: h, backgroundColor: PAPER, fontEmbedCSS })
  const inner = decodeURIComponent(url.slice(url.indexOf(',') + 1))

  const dw = Math.round(w * k)
  const dh = Math.round(h * k)
  const bandDev =
    Math.max(2, 2 * Math.floor(Math.min(MAX_CANVAS_SIDE, BAND_PX / dw) / 2))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  async function* bands() {
    for (let top = 0; top < dh; top += bandDev) {
      const dhi = Math.min(bandDev, dh - top)
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${dhi / k}" ` +
        `viewBox="0 ${top / k} ${w} ${dhi / k}">${inner}</svg>`
      const img = new Image()
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      await img.decode()
      canvas.width = dw
      canvas.height = dhi
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, dw, dhi)
      ctx.drawImage(img, 0, 0, dw, dhi)
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
  const { toPng, toSvg } = await import('html-to-image')
  await document.fonts.ready
  /* Hand it the faces rather than letting it hunt for them. Left to itself it
     walks document.styleSheets and refetches every @font-face it finds, which
     is where the wrong-face bug lived and is also the slowest part of an
     export — and it would repeat the whole search once per page. */
  const fontEmbedCSS = await fontEmbedCss()
  await settleImages(pages)
  await bakeImages(pages)
  const blobs: Blob[] = []
  for (const page of pages) {
    resolveSvgVars(page)
    /* One canvas while one canvas will hold it, which is every ordinary
       review and every collage — that path is the faster one and it is the
       one this app spends nearly all its time on. The banded writer takes
       over only where the alternative used to be a soft image. */
    if (CAN_STREAM_PNG && !fitsOneCanvas(page.offsetWidth, page.offsetHeight, EXPORT_SCALE)) {
      blobs.push(await tallPng(page, toSvg, fontEmbedCSS))
      continue
    }
    const dataUrl = await toPng(page, {
      pixelRatio: exportScale(page),
      width: page.offsetWidth,
      height: page.offsetHeight,
      backgroundColor: PAPER,
      fontEmbedCSS,
    })
    const res = await fetch(dataUrl)
    blobs.push(await res.blob())
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
  return `${slug(m.name)}-reading`
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
  paginateReview(rec, style, host, 'wide')
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
    const pages = paginateReview(rec, rec.style, stage, 'wide')
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


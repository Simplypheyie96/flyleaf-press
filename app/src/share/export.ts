/* Share = images, always. A review renders onto paper pages, splitting at a
   paragraph boundary; each page becomes one PNG.
   The pages build inside a hidden host in THIS document, at a width the CALLER
   chooses — the card CSS has no viewport media queries (compact is a class),
   so the host's width, not the phone's, decides which layout the card composes
   in. That is exactly what the export shape selects. */

import type { Review, StyleId, CollageId, ExportShape } from '../types'
import { EXPORT_SCALE, SHAPE_LEAF_H, SHAPE_W } from '../types'
import { renderReviewCard } from '../cards/review'
import { renderCollage, type MonthData } from '../cards/collage'
import { paragraphs } from '../format'

const pageLimit = (shape: ExportShape) => SHAPE_LEAF_H[shape] - 88 /* minus its own padding */

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
  const PAGE_LIMIT = pageLimit(shape)
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

/* Pages are always saved TIGHT: the leaf collapses to hug the card on a slim
   even mat, so the file is the card, never the ground it was composed on. The
   full leaf survives only in the print/PDF path, where paper pages mean
   something. `ground()` above has already done this at build time — the shape
   is baked into the layout, not painted on afterwards. */
async function pagesToPngs(pages: HTMLElement[]): Promise<Blob[]> {
  /* The rasterizer is a third of the bundle and nobody needs it to read a
     review — it loads the first time someone actually shares. */
  const { toPng } = await import('html-to-image')
  await document.fonts.ready
  const blobs: Blob[] = []
  for (const page of pages) {
    const dataUrl = await toPng(page, {
      pixelRatio: EXPORT_SCALE,
      width: page.offsetWidth,
      height: page.offsetHeight,
      backgroundColor: '#F4F2ED',
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
  return {
    w: Math.round(first.offsetWidth * EXPORT_SCALE),
    h: Math.round(first.offsetHeight * EXPORT_SCALE),
    n: pages.length,
  }
}

export interface ExportResult {
  ok: boolean
  method: 'share' | 'download' | 'none'
  pages: number
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
  for (const f of files) {
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

/* how many paper pages a review needs in a given style — for the preview note */
export function pageCount(rec: Review, style: StyleId): number {
  const host = makeHost()
  try {
    /* the wide layout is the canonical one for this note — it is what the
       detail page shows and what the split warning is really about */
    return paginateReview(rec, style, host, 'wide').length
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

export function splitPreviewNote(rec: Review, style: StyleId): string {
  const n = pageCount(rec, style)
  return n === 1
    ? 'Fits one page'
    : `${n} pages · splits at a paragraph boundary — shared whole, as ${n} images`
}

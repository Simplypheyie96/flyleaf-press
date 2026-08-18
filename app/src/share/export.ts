/* Share = images, always. A review renders onto 720×1018 (1:√2) paper pages,
   splitting to page two at a paragraph boundary; each page becomes one PNG.
   The pages build inside a hidden fixed-width host in THIS document — the
   card CSS has no viewport media queries (compact is a class), so the hidden
   720px host always gets the full desktop layout, even on a phone. */

import type { Review, StyleId, CollageId } from '../types'
import { renderReviewCard } from '../cards/review'
import { renderCollage, type MonthData } from '../cards/collage'
import { paragraphs } from '../format'

const PAGE_LIMIT = 1018 - 88 /* page minus its own padding */

function makeHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.className = 'card-wrap share-host'
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:720px;z-index:-1;pointer-events:none;'
  document.body.appendChild(host)
  return host
}

/* Build the paper pages for a review; returns the page elements (still in the
   hidden host — caller exports then disposes, or adopts them for a preview). */
export function paginateReview(rec: Review, style: StyleId, host: HTMLDivElement): HTMLElement[] {
  host.innerHTML = `<div class="share-page"><div>${renderReviewCard(rec, style)}</div>
    <div class="share-page-no"></div></div>`
  const page1 = host.querySelector('.share-page') as HTMLElement
  const card1 = page1.querySelector('.card') as HTMLElement
  const body1 = card1.querySelector('.body') as HTMLElement

  if (card1.offsetHeight <= PAGE_LIMIT) return [page1]

  /* continuation card: same ground, no header chrome, body (and plates) only */
  const page2 = document.createElement('div')
  page2.className = 'share-page'
  const grounds = card1.className.split(' ').filter((c) => c.startsWith('card--')).join(' ')
  page2.innerHTML = `<div>
      <article class="card ${grounds}" style="--rot:0deg">
        <div class="lbl" style="margin-bottom:18px">${card1.querySelector('.title')?.textContent || ''} · continued</div>
        <div class="body"></div>
      </article>
    </div>
    <div class="share-page-no">Flyleaf Press · Nº ${rec.no} · 2</div>`
  host.appendChild(page2)
  const card2 = page2.querySelector('.card') as HTMLElement
  const body2 = page2.querySelector('.body') as HTMLElement

  /* colophon always closes the review — move it to the last page */
  const colo = card1.querySelector('.colo')
  if (colo) card2.appendChild(colo)
  /* the plate row moves whole before any paragraph does — images read better
     at the foot of the continuation than orphaned under a lone paragraph */
  const plateRowEl = card1.querySelector('.plate-row')
  if (plateRowEl && card1.offsetHeight > PAGE_LIMIT) card2.insertBefore(plateRowEl, card2.querySelector('.colo'))

  let guard = 60
  while (card1.offsetHeight > PAGE_LIMIT && body1.children.length > 1 && guard--) {
    body2.insertBefore(body1.lastElementChild as Element, body2.firstChild)
  }
  const no1 = page1.querySelector('.share-page-no') as HTMLElement
  no1.textContent = `Flyleaf Press · Nº ${rec.no} · 1`
  return [page1, page2]
}

/* Collage: one free-height page (a short month still fills one paper leaf) */
export function buildCollagePage(m: MonthData, style: CollageId, host: HTMLDivElement): HTMLElement[] {
  host.innerHTML = `<div class="share-page share-page--free"><div>${renderCollage(m, style)}</div></div>`
  return [host.querySelector('.share-page') as HTMLElement]
}

/* Rasterize pages as TIGHT captures: the page collapses to hug the card
   (a slim, even paper mat) instead of rasterizing the whole 1018px leaf —
   what gets saved is the card, not the ground it was laid out on. The full
   leaf survives only in the print/PDF path, where paper pages make sense. */
async function pagesToPngs(pages: HTMLElement[]): Promise<Blob[]> {
  /* The rasterizer is a third of the bundle and nobody needs it to read a
     review — it loads the first time someone actually shares. */
  const { toPng } = await import('html-to-image')
  await document.fonts.ready
  const blobs: Blob[] = []
  for (const page of pages) {
    page.classList.add('share-page--tight')
    const dataUrl = await toPng(page, {
      pixelRatio: 2,
      width: page.offsetWidth,
      height: page.offsetHeight,
      backgroundColor: '#F4F2ED',
    })
    const res = await fetch(dataUrl)
    blobs.push(await res.blob())
  }
  return blobs
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
  return blobs.map(
    (b, i) => new File([b], `${baseName}${blobs.length > 1 ? `-page-${i + 1}` : ''}.png`, { type: 'image/png' })
  )
}

/* Share and Download are separate, explicit actions now: Share hands the
   images to other apps via the native sheet; Download always saves files. */
async function exportPages(pages: HTMLElement[], baseName: string, mode: ExportMode): Promise<ExportResult> {
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

export async function shareReviewImages(rec: Review, style: StyleId, mode: ExportMode): Promise<ExportResult> {
  const host = makeHost()
  try {
    const pages = paginateReview(rec, style, host)
    return await exportPages(pages, `flyleaf-press-${slug(rec.title)}`, mode)
  } finally {
    host.remove()
  }
}

export async function shareCollageImage(m: MonthData, style: CollageId, mode: ExportMode): Promise<ExportResult> {
  const host = makeHost()
  try {
    const pages = buildCollagePage(m, style, host)
    return await exportPages(pages, `flyleaf-press-${slug(m.name)}`, mode)
  } finally {
    host.remove()
  }
}

/* how many paper pages a review needs in a given style — for the preview note */
export function pageCount(rec: Review, style: StyleId): number {
  const host = makeHost()
  try {
    return paginateReview(rec, style, host).length
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
  paginateReview(rec, style, host)
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
    const pages = paginateReview(rec, rec.style, stage)
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

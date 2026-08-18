/* The five monthly-collage renderers — pure HTML-string generators over the
   month's finished reviews. Flexible to any month size; a month can be viewed
   (and shared) at any point, not only at its end. */

import type { CollageId, Review } from '../types'
import { escapeHtml, fmtRating } from '../format'
import { mark, starSvg } from './assets'

export interface MonthData {
  name: string
  books: Review[]
}

function starsS(r: number, size: number, fillCol: string, lineCol: string): string {
  let out = ''
  for (let i = 0; i < 5; i++) out += starSvg(Math.max(0, Math.min(1, r - i)), size, fillCol, lineCol)
  return `<span class="stars-s" role="img" aria-label="${fmtRating(r)} out of 5">${out}</span>`
}

function patchC(size: number): string {
  return `<span class="patch" aria-hidden="true">${mark(size)}</span>`
}

function cov(b: Review, cls?: string): string {
  if (!b.cover) return `<div class="cov-miss ${cls || ''}">No cover</div>`
  return `<img class="cov ${cls || ''}" alt="Cover of ${escapeHtml(b.title)}" loading="lazy" src="${b.cover}">`
}

function moHead(m: MonthData): string {
  return `<div class="mo-head">
    <div class="mo-title">${m.name}</div>
    <div class="mo-sub">${mark(13)}<span class="lbl">${m.books.length} book${m.books.length === 1 ? '' : 's'} · Flyleaf Press</span></div>
  </div>`
}

function stat(label: string, value: string): string {
  return `<div class="mo-stat"><div class="lbl">${label}</div><div class="mo-stat-v">${value}</div></div>`
}

/* The month in numbers. Every figure is derived from what the rows actually
   hold — a stat whose source is missing is left out rather than printed as a
   zero, so a month where nobody recorded page counts simply shows fewer cells
   instead of claiming nought pages were read. */
function moStats(m: MonthData): string {
  const books = m.books
  if (!books.length) return ''

  const cells: string[] = [stat('Books', String(books.length))]

  const withPages = books.filter((b) => b.pages)
  if (withPages.length) {
    const total = withPages.reduce((s, b) => s + (b.pages || 0), 0)
    /* just the total. An earlier version appended "of 4" when only some books
       carried a count; on the card it read as a fraction rather than a caveat,
       so the figure is now plainly the pages we know about. */
    cells.push(stat('Pages', total.toLocaleString()))
    cells.push(stat('Longest', `${Math.max(...withPages.map((b) => b.pages || 0)).toLocaleString()} pp`))
  }

  const avg = books.reduce((s, b) => s + b.rating, 0) / books.length
  cells.push(stat('Average', fmtRating(Math.round(avg / 0.25) * 0.25)))

  const best = books.reduce((a, b) => (b.rating > a.rating ? b : a))
  cells.push(stat('Best', escapeHtml(best.title)))

  /* the format the month was mostly read in — a book counts once per format
     it carries, since a multi-format read genuinely happened in both */
  const tally = new Map<string, number>()
  for (const b of books) for (const f of b.formats) tally.set(f, (tally.get(f) || 0) + 1)
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top) cells.push(stat('Mostly', top[0]))

  return `<div class="mo-stats">${cells.join('')}</div>`
}

/* Columns scale with the month so a long month doesn't become a scroll: lists
   break into two, grids widen. No hardcoded month size anywhere — the counts
   below are thresholds, and any number of books is legal. */
function listCols(n: number): number {
  return n > 6 ? 2 : 1
}
function gridCols(n: number): number {
  return n > 12 ? 4 : 3
}

function fmts(b: Review): string {
  return b.formats.join(' · ')
}

const leans = [-1.6, 0.8, -0.6, 1.4, -1, 0.6]

/* C1 · Contact Sheet (coal) — the proof grid */
function contact(m: MonthData): string {
  const ink = 'var(--mustard)', line = 'rgba(244,242,237,.55)'
  return `<article class="card c1" style="--rot:-.6deg">
    ${patchC(150)}
    ${moHead(m)}
    ${moStats(m)}
    <div class="c1-grid" style="--cols:${gridCols(m.books.length)}">
      ${m.books.map((b, i) => `
        <div class="c1-cell">
          <div class="c1-no">FR ${String(i + 1).padStart(2, '0')}A</div>
          ${cov(b)}
          <div class="c1-meta">
            <span class="r-num">${fmtRating(b.rating)}</span>
            ${starsS(b.rating, 11, ink, line)}
          </div>
        </div>`).join('')}
    </div>
  </article>`
}

/* C2 · Shelf (butter) — front-facing covers on drawn rails, three to a rail */
function shelf(m: MonthData): string {
  const per = gridCols(m.books.length)
  const rows: Review[][] = []
  for (let i = 0; i < m.books.length; i += per) rows.push(m.books.slice(i, i + per))
  return `<article class="card c2" style="--rot:.5deg; --cols:${per}">
    ${patchC(140)}
    ${moHead(m)}
    ${moStats(m)}
    ${rows.map((row) => `
      <div class="c2-rail">
        ${row.map((b, i) => `
          <div class="c2-book" style="--lean:${leans[i % leans.length]}deg">
            ${cov(b)}
          </div>`).join('')}
      </div>
      <div class="c2-edge"></div>
      <div class="c2-rail" style="align-items:start; margin-bottom:26px">
        ${row.map((b) => `
          <div class="c2-meta">
            <span class="r-num">${fmtRating(b.rating)}</span>
            <div class="c2-stars">${starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.5)')}</div>
          </div>`).join('')}
      </div>`).join('')}
  </article>`
}

/* C3 · Tickets (pink) — admission stubs */
function tickets(m: MonthData): string {
  const cols = listCols(m.books.length)
  return `<article class="card c3" style="--rot:-.8deg">
    ${patchC(150)}
    ${moHead(m)}
    ${moStats(m)}
    <div class="c3-stack ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b, i) => `
        <div class="c3-t" style="--tr:${leans[i % leans.length] * 0.7}deg">
          ${cov(b)}
          <div style="min-width:0; padding-right:14px">
            <div class="c3-name">${escapeHtml(b.title)}</div>
            <div class="c3-adm">Admit one · ${fmts(b)}</div>
          </div>
          <div class="c3-end">
            <span class="r-num">${fmtRating(b.rating)}</span>
            <div>${starsS(b.rating, 10, 'var(--accent)', 'rgba(27,25,23,.4)')}</div>
          </div>
        </div>`).join('')}
    </div>
  </article>`
}

/* C4 · Pinboard (blue) — pinned prints, no cover ever hidden */
function pinboard(m: MonthData): string {
  return `<article class="card c4" style="--rot:.7deg">
    ${patchC(130)}
    ${moHead(m)}
    ${moStats(m)}
    <div class="c4-board" style="--cols:${gridCols(m.books.length)}">
      ${m.books.map((b, i) => `
        <div class="c4-pin" style="--pr:${leans[i % leans.length] * 1.6}deg">
          <svg class="c4-tack" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.4" fill="var(--accent)"/>
            <circle cx="5.4" cy="5.4" r="1.7" fill="rgba(255,255,255,.55)"/>
          </svg>
          <div class="c4-photo">
            ${cov(b)}
            <div class="c4-cap"><span class="r-num">${fmtRating(b.rating)}</span>${starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.45)')}</div>
          </div>
        </div>`).join('')}
    </div>
  </article>`
}

/* C5 · Ledger (mustard) — the reading register */
function ledger(m: MonthData): string {
  const cols = listCols(m.books.length)
  const avg = m.books.reduce((s, b) => s + b.rating, 0) / (m.books.length || 1)
  const pages = m.books.reduce((s, b) => s + (b.pages || 0), 0)
  return `<article class="card c5" style="--rot:-.5deg">
    ${patchC(140)}
    ${moHead(m)}
    ${moStats(m)}
    <div class="c5-tbl ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b) => `
        <div class="c5-r">
          ${cov(b)}
          <div style="min-width:0">
            <div class="c5-name">${escapeHtml(b.title)}</div>
            <div class="c5-fmt">${escapeHtml(b.author)} · ${fmts(b)}${b.pages ? ` · ${b.pages} pp` : ''}</div>
          </div>
          <div class="c5-rate">
            <span class="r-num">${fmtRating(b.rating)}</span>
            <div>${starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.55)')}</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="c5-total">
      <span class="lbl">${pages ? 'Pages this month' : 'Month average'}</span>
      <span class="r-num" style="font-size:20px">${
        pages ? pages.toLocaleString() : fmtRating(Math.round(avg / 0.25) * 0.25)
      }</span>
    </div>
  </article>`
}

export const COLLAGE_RENDERERS: Record<CollageId, (m: MonthData) => string> = {
  contact,
  shelf,
  tickets,
  pinboard,
  ledger,
}

export function renderCollage(m: MonthData, style: CollageId): string {
  return COLLAGE_RENDERERS[style](m)
}

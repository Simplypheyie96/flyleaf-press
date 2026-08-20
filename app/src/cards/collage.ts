/* The seven monthly-collage renderers — pure HTML-string generators over the
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

/* Deliberately NOT loading="lazy". The covers ARE the collage — a month is at
   most ~20 small pictures and there is nothing below them worth deferring for.
   Worse, the card is first laid out inside `CollapsedCard`, which clamps it, so
   every cover past the clamp starts life outside the viewport and the browser
   simply never comes back for them: measured on a six-book month, ZERO requests
   for /covers/ after expanding the card AND scrolling it, with every <img> still
   at naturalWidth 0. The board rendered as a column of empty boxes. */
function cov(b: Review, cls?: string): string {
  if (!b.cover) return `<div class="cov-miss ${cls || ''}">No cover</div>`
  return `<img class="cov ${cls || ''}" alt="Cover of ${escapeHtml(b.title)}" src="${b.cover}">`
}

/* Each style heads itself. One shared masthead across all five made the top
   of every collage identical and the style picker feel like a colour swap —
   the styles are five different printed objects, and the first thing you read
   is where that has to be true. They keep the same two faces and the same
   rosette; what differs is the arrangement, the rule under it, and what the
   count is called, because a contact sheet counts frames and a ledger counts
   entries. */
type HeadId = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7'

function moHead(m: MonthData, id: HeadId): string {
  const n = m.books.length
  const t = escapeHtml(m.name)

  /* C1 · a contact sheet is labelled on its own edge, so the kicker sits above
     the month and the count is in frames */
  if (id === 'c1')
    return `<div class="mo-head mo-head--c1">
      <div class="mo-kick">Contact sheet · Flyleaf Press</div>
      <div class="mo-title">${t}</div>
      <div class="mo-sub">${mark(13)}<span class="lbl">${n} frame${n === 1 ? '' : 's'}</span></div>
    </div>`

  /* C2 · the mark leads, and the head closes on a drawn shelf edge with the
     count sitting on it — the same rail the covers stand on below */
  if (id === 'c2')
    return `<div class="mo-head mo-head--c2">
      <div class="mo-line">${mark(15)}<div class="mo-title">${t}</div></div>
      <div class="mo-edge"><span class="lbl">${n} spine${n === 1 ? '' : 's'}</span></div>
    </div>`

  /* C3 · centred and perforated, like the top of a stub book */
  if (id === 'c3')
    return `<div class="mo-head mo-head--c3">
      <div class="mo-kick">Box office · Flyleaf Press</div>
      <div class="mo-title">${t}</div>
      <div class="mo-perf"></div>
      <div class="mo-sub">${mark(13)}<span class="lbl">${n} stub${n === 1 ? '' : 's'}</span></div>
    </div>`

  /* C4 · a board has a card pinned to it rather than a masthead printed on it,
     so the head is a small tacked slip sitting at an angle */
  if (id === 'c4')
    return `<div class="mo-head mo-head--c4">
      <div class="mo-slip">
        <svg class="mo-tack" width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.4" fill="var(--accent)"/>
          <circle cx="5.4" cy="5.4" r="1.7" fill="rgba(255,255,255,.55)"/>
        </svg>
        <div class="mo-title">${t}</div>
        <div class="mo-sub">${mark(12)}<span class="lbl">${n} pinned</span></div>
      </div>
    </div>`

  /* C6 · a customs slip: the airmail label to the left of the month, and the
     count in stamps, because that is what is stuck to the sheet below */
  if (id === 'c6')
    return `<div class="mo-head mo-head--c6">
      <div class="mo-air"><span class="lbl">Par avion</span><span class="lbl">By air mail</span></div>
      <span class="mo-bars" aria-hidden="true"></span>
      <div class="mo-line">${mark(14)}<div class="mo-title">${t}</div></div>
      <div class="mo-sub"><span class="lbl">${n} stamp${n === 1 ? '' : 's'} affixed</span></div>
    </div>`

  /* C7 · a listings board is lit from its own frame, so the head sits between
     two runs of lamps and is centred under them — nothing else here centres */
  if (id === 'c7')
    return `<div class="mo-head mo-head--c7">
      <div class="mo-lamps" aria-hidden="true"></div>
      <div class="mo-kick">Now showing · Flyleaf Press</div>
      <div class="mo-title">${t}</div>
      <div class="mo-sub">${mark(13)}<span class="lbl">${n} feature${n === 1 ? '' : 's'}</span></div>
      <div class="mo-lamps" aria-hidden="true"></div>
    </div>`

  /* C5 · a register head: month left, the range of entries right, one heavy
     rule under the pair — and that rule is the only one, which is why the
     stats strip drops its own bottom border on this style */
  return `<div class="mo-head mo-head--c5">
    <div class="mo-line">${mark(13)}<div class="mo-title">${t}</div></div>
    <span class="lbl">Entries 01–${String(n).padStart(2, '0')}</span>
  </div>`
}

type Stat = { label: string; value: string }

/* The month in numbers. Every figure is derived from what the rows actually
   hold — a stat whose source is missing is left out rather than printed as a
   zero, so a month where nobody recorded page counts simply yields fewer
   entries instead of claiming nought pages were read.

   This half only decides WHAT the figures are. How they are arranged is
   moStats() below, and that differs per style — the strip used to be one
   shared band called identically from all five renderers, which made the
   busiest part of every collage byte-identical whichever style you picked. */
function monthStats(m: MonthData): Stat[] {
  const books = m.books
  if (!books.length) return []

  const out: Stat[] = [{ label: 'Books', value: String(books.length) }]

  const withPages = books.filter((b) => b.pages)
  if (withPages.length) {
    const total = withPages.reduce((s, b) => s + (b.pages || 0), 0)
    /* just the total. An earlier version appended "of 4" when only some books
       carried a count; on the card it read as a fraction rather than a caveat,
       so the figure is now plainly the pages we know about. */
    out.push({ label: 'Pages', value: total.toLocaleString() })
    out.push({ label: 'Longest', value: `${Math.max(...withPages.map((b) => b.pages || 0)).toLocaleString()} pages` })
  }

  const avg = books.reduce((s, b) => s + b.rating, 0) / books.length
  out.push({ label: 'Average', value: fmtRating(Math.round(avg / 0.25) * 0.25) })

  const best = books.reduce((a, b) => (b.rating > a.rating ? b : a))
  out.push({ label: 'Best', value: escapeHtml(best.title) })

  /* the format the month was mostly read in — a book counts once per format
     it carries, since a multi-format read genuinely happened in both */
  const tally = new Map<string, number>()
  for (const b of books) for (const f of b.formats) tally.set(f, (tally.get(f) || 0) + 1)
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top) out.push({ label: 'Mostly', value: escapeHtml(top[0]) })

  return out
}

/* Five arrangements of the same figures, one per style — the same fix the
   masthead got, for the same reason. Each is a thing that style's own object
   would actually carry: a rebate code, a shelf tail plate, a receipt total, a
   pinned chit, a register head. None hardcodes a count; they all take however
   many figures survived the test above. */
function moStats(m: MonthData, id: HeadId): string {
  const st = monthStats(m)
  if (!st.length) return ''

  /* C1 · the codes printed along the rebate of a strip of film: figure first,
     name of the figure after it, all on one running line. The tightest of the
     five on purpose — a contact sheet is mostly frames, and a tall band of
     cells above them is the thing pushing the frames down the card. */
  if (id === 'c1')
    return `<div class="mo-stats mo-stats--frame">
      ${st.map((x) => `<span class="mo-fr"><b>${x.value}</b><span class="lbl">${x.label}</span></span>`).join('')}
    </div>`

  /* C2 · the tail plate on a shelf: name left, a run of leader dots, figure
     hard right. Two columns, because a shelf is wide and a single column of
     six rows would stand taller than the rail underneath it. */
  if (id === 'c2')
    return `<div class="mo-stats mo-stats--plate">
      ${st.map((x) => `<div class="mo-pl"><span class="lbl">${x.label}</span><i></i><b>${x.value}</b></div>`).join('')}
    </div>`

  /* C3 · the totals block on a stub — narrow, right-aligned, boxed, with one
     line set below a doubled rule the way a total is. That line is the month's
     average, not simply the last figure: a total is a number, and whichever
     stat happened to be pushed last is usually "Mostly · Physical", which set
     large under a total rule reads as an accident rather than a sum. */
  if (id === 'c3') {
    const i = st.findIndex((x) => x.label === 'Average')
    const tail = i >= 0 ? st[i] : st[st.length - 1]
    const head = st.filter((x) => x !== tail)
    return `<div class="mo-stats mo-stats--stub">
      <div class="mo-stub-box">
        ${head.map((x) => `<div class="mo-sr"><span class="lbl">${x.label}</span><i></i><b>${x.value}</b></div>`).join('')}
        <div class="mo-sr is-total"><span class="lbl">${tail.label}</span><i></i><b>${tail.value}</b></div>
      </div>
    </div>`
  }

  /* C4 · a board does not print a strip, it has slips tacked to it. Each
     figure is its own chit at a slight alternating tilt, so the row reads as
     things put up by hand rather than as a table. */
  if (id === 'c4')
    return `<div class="mo-stats mo-stats--chits">
      ${st.map((x, i) => `<div class="mo-chit" style="--cr:${(i % 2 ? 1 : -1) * (1 + (i % 3) * 0.5)}deg"><b>${x.value}</b><span class="lbl">${x.label}</span></div>`).join('')}
    </div>`

  /* C6 · a customs declaration: a boxed form of ruled cells, each with its
     name printed small in the corner and the figure written into the cell.
     The grid is what makes it a form rather than a list. */
  if (id === 'c6')
    return `<div class="mo-stats mo-stats--customs">
      <div class="mo-cn"><span class="lbl">Declaration</span><span class="lbl">Flyleaf Press · CN22</span></div>
      <div class="mo-cells">
        ${st.map((x) => `<div class="mo-cell"><span class="lbl">${x.label}</span><b>${x.value}</b></div>`).join('')}
      </div>
    </div>`

  /* C7 · the lit ticker under a listings board: figures large and centred in
     their own columns, names beneath them, a run of lamps top and bottom. */
  if (id === 'c7')
    return `<div class="mo-stats mo-stats--ticker">
      <div class="mo-tick-row">
        ${st.map((x) => `<div class="mo-tick"><b>${x.value}</b><span class="lbl">${x.label}</span></div>`).join('')}
      </div>
    </div>`

  /* C5 · a register head: column names ruled across the top, figures aligned
     beneath them in tabular numerals. The ledger owns exactly one heavy rule
     and it lives under moHead, which is why this drops its own bottom border. */
  return `<div class="mo-stats mo-stats--register">
    <div class="mo-reg-row">${st.map((x) => `<span class="lbl">${x.label}</span>`).join('')}</div>
    <div class="mo-reg-row is-v">${st.map((x) => `<b>${x.value}</b>`).join('')}</div>
  </div>`
}

/* Columns scale with the month so a long month doesn't become a scroll: lists
   break into two, grids widen. No hardcoded month size anywhere — the counts
   below are thresholds, and any number of books is legal. */
function listCols(n: number): number {
  return n > 6 ? 2 : 1
}
function gridCols(n: number): number {
  /* three is right for an ordinary month; a heavy one would otherwise run the
     card down the page in a narrow ribbon, so the grid widens instead of the
     card growing taller */
  if (n > 18) return 5
  if (n > 12) return 4
  return 3
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
    ${moHead(m, 'c1')}
    ${moStats(m, 'c1')}
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
    ${moHead(m, 'c2')}
    ${moStats(m, 'c2')}
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
    ${moHead(m, 'c3')}
    ${moStats(m, 'c3')}
    <div class="c3-stack ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b, i) => `
        <div class="c3-t" style="--tr:${leans[i % leans.length] * 0.7}deg">
          ${cov(b)}
          <div style="min-width:0; padding-right:14px">
            <div class="c3-name">${escapeHtml(b.title)}</div>
            <div class="c3-adm">${escapeHtml(b.author)} · ${fmts(b)}</div>
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
    ${moHead(m, 'c4')}
    ${moStats(m, 'c4')}
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
    ${moHead(m, 'c5')}
    ${moStats(m, 'c5')}
    <div class="c5-tbl ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b) => `
        <div class="c5-r">
          ${cov(b)}
          <div style="min-width:0">
            <div class="c5-name">${escapeHtml(b.title)}</div>
            <div class="c5-fmt">${escapeHtml(b.author)} · ${fmts(b)}${b.pages ? ` · ${b.pages} pages` : ''}</div>
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

/* C6 · Postmark (manila) — each book franked and stuck down */
function postmark(m: MonthData): string {
  return `<article class="card c6" style="--rot:.6deg">
    ${patchC(140)}
    ${moHead(m, 'c6')}
    ${moStats(m, 'c6')}
    <div class="c6-sheet" style="--cols:${gridCols(m.books.length)}">
      ${m.books.map((b, i) => `
        <div class="c6-stamp" style="--sr:${leans[i % leans.length]}deg">
          <div class="c6-face">
            ${cov(b)}
            <span class="c6-perf" aria-hidden="true"></span>
            <span class="c6-val">${fmtRating(b.rating)}</span>
          </div>
          <div class="c6-cap">
            <div class="c6-name">${escapeHtml(b.title)}</div>
            <div class="c6-by">${escapeHtml(b.author)}</div>
            ${starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.5)')}
          </div>
        </div>`).join('')}
    </div>
  </article>`
}

/* C7 · Marquee (coal) — the month as a listings board, one line a film */
function marquee(m: MonthData): string {
  const cols = listCols(m.books.length)
  const ink = 'var(--mustard)', line = 'rgba(244,242,237,.5)'
  return `<article class="card c7" style="--rot:-.4deg">
    ${patchC(150)}
    ${moHead(m, 'c7')}
    ${moStats(m, 'c7')}
    <div class="c7-board ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b, i) => `
        <div class="c7-line">
          <span class="c7-no">${String(i + 1).padStart(2, '0')}</span>
          ${cov(b, 'c7-cov')}
          <div class="c7-mid">
            <div class="c7-name">${escapeHtml(b.title)}</div>
            <div class="c7-by">${escapeHtml(b.author)} · ${fmts(b)}</div>
          </div>
          <div class="c7-rate">
            <span class="r-num">${fmtRating(b.rating)}</span>
            <div>${starsS(b.rating, 10, ink, line)}</div>
          </div>
        </div>`).join('')}
    </div>
  </article>`
}

export const COLLAGE_RENDERERS: Record<CollageId, (m: MonthData) => string> = {
  contact,
  shelf,
  tickets,
  pinboard,
  ledger,
  postmark,
  marquee,
}

export function renderCollage(m: MonthData, style: CollageId): string {
  return COLLAGE_RENDERERS[style](m)
}

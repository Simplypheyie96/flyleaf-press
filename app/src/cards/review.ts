/* The seven review-card renderers — pure HTML-string generators, shared by the
   on-screen display and the share render so the saved image is exactly the
   card the user saw. Ported from the prototype with the confirmed fixes:
   plates live in a row at the bottom (a review without images simply has no
   row), the scrapbook margin note is gone, and the clip is the thin one. */

import type { Plate, Review, StyleId } from '../types'
import { FORMAT_NAMES } from '../types'
import { escapeHtml, fmtRating, paragraphs, prettyDate } from '../format'
import { ART, cancel, mark, patch, pclip, staple, starSvg } from './assets'

function starRow(r: number, size: number): string {
  let out = ''
  for (let i = 0; i < 5; i++) out += starSvg(Math.max(0, Math.min(1, r - i)), size)
  return `<div class="stars" role="img" aria-label="${fmtRating(r)} out of 5">${out}</div>`
}

function ratingBlock(r: number, size: number): string {
  return `<div class="rate">
      <span class="rate-num">${fmtRating(r)}</span>
      <span class="rate-of">/ 5</span>
    </div>
    ${starRow(r, size)}`
}

function fmtLine(rec: Review, stack?: boolean): string {
  return `<div class="fmt ${stack ? 'fmt--stack' : ''}">` +
    FORMAT_NAMES.map((k, i) =>
      `<span class="fmt-t" data-on="${rec.formats.includes(k)}">${k}</span>` +
      (i < FORMAT_NAMES.length - 1 ? `<span class="fmt-sep" aria-hidden="true">·</span>` : '')
    ).join('') + `</div>`
}

function meta(label: string, value: string): string {
  return `<div><div class="lbl">${label}</div><div class="val">${value}</div></div>`
}

/* The extent of the book, in the card's own register. Omitted entirely when
   nothing knew the length — the card never prints a guess or a dash. */
function pagesMeta(rec: Review): string {
  return rec.pages ? meta('Pages', String(rec.pages)) : ''
}

/* Real cover or nothing — no generated placeholder, ever. */
function cover(rec: Review, cls?: string): string {
  if (!rec.cover) {
    return `<div class="cover-missing ${cls || ''}">No cover · none found</div>`
  }
  return `<img class="cover ${cls || ''}" alt="Cover of ${escapeHtml(rec.title)}" src="${rec.cover}">`
}

function plateEl(p: Plate, rot: number, deco: string): string {
  const photo = p.image
    ? `<img class="plate-photo" alt="" src="${p.image}">`
    : `<svg class="plate-photo" viewBox="0 0 124 124" role="img" aria-label="Attached photo">${ART[p.art || 'spread']}</svg>`
  return `<figure class="plate" style="--prot:${rot}deg">
    ${deco === 'clip' ? pclip(18) : ''}
    ${deco === 'tape' ? `<span class="tape" aria-hidden="true"></span>` : ''}
    ${deco === 'tape2' ? `<span class="tape" aria-hidden="true"></span><span class="tape tape--r" aria-hidden="true"></span>` : ''}
    ${photo}
    <figcaption class="plate-cap">${escapeHtml(p.caption)}</figcaption>
  </figure>`
}

/* Plates pasted in a row at the foot of the review. No plates → no row. */
function plateRow(rec: Review): string {
  if (!rec.plates.length) return ''
  const rots = [-2.2, 1.6, -1.4, 2, -1.8]
  const decos = ['tape', 'clip', 'tape2', 'tape', 'clip']
  return `<div class="plate-row">` +
    rec.plates.map((p, i) => plateEl(p, rots[i % rots.length], decos[i % decos.length])).join('') +
    `</div>`
}

function body(rec: Review, marginTop: number): string {
  const ps = paragraphs(rec.body).map((p) => `<p>${escapeHtml(p)}</p>`).join('')
  /* a review can be a rating and two dates with nothing written — that is a
     complete record of having read something. Emit nothing at all rather than
     an empty div, whose top margin would leave the card hanging open. */
  if (!ps) return ''
  return `<div class="body" style="margin-top:${marginTop}px">${ps}</div>`
}

function colophon(rec: Review): string {
  return `<div class="colo">${mark(13)}<span>Flyleaf Press · Nº ${rec.no}</span></div>`
}

function seriesLine(rec: Review): string {
  if (!rec.series) return ''
  return rec.seriesNo ? `${escapeHtml(rec.series)} · ${escapeHtml(rec.seriesNo)}` : escapeHtml(rec.series)
}

/* ── S1 · Archive — the review as a stiff filed object (mustard) ── */
function archive(rec: Review): string {
  return `<article class="card card--mustard s1" style="--rot:-1.1deg">
    ${patch(150)}
    <div class="s1-rail">
      ${cover(rec, 's1-cover')}
      ${meta('Started', prettyDate(rec.started))}
      ${meta('Finished', prettyDate(rec.finished))}
      ${pagesMeta(rec)}
      <div><div class="lbl">Format</div><div style="margin-top:9px">${fmtLine(rec, true)}</div></div>
      ${rec.series ? meta('Series', `${escapeHtml(rec.series)}${rec.seriesNo ? '<br>' + escapeHtml(rec.seriesNo) : ''}`) : ''}
    </div>
    <div class="s1-main">
      <div class="s1-head">
        <div style="min-width:0">
          <h2 class="title">${escapeHtml(rec.title)}</h2>
          <div class="by" style="margin-top:8px">${escapeHtml(rec.author)}</div>
        </div>
        <div class="s1-rate">${ratingBlock(rec.rating, 24)}</div>
      </div>
      ${body(rec, 30)}
    </div>
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S2 · Masthead — the review as a printed page (butter) ── */
function masthead(rec: Review): string {
  return `<article class="card card--sage s2" style="--rot:.3deg">
    ${patch(170)}
    <div class="s2-head">
      <div class="s2-kicker">
        <span class="lbl">Review · Nº ${rec.no}</span>
        ${rec.series ? `<span class="lbl">${seriesLine(rec)}</span>` : ''}
      </div>
      <h2 class="title">${escapeHtml(rec.title)}</h2>
      <div class="by s2-by">${escapeHtml(rec.author)}</div>
      <div class="s2-cover-wrap">
        ${pclip(14)}
        ${cover(rec)}
      </div>
    </div>
    <hr class="hr s2-rule">
    <div class="s2-bar">
      <div class="s2-rate">${ratingBlock(rec.rating, 24)}</div>
      <div class="s2-meta">
        <div class="s2-meta-row">
          ${meta('Started', prettyDate(rec.started))}
          ${meta('Finished', prettyDate(rec.finished))}
          ${pagesMeta(rec)}
        </div>
        <div><div class="lbl">Format</div><div style="margin-top:8px">${fmtLine(rec)}</div></div>
      </div>
    </div>
    ${body(rec, 30)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S3 · Catalogue — the record entry, printed in negative (coal) ── */
function catalogue(rec: Review): string {
  return `<article class="card card--coal s3" style="--rot:-.8deg">
    ${patch(120)}
    <div class="s3-cover-wrap">
      ${pclip(16, -5)}
      ${cover(rec)}
    </div>
    <div class="s3-headroom">
      <h2 class="title">${escapeHtml(rec.title)}</h2>
      <span class="by">${escapeHtml(rec.author)}</span>
    </div>
    <div class="s3-tbl">
      <div class="s3-rate-row">${ratingBlock(rec.rating, 22)}</div>
      <div class="s3-row"><span class="lbl">Started</span><span class="val">${prettyDate(rec.started)}</span></div>
      <div class="s3-row"><span class="lbl">Finished</span><span class="val">${prettyDate(rec.finished)}</span></div>
      ${rec.pages ? `<div class="s3-row"><span class="lbl">Pages</span><span class="val">${rec.pages}</span></div>` : ''}
      ${rec.series ? `<div class="s3-row"><span class="lbl">Series</span><span class="val">${seriesLine(rec)}</span></div>` : ''}
      <div class="s3-row"><span class="lbl lbl--fmt">Format</span>${fmtLine(rec)}</div>
    </div>
    ${body(rec, 24)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S4 · Scrapbook — pasted, taped, torn (pink) ── */
function scrapbook(rec: Review): string {
  return `<article class="card card--pink s4" style="--rot:1.3deg">
    <span class="s4-washi-1" aria-hidden="true"></span>
    <span class="s4-washi-2" aria-hidden="true"></span>
    ${patch(140)}
    <div style="display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap">
      <div class="s4-cover" style="flex:0 0 auto; position:relative">
        ${pclip(12)}${cover(rec)}
      </div>
      <div style="flex:1; min-width:200px">
        <div class="s4-label">
          <h2 class="title">${escapeHtml(rec.title)}</h2>
          <span class="by">${escapeHtml(rec.author)}</span>
        </div>
        <div class="s4-bar" style="margin-top:20px">
          <div class="s4-rate">${ratingBlock(rec.rating, 24)}</div>
        </div>
      </div>
    </div>
    <div class="s4-bar">
      <div class="s4-meta">
        <div class="s4-meta-row">
          ${meta('Started', prettyDate(rec.started))}
          ${meta('Finished', prettyDate(rec.finished))}
          ${pagesMeta(rec)}
          ${rec.series ? meta('Series', seriesLine(rec)) : ''}
        </div>
        <div><div class="lbl">Format</div><div style="margin-top:8px">${fmtLine(rec)}</div></div>
      </div>
    </div>
    ${body(rec, 28)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S5 · Field Notes — the gridded lab leaf (blue) ── */
function fieldnotes(rec: Review): string {
  return `<article class="card card--blue s5" style="--rot:-.5deg">
    ${staple()}
    ${patch(130)}
    <div class="s5-kicker">
      <span class="lbl">Field notes · Entry ${rec.no}</span>
      ${rec.series ? `<span class="lbl">${seriesLine(rec)}</span>` : ''}
    </div>
    <h2 class="title">${escapeHtml(rec.title)}</h2>
    <span class="by">${escapeHtml(rec.author)}</span>
    <div class="s5-side">
      <div class="s5-cover" style="position:relative">${pclip(10)}${cover(rec)}</div>
      <div class="s5-detail">
        <div class="s5-grid">
          <span class="lbl">Started</span><span class="val">${prettyDate(rec.started)}</span>
          <span class="lbl">Finished</span><span class="val">${prettyDate(rec.finished)}</span>
          ${rec.pages ? `<span class="lbl">Pages</span><span class="val">${rec.pages}</span>` : ''}
          <span class="lbl lbl--fmt">Format</span>${fmtLine(rec)}
        </div>
        <div class="s5-rate">${ratingBlock(rec.rating, 22)}</div>
      </div>
    </div>
    ${body(rec, 24)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S6 · Dust Jacket — the review as the book's own jacket (coal) ──
   The band bleeds to the card edges on purpose: a jacket is printed across
   the whole sheet and folded in, so a band with the card's padding around it
   would read as a box drawn on paper rather than as the thing itself. */
function jacket(rec: Review): string {
  return `<article class="card card--aubergine s6" style="--rot:.6deg">
    ${patch(150)}
    <div class="s6-band">
      <div class="s6-kick">
        <span class="lbl">Flyleaf Press</span>
        <span class="lbl">Nº ${rec.no}</span>
      </div>
      <h2 class="title s6-title">${escapeHtml(rec.title)}</h2>
      <div class="by s6-by">${escapeHtml(rec.author)}</div>
    </div>
    <div class="s6-panel">
      <div class="s6-front">${cover(rec)}</div>
      <div class="s6-flap">
        <div class="s6-rate">${ratingBlock(rec.rating, 22)}</div>
        <div class="s6-grid">
          <span class="lbl">Started</span><span class="val">${prettyDate(rec.started)}</span>
          <span class="lbl">Finished</span><span class="val">${prettyDate(rec.finished)}</span>
          ${rec.pages ? `<span class="lbl">Pages</span><span class="val">${rec.pages}</span>` : ''}
          ${rec.series ? `<span class="lbl">Series</span><span class="val">${seriesLine(rec)}</span>` : ''}
          <span class="lbl lbl--fmt">Format</span>${fmtLine(rec)}
        </div>
      </div>
    </div>
    ${body(rec, 28)}
    ${plateRow(rec)}
    <div class="s6-foot">
      <span class="s6-bars" aria-hidden="true"></span>
      ${colophon(rec)}
    </div>
  </article>`
}

/* ── S7 · Airmail — the review as a letter sent home (butter) ──
   Plain labels: Started, Finished, Pages, Series. "Posted / Delivered /
   Weight / Route" renamed the facts to keep the metaphor going, and the
   metaphor did not need the help — the barred edge, the par-avion line, the
   stamp and the cancellation carry it. What it cost was legibility: "Posted"
   beside a date reads as when the REVIEW went out, which is not what the
   date is, and "Weight" for a page count is a small lie about the unit.
   The barred edge is four positioned strips rather than a border-image: the
   card is rasterized by inlining computed styles, and four plain repeating
   gradients survive that trip where a border-image is a gamble. */
function airmail(rec: Review): string {
  return `<article class="card s7" style="--rot:-.7deg">
    <span class="s7-edge" aria-hidden="true"><i class="e-t"></i><i class="e-r"></i><i class="e-b"></i><i class="e-l"></i></span>
    ${patch(130)}
    <div class="s7-top">
      <div class="s7-from">
        <span class="lbl">Par avion · By air mail</span>
        <h2 class="title s7-title">${escapeHtml(rec.title)}</h2>
        <div class="by">${escapeHtml(rec.author)}</div>
        <div class="s7-addr">
          <div><span class="lbl">Started</span><span class="val">${prettyDate(rec.started)}</span></div>
          <div><span class="lbl">Finished</span><span class="val">${prettyDate(rec.finished)}</span></div>
          ${rec.pages ? `<div><span class="lbl">Pages</span><span class="val">${rec.pages}</span></div>` : ''}
          ${rec.series ? `<div><span class="lbl">Series</span><span class="val">${seriesLine(rec)}</span></div>` : ''}
        </div>
        <div class="s7-fmt">${fmtLine(rec)}</div>
        <div class="s7-rate">${ratingBlock(rec.rating, 22)}</div>
      </div>
      <div class="s7-stamp">
        ${cover(rec)}
        <span class="s7-perf" aria-hidden="true"></span>
        ${cancel(prettyDate(rec.finished))}
      </div>
    </div>
    ${body(rec, 26)}
    ${plateRow(rec)}
    <div class="s7-sign">
      <div class="s7-rule"><span class="lbl">Signed</span></div>
    </div>
    ${colophon(rec)}
  </article>`
}

export const REVIEW_RENDERERS: Record<StyleId, (rec: Review) => string> = {
  archive,
  masthead,
  catalogue,
  scrapbook,
  fieldnotes,
  jacket,
  airmail,
}

export function renderReviewCard(rec: Review, style?: StyleId): string {
  return REVIEW_RENDERERS[style || rec.style](rec)
}

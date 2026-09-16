/* The seven review-card renderers — pure HTML-string generators, shared by the
   on-screen display and the share render so the saved image is exactly the
   card the user saw. Ported from the prototype with the confirmed fixes:
   plates live in a row at the bottom (a review without images simply has no
   row), the scrapbook margin note is gone, and the clip is the thin one. */

import type { Plate, Review, StyleId } from '../types'
import { FORMAT_NAMES } from '../types'
import { escapeHtml, fmtRating, paragraphs, prettyDate } from '../format'
import { handVars } from '../fonts'
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

/* Every format is listed and the chosen ones carry data-on; how that mark is
   DRAWN is each style's own business (a tick box, a highlighter swipe, a
   stamp), never an underline. The separator dot is optional because the styles
   that give each format its own cell already have a boundary between them. */
function fmtRow(rec: Review, cls = '', sep = true): string {
  return `<div class="fmt ${cls}">` +
    FORMAT_NAMES.map((k, i) =>
      `<span class="fmt-t" data-on="${rec.formats.includes(k)}">${k}</span>` +
      (sep && i < FORMAT_NAMES.length - 1 ? `<span class="fmt-sep" aria-hidden="true">·</span>` : '')
    ).join('') + `</div>`
}

function fmtLine(rec: Review, stack?: boolean): string {
  return fmtRow(rec, stack ? 'fmt--stack' : '')
}

function meta(label: string, value: string, cls = ''): string {
  return `<div${cls ? ` class="${cls}"` : ''}><div class="lbl">${label}</div><div class="val">${value}</div></div>`
}

/* The extent of the book, in the card's own register. Omitted entirely when
   nothing knew the length — the card never prints a guess or a dash. */
function pagesMeta(rec: Review): string {
  return rec.pages ? meta('Pages', String(rec.pages)) : ''
}
/* What the book is about, in the catalogues' own words. The separator binds to
   the phrase BEFORE it with a non-breaking space, so a lane narrow enough to
   wrap can never start a line with a dot. Omitted whole when nothing came
   back — the same rule the page count takes. */
function tagsText(rec: Review): string {
  return (rec.tags ?? []).map(escapeHtml).join('&nbsp;· ')
}
function tagsMeta(rec: Review, cls = ''): string {
  return rec.tags?.length ? meta('Tags', tagsText(rec), cls) : ''
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

function body(rec: Review, marginTop: number, cls = ''): string {
  const ps = paragraphs(rec.body).map((p) => `<p>${escapeHtml(p)}</p>`).join('')
  /* a review can be a rating and two dates with nothing written — that is a
     complete record of having read something. Emit nothing at all rather than
     an empty div, whose top margin would leave the card hanging open. */
  if (!ps) return ''
  return `<div class="body ${cls}" style="margin-top:${marginTop}px">${ps}</div>`
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
  return `<article class="card card--mustard s1" style="--rot:-1.1deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
    ${patch(150)}
    <div class="s1-rail">
      ${cover(rec, 's1-cover')}
      ${meta('Started', prettyDate(rec.started))}
      ${meta('Finished', prettyDate(rec.finished))}
      ${pagesMeta(rec)}
      <div><div class="lbl">Format</div><div style="margin-top:9px">${fmtLine(rec, true)}</div></div>
      ${rec.series ? meta('Series', `${escapeHtml(rec.series)}${rec.seriesNo ? '<br>' + escapeHtml(rec.seriesNo) : ''}`) : ''}
      ${tagsMeta(rec)}
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
  return `<article class="card card--sage s2" style="--rot:.3deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
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
        ${tagsMeta(rec)}
      </div>
    </div>
    ${body(rec, 30)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S3 · Catalogue — the record entry, printed in negative (coal).

   The jacket used to be a small absolutely-positioned block pinned to the top
   right, straddling the card's own edge — 112px of cover floating above the
   title with the whole record set underneath it. It read as a thumbnail that
   had come loose, and it was the smallest cover in the set on the one card
   whose metaphor is a catalogue entry, where the plate belongs beside the
   entry. It is now in the flow and nearly twice the width: one row, the
   identification and the table on the left, the jacket on the right, top
   aligned with the title. ── */
function catalogue(rec: Review): string {
  return `<article class="card card--coal s3" style="--rot:-.8deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
    ${patch(120)}
    <div class="s3-top">
      <div class="s3-id">
        <h2 class="title">${escapeHtml(rec.title)}</h2>
        <span class="by">${escapeHtml(rec.author)}</span>
      </div>
      <div class="s3-cover-wrap">
        ${pclip(14)}
        ${cover(rec)}
      </div>
      <div class="s3-tbl">
        <div class="s3-rate-row">${ratingBlock(rec.rating, 22)}</div>
        <div class="s3-row"><span class="lbl">Started</span><span class="val">${prettyDate(rec.started)}</span></div>
        <div class="s3-row"><span class="lbl">Finished</span><span class="val">${prettyDate(rec.finished)}</span></div>
        ${rec.pages ? `<div class="s3-row"><span class="lbl">Pages</span><span class="val">${rec.pages}</span></div>` : ''}
        ${rec.series ? `<div class="s3-row"><span class="lbl">Series</span><span class="val">${seriesLine(rec)}</span></div>` : ''}
        <div class="s3-row"><span class="lbl lbl--fmt">Format</span>${fmtLine(rec)}</div>
        ${rec.tags?.length ? `<div class="s3-row"><span class="lbl">Tags</span><span class="val">${tagsText(rec)}</span></div>` : ''}
      </div>
    </div>
    ${body(rec, 24)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S4 · Scrapbook — pasted, taped, torn (pink) ── */
function scrapbook(rec: Review): string {
  return `<article class="card card--seaglass s4" style="--rot:1.3deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
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
        ${tagsMeta(rec)}
      </div>
    </div>
    ${body(rec, 28)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S5 · Field Notes — the gridded lab leaf (blue) ── */
function fieldnotes(rec: Review): string {
  return `<article class="card card--blue s5" style="--rot:-.5deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
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
          ${rec.tags?.length ? `<span class="lbl">Tags</span><span class="val">${tagsText(rec)}</span>` : ''}
        </div>
        <div class="s5-rate">${ratingBlock(rec.rating, 22)}</div>
      </div>
    </div>
    ${body(rec, 24)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S6 · Dust Jacket — the review as the book's own jacket (lilac) ──
   The band bleeds to the card edges on purpose: a jacket is printed across
   the whole sheet and folded in, so a band with the card's padding around it
   would read as a box drawn on paper rather than as the thing itself.

   Lilac sheet, aubergine band. It was an aubergine sheet under a mustard band,
   i.e. purple and yellow, and it was also a second near-black beside
   Catalogue's coal in the style picker — one change answers both. */
function jacket(rec: Review): string {
  return `<article class="card card--lilac s6" style="--rot:.6deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
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
          ${rec.tags?.length ? `<span class="lbl">Tags</span><span class="val">${tagsText(rec)}</span>` : ''}
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
  return `<article class="card s7" style="--rot:-.7deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
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
          ${rec.tags?.length ? `<div><span class="lbl">Tags</span><span class="val">${tagsText(rec)}</span></div>` : ''}
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

/* ── S8 · Herbarium — the book mounted the way a pressed specimen is (mint).
   The frame is the sheet's own ruled border and the slip below it is the
   thing filled in by hand afterwards. The slip is headed "The reading" and
   its rows are Started / Finished / Pages / Rating: the mount, the corners
   and the frame carry the metaphor, so the facts do not have to. ── */
function herbarium(rec: Review): string {
  return `<article class="card card--mint hb" style="--rot:-.5deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
    ${patch(160)}
    <div class="hb-frame" aria-hidden="true"></div>
    <div class="hb-top">
      <div class="hb-mount">
        ${cover(rec, 'hb-cover')}
        <span class="hb-corner hb-corner--0" aria-hidden="true"></span>
        <span class="hb-corner hb-corner--1" aria-hidden="true"></span>
        <span class="hb-corner hb-corner--2" aria-hidden="true"></span>
        <span class="hb-corner hb-corner--3" aria-hidden="true"></span>
      </div>
      <div class="hb-id">
        <div class="lbl hb-kick">Herbarium of read things</div>
        <h2 class="title hb-title">${escapeHtml(rec.title)}</h2>
        <div class="by hb-by">${escapeHtml(rec.author)}</div>
        ${rec.series ? `<div class="hb-series lbl">${seriesLine(rec)}</div>` : ''}
      </div>
    </div>
    <div class="hb-det">
      <div class="hb-det-head">
        <span class="lbl">The reading</span>
        <span class="lbl">Nº ${rec.no}</span>
      </div>
      <div class="hb-det-grid">
        ${meta('Started', prettyDate(rec.started))}
        ${meta('Finished', prettyDate(rec.finished))}
        ${pagesMeta(rec)}
        ${meta('Rating', `${fmtRating(rec.rating)} / 5`)}
        ${tagsMeta(rec, 'ct-tags')}
      </div>
      <div class="hb-det-foot">
        <div class="hb-det-fmt">
          <span class="lbl">Format</span>
          ${fmtRow(rec, 'hb-fmt', false)}
        </div>
        ${starRow(rec.rating, 19)}
      </div>
    </div>
    ${body(rec, 30)}
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S9 · Broadside — the review as a hand-set poster (newsprint). Type is the
   whole design: the title is the largest thing on any of the twelve cards,
   and the cover is a small cut set into the text rather than a picture the
   words have to work around. ── */
function broadside(rec: Review): string {
  return `<article class="card card--salmon bs" style="--rot:.4deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
    ${patch(190)}
    <div class="lbl bs-kick">Read and set in type · Nº ${rec.no}</div>
    <hr class="bs-rule bs-rule--fat">
    <h2 class="title bs-title">${escapeHtml(rec.title)}</h2>
    <hr class="bs-rule">
    <div class="by bs-by">${escapeHtml(rec.author)}</div>
    <hr class="bs-rule bs-rule--fat">
    <div class="bs-bar">
      <div class="bs-rate">${ratingBlock(rec.rating, 22)}</div>
      <div class="bs-facts">
        ${meta('Started', prettyDate(rec.started))}
        ${meta('Finished', prettyDate(rec.finished))}
        ${pagesMeta(rec)}
        ${rec.series ? meta('Series', seriesLine(rec)) : ''}
        ${tagsMeta(rec, 'ct-tags')}
      </div>
    </div>
    ${fmtRow(rec, 'bs-fmt')}
    <hr class="bs-rule">
    <div class="bs-set">
      <div class="bs-cut">${cover(rec)}</div>
      ${body(rec, 0, 'bs-body')}
    </div>
    ${plateRow(rec)}
    ${colophon(rec)}
  </article>`
}

/* ── S10 · J-card — the review folded into a cassette insert (apricot). The
   spine is the only place in the app where type runs vertically, and the
   tracks are the reading's facts listed the way a tape lists its songs. ── */
function jcard(rec: Review): string {
  const track = (label: string, value: string, cls = '') =>
    `<div class="jc-track${cls}"><span class="lbl">${label}</span><i aria-hidden="true"></i><span class="jc-val">${value}</span></div>`
  return `<article class="card card--apricot jc" style="--rot:-.7deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
    <div class="jc-spine">
      <span>${escapeHtml(rec.title)}</span>
      <span class="jc-spine-by">${escapeHtml(rec.author)}</span>
    </div>
    <div class="jc-main">
      ${patch(150)}
      <div class="jc-top">
        <div class="jc-front">${cover(rec)}</div>
        <div class="jc-id">
          <div class="lbl">Side A · Nº ${rec.no}</div>
          <h2 class="title jc-title">${escapeHtml(rec.title)}</h2>
          <div class="by">${escapeHtml(rec.author)}</div>
          ${rec.series ? `<div class="lbl jc-series">${seriesLine(rec)}</div>` : ''}
          <div class="jc-rate">${ratingBlock(rec.rating, 20)}</div>
        </div>
      </div>
      <div class="jc-tracks">
        ${track('01 · Started', prettyDate(rec.started))}
        ${track('02 · Finished', prettyDate(rec.finished))}
        ${rec.pages ? track('03 · Pages', String(rec.pages)) : ''}
        ${rec.tags?.length ? track('04 · Tags', tagsText(rec), ' jc-track--tags') : ''}
      </div>
      <div class="jc-fmt-row">
        <span class="lbl">Format</span>
        ${fmtRow(rec, 'jc-fmt', false)}
      </div>
      ${body(rec, 24)}
      ${plateRow(rec)}
      ${colophon(rec)}
    </div>
  </article>`
}

/* ── S11 · Passport — the reading as a border crossing (quartz). The stamps
   say STARTED and FINISHED, not ENTRY and EXIT — the rectangular stamp, the
   guilloche and the machine-readable strip are the crossing, and a date
   relabelled is only a date the reader has to translate. They are
   RECTANGULAR entry stamps, never the round cancellation ring: that device
   belongs to the airmail card and to the Postmark collage, and a third card
   wearing it would make all three read as one style. They sit in a wrapping
   flex row rather than absolutely, because the data column is ~430px wide on
   a full card and ~176px compact — two stamps cannot be pinned side by side
   at a width that is not known here. ── */
function passport(rec: Review): string {
  /* the machine-readable strip: A–Z and 0–9 survive, everything else becomes
     the filler chevron, and the line is padded to a fixed length so both rows
     end level. Escaped last, because "<" is the filler AND the tag opener. */
  const mrz = (s: string, n: number) =>
    (s.toUpperCase().replace(/[^A-Z0-9]+/g, '<').slice(0, n) + '<'.repeat(n))
      .slice(0, n)
      .replace(/</g, '&lt;')

  const stamp = (label: string, date: string, rot: number) => {
    const p = (date || '').split(' ')
    return `<svg class="pp-stamp" style="transform:rotate(${rot}deg)" width="158" height="76"
      viewBox="0 0 158 76" fill="none" aria-hidden="true">
      <rect x="1.4" y="1.4" width="155.2" height="73.2" stroke="currentColor" stroke-width="1.6" opacity=".7"/>
      <rect x="6.5" y="6.5" width="145" height="63" stroke="currentColor" stroke-width="1" opacity=".5"/>
      <text x="79" y="24" text-anchor="middle" fill="currentColor" opacity=".78"
        font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="2.4">${label}</text>
      <text x="79" y="47" text-anchor="middle" fill="currentColor" opacity=".92"
        font-family="IBM Plex Mono, monospace" font-size="15">${escapeHtml(p.slice(0, 2).join(' '))}</text>
      <text x="79" y="63" text-anchor="middle" fill="currentColor" opacity=".7"
        font-family="IBM Plex Mono, monospace" font-size="11" letter-spacing="1.6">${escapeHtml(p[2] || '')}</text>
    </svg>`
  }

  const line = (label: string, value: string) =>
    `<div class="pp-line"><span class="lbl">${label}</span><span class="pp-val">${value}</span></div>`

  return `<article class="card card--quartz pp" style="--rot:.5deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
    <div class="pp-guilloche" aria-hidden="true"></div>
    <div class="pp-in">
      ${patch(170)}
      <div class="pp-head">
        <span class="lbl">Flyleaf Press · Reader's passport</span>
        <span class="lbl">Nº ${rec.no}</span>
      </div>
      <hr class="pp-rule">
      <div class="pp-top">
        <div class="pp-photo">${cover(rec)}</div>
        <div class="pp-data">
          <h2 class="title pp-title">${escapeHtml(rec.title)}</h2>
          ${line('Author', escapeHtml(rec.author))}
          ${rec.series ? line('Series', seriesLine(rec)) : ''}
          ${rec.pages ? line('Pages', String(rec.pages)) : ''}
          ${rec.tags?.length ? line('Tags', tagsText(rec)) : ''}
          <div class="pp-line pp-line--rate">
            <span class="lbl">Rating</span>
            <span class="pp-val"><span class="r-num">${fmtRating(rec.rating)}</span>${starRow(rec.rating, 17)}</span>
          </div>
        </div>
      </div>
      <div class="pp-stamps">
        ${stamp('STARTED', prettyDate(rec.started), -2)}
        ${stamp('FINISHED', prettyDate(rec.finished), 1.6)}
      </div>
      <div class="pp-fmt-row">
        <span class="lbl">Format</span>
        ${fmtRow(rec, 'pp-fmt', false)}
      </div>
      <div class="pp-mrz">
        <div>P&lt;FLYPRESS&lt;${mrz(rec.title, 30)}</div>
        <div>${mrz(rec.author, 20)}${mrz(String(rec.no), 4)}${mrz((rec.finished || '').replace(/-/g, ''), 10)}</div>
      </div>
      ${body(rec, 26)}
      ${plateRow(rec)}
      ${colophon(rec)}
    </div>
  </article>`
}

/* ── S12 · Specimen — the book set as a type specimen sheet (teal). The
   rating is the point size, so the card's own showing gets larger the more
   the book was liked. The table used to be labelled as a foundry would label
   it — Cut by / Extent / Family — which is the dust jacket's "Extent" fault
   again: trade language on a card somebody hands to a friend. Plain Author /
   Started / Finished / Pages / Series.

   The showing is the metaphor, and there is exactly ONE of it. The card used
   to print the title four times — once at display size and again at 30, 19
   and 13px as a waterfall — which is what a foundry does to show a face at
   every size, and is nonsense when the thing being set is the name of a book.
   It read as a bug, not as a specimen. ── */
function specimen(rec: Review): string {
  const row = (label: string, value: string) =>
    `<div class="ts-row"><span class="lbl">${label}</span><span class="ts-val">${value}</span></div>`
  return `<article class="card card--teal ts" style="--rot:-.3deg;${handVars(rec.hand)}" data-hand="${rec.hand ?? 'kalam'}">
    ${patch(200)}
    <div class="ts-head">
      <span class="lbl">Specimen sheet · Nº ${rec.no}</span>
      <span class="lbl">${fmtRating(rec.rating)} / 5</span>
    </div>
    <hr class="ts-rule ts-rule--fat">
    <div class="ts-showing">
      <span class="ts-pt ts-pt--big">72</span>
      <div class="ts-display">${escapeHtml(rec.title)}</div>
    </div>
    <hr class="ts-rule">
    <div class="ts-cols">
      <div class="ts-table">
        ${row('Author', escapeHtml(rec.author))}
        ${row('Started', prettyDate(rec.started))}
        ${row('Finished', prettyDate(rec.finished))}
        ${rec.pages ? row('Pages', String(rec.pages)) : ''}
        ${rec.series ? row('Series', seriesLine(rec)) : ''}
        ${rec.tags?.length ? row('Tags', tagsText(rec)) : ''}
      </div>
      <figure class="ts-cut">
        ${cover(rec)}
        <figcaption class="lbl">Cover</figcaption>
      </figure>
    </div>
    <div class="ts-fmt-row">
      <span class="lbl">Format</span>
      ${fmtRow(rec, 'ts-fmt', false)}
    </div>
    <div class="ts-sample">
      <span class="lbl">Rating</span>
      ${starRow(rec.rating, 20)}
    </div>
    ${body(rec, 14)}
    ${plateRow(rec)}
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
  herbarium,
  broadside,
  jcard,
  passport,
  specimen,
}

export function renderReviewCard(rec: Review, style?: StyleId): string {
  return REVIEW_RENDERERS[style || rec.style](rec)
}

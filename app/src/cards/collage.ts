/* The seven monthly-collage renderers — pure HTML-string generators over the
   month's finished reviews. Flexible to any month size; a month can be viewed
   (and shared) at any point, not only at its end. */

import type { CollageId, Review } from '../types'
import { SHAPE_CARD_W } from '../types'
import { escapeHtml, fmtRating, monthKey, monthName } from '../format'
import { mark, starSvg } from './assets'

export interface MonthData {
  name: string
  books: Review[]
  /* A year is rendered by these same seven styles, and deliberately so: they
     are seven printed objects, not seven month-shaped ones, and a contact
     sheet or a listings board holds a year as readily as it holds a March.
     Seven more renderers would make twenty-one, triple the QA surface, and add
     no idea. What genuinely differs over a year is the arithmetic — "Mostly ·
     Physical" says almost nothing across a hundred books, while "Busiest ·
     March" says something no month card can — so the span changes the STATS
     and nothing else. */
  /* And a month's HOPEFULS are rendered by the same seven, for the same
     reason plus one more: the point of the list is to hand it to somebody, and
     the object it is handed on should be one of the seven this app already
     makes. What the span takes away is the VERDICT — a book nobody has read
     yet has no rating, and printing 0.0 under a row of empty stars would be
     inventing an opinion, which is the one thing the review form refuses to
     do. Each style says "not yet" in its own words instead. */
  span?: 'month' | 'year' | 'hopefuls'
  /* Whether this card is being composed on the BROAD column (Large card,
     988px) rather than the standard 688px one every screen shows.

     It is here because the wider card exists to hold MORE, not to draw the
     same thing bigger. The aspect fit below is scale-invariant — a cell and
     the row it sits in both grow with the card, so the leaf's proportions come
     out identical — which means the chooser, left to itself, hands the broad
     column the same column count and simply inflates every cover. That was the
     complaint. `wide` is the one fact that lets the count move. */
  wide?: boolean
}

/* Whether this card is a list of intentions rather than a record of reading.
   Read at every site that would otherwise print a rating. */
function tbr(m: MonthData): boolean {
  return m.span === 'hopefuls'
}

function starsS(r: number, size: number, fillCol: string, lineCol: string): string {
  let out = ''
  for (let i = 0; i < 5; i++) out += starSvg(Math.max(0, Math.min(1, r - i)), size, fillCol, lineCol)
  return `<span class="stars-s" role="img" aria-label="${fmtRating(r)} out of 5">${out}</span>`
}

/* Same clipped patch as the review cards: the rosette is "clipped to the card
   rectangle" by design, and letting the collage copies bleed past the edge was
   an inconsistency — and the sole reason the export mat had to be 50px. */
function patchC(size: number): string {
  return `<span class="patch-wrap" aria-hidden="true"><span class="patch">${mark(size)}</span></span>`
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
  /* A hopefuls card counts hopefuls. The per-style nouns below describe the
     OBJECT the count is printed on — frames on a contact sheet, spines on a
     shelf — and a frame is still a frame whether the book behind it has been
     read; but "6 frames" on a list of intentions never says what the list is,
     and that is the first thing somebody handed the card needs to know. So the
     count phrase carries it, in every style. */
  const hope = `${n} hopeful${n === 1 ? '' : 's'}`
  const num = (noun: string) => (tbr(m) ? hope : noun)

  /* C1 · a contact sheet is labelled on its own edge, so the kicker sits above
     the month and the count is in frames */
  if (id === 'c1')
    return `<div class="mo-head mo-head--c1">
      <div class="mo-kick">Contact sheet · Flyleaf Press</div>
      <div class="mo-title">${t}</div>
      <div class="mo-sub">${mark(13)}<span class="lbl">${num(`${n} frame${n === 1 ? '' : 's'}`)}</span></div>
    </div>`

  /* C2 · the mark leads, and the head closes on a drawn shelf edge with the
     count sitting on it — the same rail the covers stand on below */
  if (id === 'c2')
    return `<div class="mo-head mo-head--c2">
      <div class="mo-line">${mark(15)}<div class="mo-title">${t}</div></div>
      <div class="mo-edge"><span class="lbl">${num(`${n} spine${n === 1 ? '' : 's'}`)}</span></div>
    </div>`

  /* C3 · centred and perforated, like the top of a stub book */
  if (id === 'c3')
    return `<div class="mo-head mo-head--c3">
      <div class="mo-kick">Box office · Flyleaf Press</div>
      <div class="mo-title">${t}</div>
      <div class="mo-perf"></div>
      <div class="mo-sub">${mark(13)}<span class="lbl">${num(`${n} stub${n === 1 ? '' : 's'}`)}</span></div>
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
        <div class="mo-sub">${mark(12)}<span class="lbl">${num(`${n} pinned`)}</span></div>
      </div>
    </div>`

  /* C6 · a customs slip: the airmail label to the left of the month, and the
     count in stamps, because that is what is stuck to the sheet below */
  if (id === 'c6')
    return `<div class="mo-head mo-head--c6">
      <div class="mo-air"><span class="lbl">Par avion</span><span class="lbl">By air mail</span></div>
      <span class="mo-bars" aria-hidden="true"></span>
      <div class="mo-line">${mark(14)}<div class="mo-title">${t}</div></div>
      <div class="mo-sub"><span class="lbl">${num(`${n} stamp${n === 1 ? '' : 's'} affixed`)}</span></div>
    </div>`

  /* C7 · a listings board is lit from its own frame, so the head sits between
     two runs of lamps and is centred under them — nothing else here centres */
  if (id === 'c7')
    return `<div class="mo-head mo-head--c7">
      <div class="mo-lamps" aria-hidden="true"></div>
      <div class="mo-kick">Now showing · Flyleaf Press</div>
      <div class="mo-title">${t}</div>
      <div class="mo-sub">${mark(13)}<span class="lbl">${num(`${n} feature${n === 1 ? '' : 's'}`)}</span></div>
      <div class="mo-lamps" aria-hidden="true"></div>
    </div>`

  /* C5 · a register head: month left, the range of entries right, one heavy
     rule under the pair — and that rule is the only one, which is why the
     stats strip drops its own bottom border on this style */
  return `<div class="mo-head mo-head--c5">
    <div class="mo-line">${mark(13)}<div class="mo-title">${t}</div></div>
    <span class="lbl">${num(`Entries 01–${String(n).padStart(2, '0')}`)}</span>
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
  const isYear = m.span === 'year'

  /* The count is the head's, not the strip's. Every style's count line already
     carries it in the object's own words — "7 hopefuls" — and pushing a
     "Hopefuls · 7" cell here printed the same figure twice on one card, inches
     apart. A month card does not have that problem: its head says "7 frames"
     and its strip says "Books · 7", which are two different facts. */
  const out: Stat[] = tbr(m) ? [] : [{ label: 'Books', value: String(books.length) }]

  const withPages = books.filter((b) => b.pages)
  if (withPages.length) {
    const total = withPages.reduce((s, b) => s + (b.pages || 0), 0)
    /* just the total. An earlier version appended "of 4" when only some books
       carried a count; on the card it read as a fraction rather than a caveat,
       so the figure is now plainly the pages we know about. */
    out.push({ label: 'Pages', value: total.toLocaleString() })
    out.push({ label: 'Longest', value: `${Math.max(...withPages.map((b) => b.pages || 0)).toLocaleString()} pages` })
  }

  /* Every figure from here down is derived from the ratings, and a hopefuls
     card has none — an average of nothing is not 0.0, it is nothing, and the
     same rule that drops a missing page total drops these. What a list of
     intentions can say instead is how many hands it spreads across, and only
     when that is more than one: "Authors · 1" beside a count line reading "1
     hopeful" is the same fact printed twice. */
  if (tbr(m)) {
    const who = new Set(books.map((b) => b.author.trim().toLowerCase())).size
    if (who > 1) out.push({ label: 'Authors', value: String(who) })
    return out
  }

  const avg = books.reduce((s, b) => s + b.rating, 0) / books.length
  out.push({ label: 'Average', value: fmtRating(Math.round(avg / 0.25) * 0.25) })

  const best = books.reduce((a, b) => (b.rating > a.rating ? b : a))
  out.push({ label: 'Best', value: escapeHtml(best.title) })

  /* The last figure is the one the span changes.

     Over a month, the format it was mostly read in is a real characteristic of
     those few weeks. Over a year it is very nearly always whichever format the
     reader simply prefers, which the card's own owner already knows and a
     stranger learns nothing from — the sort of statistic that makes a year look
     like a long month. Which month carried the most books is the opposite: it
     only exists at this span, and it is the shape of the reading year. */
  if (isYear) {
    const per = new Map<string, number>()
    for (const b of books) {
      const k = monthKey(b.finished)
      per.set(k, (per.get(k) || 0) + 1)
    }
    const busiest = [...per.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
    /* Every book in a year collage has a finished date by construction, so
       `busiest` is only ever missing when there are no books — and that case
       returned above. The guard is for the type, not for a real state. */
    if (busiest) {
      /* the month alone, not "March 2026" — the card's title is already the
         year, and repeating it inside a statistic reads as a mistake */
      out.push({ label: 'Busiest', value: `${escapeHtml(monthName(busiest[0]).split(' ')[0])} · ${busiest[1]}` })
    }
    return out
  }

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
    /* on a hopefuls stub there is no average, and the pages ahead are the
       figure a total rule belongs under */
    const i = st.findIndex((x) => x.label === (tbr(m) ? 'Pages' : 'Average'))
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
     and it lives under moHead, which is why this drops its own bottom border.

     It is also the one style whose card carries a TOTAL line of its own, and
     that line is the page total — so the strip drops its Pages cell rather
     than printing 3,129 twice on one card, a foot apart. The same relocation
     the stub makes, which pulls Pages out of the box and sets it under the
     doubled rule. */
  const reg = st.filter((x) => x.label !== 'Pages')
  return `<div class="mo-stats mo-stats--register">
    <div class="mo-reg-row">${reg.map((x) => `<span class="lbl">${x.label}</span>`).join('')}</div>
    <div class="mo-reg-row is-v">${reg.map((x) => `<b>${x.value}</b>`).join('')}</div>
  </div>`
}

/* HOW MANY TO A ROW — chosen for the SHAPE OF THE FINISHED PICTURE, not from a
   threshold table.

   The old rule was three-to-a-row until thirteen books, and it was wrong in the
   one way that matters for a card whose whole job is being posted: it let the
   month decide the height and never looked at the width. Measured on the 1020px
   export leaf, a ten-book contact sheet came out 2.25 TIMES TALLER THAN WIDE,
   and a twelve-book one the same — a ribbon, cropped to a sliver by every feed
   it is handed to. Widening the grid instead costs nothing: the same ten books
   five-to-a-row measure 0.87, i.e. very nearly square.

   So the count is scored, and the score has exactly two terms.

   1. HOW CLOSE THE LEAF LANDS TO A POSTABLE SHAPE. The card's height is
      overwhelmingly a function of rows ÷ columns, because a cell is a cover at a
      fixed aspect and the head, the statistics strip and the colophon are a
      constant. Fitted against real exports of the grid styles at
      1020px and re-fitted against twenty-four more at 688px, that is
      `0.31 + 1.75 · rows/cols`, and it predicts every measured card to within
      about 0.05. TARGET is 1.25, which is 4:5 — the tallest picture Instagram will
      show without cropping, so it is the most of the feed a card can occupy
      while still arriving whole.

   2. HOW RAGGED THE LAST ROW IS, counted in EMPTY CELLS rather than as a flag.
      One book alone under a row of five is a hole; four under five is barely
      visible. Weighted 0.4 against a normalised aspect error — deliberately
      the lighter of the two, because the only alternative to a ragged row is
      FEWER COLUMNS, and fewer columns means bigger covers, which is the other
      half of what was wrong: four books two-abreast draws each cover 460px
      across and stands 1.71. The weight is set where it leaves the small
      months exactly as they are today — three across up to six, which nobody
      complained about — and widens only above that. It is also what pins the
      two counts the brief named: ten books go five across, twelve go four.

   Measured against real exports, the change lands worst exactly where it was
   reported: ten books go 2.25 → 0.87 and twelve 2.25 → 1.40. */
/* Five is the ceiling a MONTH wants, and it is the wrong ceiling for a year.
   Held flat, seventy-two books five-across is fifteen rows and a card at 5.15 —
   a ribbon nobody can post, and the single largest thing in the app. The
   ceiling therefore rises with the count, on the arithmetic the target already
   implies: the aspect fit puts the postable shape at rows/cols ~ 0.537, so the
   columns that reach it are ~1.36 * sqrt(n). Five stays the floor of the
   ceiling and ten is the top of it, because a cover thinner than about sixty
   CSS pixels on the standard card stops being a jacket and becomes a stripe.

   It ROUNDS UP, and that one word is what fixes the heavy month. Rounding to
   nearest left the ceiling at five right through the counts that most need a
   sixth column, so sixteen books were pinned to 4x4 — four rows, and a card
   2.06 times taller than wide, i.e. cropped by every feed it is posted to. The
   ceiling is a ceiling, not a choice: raising it only lets the scorer consider
   a wider grid, and the scorer still has to prefer it. Nothing the brief named
   moves — ten still goes five across, twelve still goes four, because at those
   counts rounding up lands on five anyway — while sixteen goes 6x3 at 1.19.

   SIX is the hard top, on every card and at both column widths, and it is a
   brief rather than a fit: past six a row of jackets stops reading as books
   and starts reading as a strip of thumbnails, whatever the aspect says. It
   costs the heavy month some height — twenty books went 7x3 and now go 6x4 —
   and a year gets tall, which the year accepts. The lists have the same kind
   of ceiling at three, for the same reason; `widen` respects both. */
const GRID_MAX_COLS = 5
const GRID_MAX_COLS_TOP = 6
function gridCeiling(n: number): number {
  /* the columns at which rows/cols lands on the target — derived from the fit
     rather than written as a number, so re-fitting the aspect moves both */
  const ideal = (TARGET_ASPECT - ASPECT_BASE) / ASPECT_PER_ROW
  return Math.max(GRID_MAX_COLS, Math.min(GRID_MAX_COLS_TOP, Math.ceil(Math.sqrt(n / ideal))))
}
const TARGET_ASPECT = 1.25
/* leafHeight ÷ leafWidth ≈ ASPECT_BASE + ASPECT_PER_ROW · rows/cols — fitted to
   measured exports, not assumed. See the note above. */
const ASPECT_BASE = 0.31
const ASPECT_PER_ROW = 1.75
const RAGGED_WEIGHT = 0.4

/* A HOPEFULS cell is not a bare cover. It carries a title, a byline and a
   status word under the jacket, which is about sixty device pixels of type per
   ROW that the cover-only fit above knows nothing about — so the same rule,
   applied to it, believes the card is shorter than it is and buys too few
   columns. Measured off real exports of the three converted styles: a two-row
   card the model put at 1.02 came out 1.35 and 1.43, which is a per-row
   coefficient of ~2.2 rather than 1.48. Passed in rather than branched on,
   because it is the only thing that differs. */
const ASPECT_PER_ROW_CAPTIONED = 2.2

/* How much broader the Large card is than the standard one. Derived from the
   two card widths rather than written down, so re-sizing either moves it. */
const WIDE_FACTOR = SHAPE_CARD_W.wide / SHAPE_CARD_W.phone

/**
 * The same layout on the broad column, at the same CELL SIZE.
 *
 * The rule is one line of arithmetic and it is the whole idea: a card 1.44x
 * wider holds 1.44x as many columns before a cover is any bigger than it was.
 * Rounding is to NEAREST, because the target is the cover's size and either
 * neighbour can be the closer answer to it.
 *
 * The one correction is for a last row holding a single book. Widening cannot
 * make a card taller, so it can only ever turn a full grid into a ragged one,
 * and the ugliest way it does that is by leaving one cover alone under a full
 * row. Where stepping back one column fixes exactly that, it steps back —
 * seven books go 4 (4+3) to 6 (6+1) to 5 (5+2), which is the shape asked for.
 */
function widen(base: number, n: number, wide: boolean | undefined, max: number): number {
  if (!wide || base < 2) return base
  let c = Math.min(n, max, Math.round(base * WIDE_FACTOR))
  if (c > base && n % c === 1 && n % (c - 1) !== 1) c--
  return Math.max(base, c)
}

function gridCols(n: number, wide?: boolean, perRow: number = ASPECT_PER_ROW): number {
  if (n <= 1) return 1
  let best = 1
  let bestScore = Infinity
  /* One floor, and it is not negotiable by the score: TWO COLUMNS. A single
     column of covers is a stack rather than a grid, and every grid style draws
     a frame that assumes neighbours. There is deliberately no second-row floor
     on top of it — forcing one made three books draw as 2 x 2, which is two
     enormous covers and a hole where a neat row of three belonged, and it is
     bigger covers that were the complaint. The aspect term already keeps a
     one-row card off the letterbox end wherever the count gives it any choice. */
  for (let c = 2; c <= Math.min(gridCeiling(n), n); c++) {
    const rows = Math.ceil(n / c)
    const aspect = ASPECT_BASE + perRow * (rows / c)
    const empty = (c - (n % c)) % c
    const score =
      Math.abs(aspect - TARGET_ASPECT) / TARGET_ASPECT + RAGGED_WEIGHT * (empty / c)
    /* strictly-less keeps the NARROWER count on a tie, which is the safer
       side: a cover has a legible floor and a column too many shrinks it */
    if (score < bestScore) { bestScore = score; best = c }
  }
  return widen(best, n, wide, GRID_MAX_COLS_TOP)
}

/* The row-per-book styles have the OPPOSITE fault, and the old threshold made
   it worse rather than better. Their rows are full-width bars, so a column of
   them is short and wide: eight tickets in one column measure 1.16, and the old
   rule split them in two at seven and produced 0.72 — a letterbox. Splitting is
   what fixes a card that has grown too TALL, so it has to happen when the card
   is actually too tall, which measurement puts at thirteen books rather than
   seven. Two is the cap: across tickets, ledger and marquee at every count up
   to twenty, on both export leaves, three columns was never once the closest
   shape.

   Same target, different geometry, and no ragged term. A bar's height barely
   changes when the list is split, so the leaf tracks the ROW COUNT alone —
   `0.38 + 0.096 · rows`, fitted across all SIX measured series: three styles ×
   both export leaves. Both halves of that matter. The styles differ (tickets
   runs 0.098 a row at 1020px, marquee 0.068), and so do the leaves — the same
   sixteen tickets measure 1.95 on the 1020px column and 2.76 on the 720px one,
   because a narrower bar wraps taller. The fit is the average of the two
   rather than either, so it splits a little early for the wide leaf and a
   little late for the narrow one, and the bias is deliberately toward
   splitting: a card left at 2.34 is cropped by the feed, while one at 0.78
   merely leaves height on the table. The broad column's EXTRA columns are not
   part of this fit — they are applied afterwards by `widen`, which is about
   cell size rather than leaf shape.

   The ragged term is left out on purpose: half a final row in a two-column list
   of bars is ordinary rather than a hole, and scoring it made the count jump
   1 → 3 → 2 as a month gained single books. */
const LIST_BASE = 0.38
const LIST_PER_ROW = 0.096
/* Three is the ceiling and TWO is the floor. The floor is the same rule the
   grids run on and for the same reason: a column of full-width bars is the
   most wasteful shape a card can take — one book per row draws a 688px bar for
   a 40px cover, so a short month stands as tall as a long one and posts as a
   banner. It was also the only place left in the app where a card was still one
   thing across. The ceiling moved 2 -> 3 for the long lists alone: at twenty
   books two columns is still the closest shape, and three only wins once the
   list is long enough that two would run past twice its own width. Three is
   also the most a list may ever be, on the broad column too — a fourth column
   of bars leaves each one too narrow to carry a title. */
const LIST_MAX_COLS = 3
const LIST_MIN_COLS = 2

function listCols(n: number, wide?: boolean): number {
  if (n <= 1) return 1
  let best = LIST_MIN_COLS
  let bestErr = Infinity
  for (let c = LIST_MIN_COLS; c <= Math.min(LIST_MAX_COLS, n); c++) {
    const aspect = LIST_BASE + LIST_PER_ROW * Math.ceil(n / c)
    const err = Math.abs(aspect - TARGET_ASPECT)
    if (err < bestErr) { bestErr = err; best = c }
  }
  return widen(best, n, wide, LIST_MAX_COLS)
}

function fmts(b: Review): string {
  return b.formats.join(' · ')
}

/* A byline joined on the parts that exist. The three list styles wrote
   `${author} · ${fmts(b)}` inline, which is correct for a review — every one
   carries at least one format, since a review cannot be saved without one —
   and leaves a separator hanging with nothing after it on a hopeful, which
   carries none. */
function meta(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' · ')
}

const leans = [-1.6, 0.8, -0.6, 1.4, -1, 0.6]

/* THE THREE LIST STYLES, PACKED AS GRIDS — for hopefuls only.

   A month card gives each book a row because the row has something to say: a
   numeral, a run of stars, the formats it was read in. A hopeful has none of
   that, so the same row is a jacket the size of a thumbnail with two thirds of
   the bar left as empty paper, and seven of them run the card into a ribbon
   nothing can post. What there IS to look at is the cover.

   So every style packs its hopefuls into the counted grid the cover styles
   already use — same `gridCols`, same arithmetic — and keeps its own clothing
   on the cell: the stub is still a plate with a perforated foot, the register
   is still ruled, the board still numbers its features. */
function hopeGrid(m: MonthData, cls: string, cell: (b: Review, i: number) => string): string {
  return `<div class="hg ${cls}" style="--cols:${gridCols(m.books.length, m.wide, ASPECT_PER_ROW_CAPTIONED)}">
    ${m.books.map((b, i) => cell(b, i)).join('')}
  </div>`
}

/* the two lines every hopefuls cell carries under its cover — the title, and
   whatever else is actually known. A hopeful has no formats, so the byline is
   the author and the length when a catalogue knew it. */
function hopeCap(b: Review): string {
  return `<div class="hg-name">${escapeHtml(b.title)}</div>
    <div class="hg-by">${meta(escapeHtml(b.author), b.pages ? `${b.pages} pages` : '')}</div>`
}

/* C1 · Contact Sheet (coal) — the proof grid */
function contact(m: MonthData): string {
  const ink = 'var(--mustard)', line = 'rgba(244,242,237,.55)'
  return `<article class="card c1" style="--rot:-.6deg">
    ${patchC(150)}
    ${moHead(m, 'c1')}
    ${moStats(m, 'c1')}
    <div class="c1-grid" style="--cols:${gridCols(m.books.length, m.wide)}">
      ${m.books.map((b, i) => `
        <div class="c1-cell">
          <div class="c1-no">FR ${String(i + 1).padStart(2, '0')}A</div>
          ${cov(b)}
          ${tbr(m) ? '' : `<div class="c1-meta">
            <span class="r-num">${fmtRating(b.rating)}</span>
            ${starsS(b.rating, 11, ink, line)}
          </div>`}
        </div>`).join('')}
    </div>
  </article>`
}

/* C2 · Shelf (butter) — front-facing covers on drawn rails, three to a rail */
function shelf(m: MonthData): string {
  const per = gridCols(m.books.length, m.wide)
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
        ${tbr(m)
          /* the rail under a shelf says one thing per spine, and on a month
             card that is the verdict. A hopeful has none — so the rail carries
             the title, which is otherwise printed nowhere on this style and
             is not readable off a 100px jacket. */
          ? row.map((b) => `<div class="c2-meta"><span class="lbl">${escapeHtml(b.title)}</span></div>`).join('')
          : `
          ${row.map((b) => `
            <div class="c2-meta">
              <span class="r-num">${fmtRating(b.rating)}</span>
              <div class="c2-stars">${starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.5)')}</div>
            </div>`).join('')}`}
      </div>`).join('')}
  </article>`
}

/* C3 · Tickets (pink) — admission stubs */
function tickets(m: MonthData): string {
  const cols = listCols(m.books.length, m.wide)
  return `<article class="card c3" style="--rot:-.8deg">
    ${patchC(150)}
    ${moHead(m, 'c3')}
    ${moStats(m, 'c3')}
    ${tbr(m)
      ? hopeGrid(m, 'hg--c3', (b, i) => `
        <div class="hg-c" style="--tr:${leans[i % leans.length] * 0.7}deg">
          ${cov(b)}
          <div class="hg-cap">${hopeCap(b)}</div>
          <div class="hg-end"><span class="lbl">Unused</span></div>
        </div>`)
      : `
    <div class="c3-stack ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b, i) => `
        <div class="c3-t" style="--tr:${leans[i % leans.length] * 0.7}deg">
          ${cov(b)}
          <div style="min-width:0; padding-right:14px">
            <div class="c3-name">${escapeHtml(b.title)}</div>
            <div class="c3-adm">${meta(escapeHtml(b.author), fmts(b), tbr(m) && b.pages ? `${b.pages} pages` : '')}</div>
          </div>
          <div class="c3-end">
            <span class="r-num">${fmtRating(b.rating)}</span>
            <div>${starsS(b.rating, 10, 'var(--accent)', 'rgba(27,25,23,.4)')}</div>
          </div>
        </div>`).join('')}
    </div>`}
  </article>`
}

/* C4 · Pinboard (blue) — pinned prints, no cover ever hidden */
function pinboard(m: MonthData): string {
  return `<article class="card c4" style="--rot:.7deg">
    ${patchC(130)}
    ${moHead(m, 'c4')}
    ${moStats(m, 'c4')}
    <div class="c4-board" style="--cols:${gridCols(m.books.length, m.wide)}">
      ${m.books.map((b, i) => `
        <div class="c4-pin" style="--pr:${leans[i % leans.length] * 1.6}deg">
          <svg class="c4-tack" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.4" fill="var(--accent)"/>
            <circle cx="5.4" cy="5.4" r="1.7" fill="rgba(255,255,255,.55)"/>
          </svg>
          <div class="c4-photo">
            ${cov(b)}
            ${tbr(m) ? '' : `<div class="c4-cap"><span class="r-num">${fmtRating(b.rating)}</span>${starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.45)')}</div>`}
          </div>
        </div>`).join('')}
    </div>
  </article>`
}

/* C5 · Ledger (mustard) — the reading register */
function ledger(m: MonthData): string {
  const cols = listCols(m.books.length, m.wide)
  const avg = m.books.reduce((s, b) => s + b.rating, 0) / (m.books.length || 1)
  const pages = m.books.reduce((s, b) => s + (b.pages || 0), 0)
  return `<article class="card c5" style="--rot:-.5deg">
    ${patchC(140)}
    ${moHead(m, 'c5')}
    ${moStats(m, 'c5')}
    ${tbr(m)
      ? hopeGrid(m, 'hg--c5', (b) => `
        <div class="hg-c">
          ${cov(b)}
          <div class="hg-cap">${hopeCap(b)}</div>
          <div class="hg-end"><span class="lbl">Pending</span></div>
        </div>`)
      : `
    <div class="c5-tbl ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b) => `
        <div class="c5-r">
          ${cov(b)}
          <div style="min-width:0">
            <div class="c5-name">${escapeHtml(b.title)}</div>
            <div class="c5-fmt">${meta(escapeHtml(b.author), fmts(b), b.pages ? `${b.pages} pages` : '')}</div>
          </div>
          <div class="c5-rate">
            <span class="r-num">${fmtRating(b.rating)}</span>
            <div>${starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.55)')}</div>
          </div>
        </div>`).join('')}
    </div>`}
    <div class="c5-total">
      <span class="lbl">${
        pages ? (tbr(m) ? 'Pages to read' : 'Pages this month') : tbr(m) ? 'Books to read' : 'Month average'
      }</span>
      <span class="r-num" style="font-size:20px">${
        pages
          ? pages.toLocaleString()
          : tbr(m)
            ? String(m.books.length)
            : fmtRating(Math.round(avg / 0.25) * 0.25)
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
    <div class="c6-sheet" style="--cols:${gridCols(m.books.length, m.wide)}">
      ${m.books.map((b, i) => `
        <div class="c6-stamp" style="--sr:${leans[i % leans.length]}deg">
          <div class="c6-face">
            ${cov(b)}
            <span class="c6-perf" aria-hidden="true"></span>
            ${tbr(m) ? '' : `<span class="c6-val">${fmtRating(b.rating)}</span>`}
          </div>
          <div class="c6-cap">
            <div class="c6-name">${escapeHtml(b.title)}</div>
            <div class="c6-by">${escapeHtml(b.author)}</div>
            ${tbr(m) ? '' : starsS(b.rating, 10, 'var(--ink)', 'rgba(27,25,23,.5)')}
          </div>
        </div>`).join('')}
    </div>
  </article>`
}

/* C7 · Marquee (coal) — the month as a listings board, one line a film */
function marquee(m: MonthData): string {
  const cols = listCols(m.books.length, m.wide)
  const ink = 'var(--mustard)', line = 'rgba(244,242,237,.5)'
  return `<article class="card c7" style="--rot:-.4deg">
    ${patchC(150)}
    ${moHead(m, 'c7')}
    ${moStats(m, 'c7')}
    ${tbr(m)
      ? hopeGrid(m, 'hg--c7', (b, i) => `
        <div class="hg-c">
          <div class="hg-no">${String(i + 1).padStart(2, '0')}</div>
          ${cov(b)}
          <div class="hg-cap">${hopeCap(b)}</div>
          <div class="hg-end"><span class="lbl">Soon</span></div>
        </div>`)
      : `
    <div class="c7-board ${cols > 1 ? 'is-split' : ''}" style="--cols:${cols}">
      ${m.books.map((b, i) => `
        <div class="c7-line">
          <span class="c7-no">${String(i + 1).padStart(2, '0')}</span>
          ${cov(b, 'c7-cov')}
          <div class="c7-mid">
            <div class="c7-name">${escapeHtml(b.title)}</div>
            <div class="c7-by">${meta(escapeHtml(b.author), fmts(b), tbr(m) && b.pages ? `${b.pages} pages` : '')}</div>
          </div>
          <div class="c7-rate">
            <span class="r-num">${fmtRating(b.rating)}</span>
            <div>${starsS(b.rating, 10, ink, line)}</div>
          </div>
        </div>`).join('')}
    </div>`}
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

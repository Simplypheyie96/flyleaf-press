/* Reading a Goodreads library into this app.

   THERE IS NO GOODREADS API, and there has not been one since 8 December 2020:
   no new developer keys were issued after that date, the retirement was
   announced, and long-standing keys now answer 403. Two more walls sit behind
   that one — Goodreads sends no CORS headers, so even the per-shelf RSS feed is
   unreadable from a browser, and this app has no backend to proxy through. One
   would have to be built, and "storage stays local, never a server of ours" is
   the promise the whole app is arranged around. So the door is the export
   Goodreads gives its own users: My Books → Import and export → Export Library.

   That turns out to be the better door anyway. No account, no consent screen,
   no quota, no token to expire, and it works on a plane.

   ONE FORMAT, ONE MERGE, THREE DOORS. This file does not write to the
   database. It converts a CSV into the same `LibraryFile` that a hand-carried
   backup and a Drive sync both arrive as, and hands it to `mergeLibrary`.
   Dedupe, idempotency, and the rule that a review you deliberately deleted
   does not come back are all properties of that fold; reimplementing them here
   would mean two readers of the same intent, and the one with less testing
   would be the one somebody's shelf came back through. */

import type { FormatName, Review } from '../types'
import { db } from '../db'
import { fingerprint } from '../sync/backup'

/* Where the import window starts. Not a filter for one calendar year — a
   FLOOR, so the feature keeps working next year without an edit. Today that
   means "2026 only", which is what was asked for; in 2027 it means 2026 and
   2027. A ceiling would have to be moved by hand every January, and the year
   it was forgotten it would silently import nothing. */
export const FROM_YEAR = 2026

/* ── The file ───────────────────────────────────────────────────────────────*/

/** RFC 4180, because a Goodreads export genuinely needs it: review prose
    carries commas, embedded newlines and doubled quotes, and a naive
    `split(',')` turns one review into fifteen columns of rubbish. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  /* A BOM survives Excel round-trips and would otherwise become part of the
     first header name, so "Book Id" never matches. */
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++ }
        else quoted = false
      } else cell += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === ',') { row.push(cell); cell = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/** Goodreads writes ISBNs Excel-armoured — `="9780571239597"` — so that a
    spreadsheet does not helpfully reformat a 13-digit number into 9.79E+12.
    An empty one is `=""`. */
function unarmour(v: string): string {
  const m = /^="?(.*?)"?$/.exec(v.trim())
  return (m ? m[1] : v).trim()
}

/** `2026/03/14` → `2026-03-14`. Blank stays blank, and that is load-bearing:
    see `noYear` below. */
function isoDate(v: string): string {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(v.trim())
  if (!m) return ''
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/** Goodreads reviews are HTML — `<br/>` for every break, and the occasional
    `<i>` or link. The card wants the app's own convention: paragraphs
    separated by blank lines. Any RUN of breaks becomes one paragraph break,
    single ones included, because a single `<br/>` is how most people on
    Goodreads end a paragraph and `paragraphs()` would otherwise fold the whole
    review into one block. */
function htmlToText(v: string): string {
  return v
    .replace(/<\s*br\s*\/?\s*>(\s*<\s*br\s*\/?\s*>)*/gi, '\n\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#3[49];/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    /* last, or it would un-escape the others' ampersands into live entities */
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Goodreads keeps the series in the title — `The Fifth Season (The Broken
    Earth, #1)`. Only a parenthetical carrying a `#` is treated as one, so
    `Frankenstein (Norton Critical Editions)` keeps its own name. Series is
    otherwise derived from the catalogue in this app, and this is simply a
    better source when it is right there in the field. */
function splitSeries(raw: string): { title: string; series?: string; seriesNo?: string } {
  const m = /^(.*?)\s*\(([^()]*?)[,\s]+#([\d.]+)\)\s*$/.exec(raw.trim())
  if (!m || !m[1].trim()) return { title: raw.trim() }
  return { title: m[1].trim(), series: m[2].trim() || undefined, seriesNo: m[3] }
}

/** Binding → the app's three formats. Goodreads' vocabulary is an edition
    word, not a medium, so the mapping is by hand; anything unrecognised
    returns nothing rather than guessing, and becomes the one question the
    review screen asks. */
function toFormat(binding: string): FormatName | undefined {
  const b = binding.trim().toLowerCase()
  if (!b) return undefined
  if (/audio|audible|cd|cassette/.test(b)) return 'Audiobook'
  if (/kindle|ebook|e-book|nook|epub|digital/.test(b)) return 'Ebook'
  if (/hardcover|paperback|hardback|board book|leather|spiral|library binding|print/.test(b)) return 'Physical'
  return undefined
}

/* ── One row, as this app would hold it ─────────────────────────────────────*/

export interface GrBook {
  title: string
  author: string
  series?: string
  seriesNo?: string
  /** ISO — or '' when the file carries no readable Date Read. Such a row can
      still be imported, dated today, if the reader checks it in. */
  finished: string
  /** 0 when Goodreads holds no rating. Whole stars only; this app's 0.25 steps
      are simply a finer instrument than the source has. */
  rating: number
  formats: FormatName[]
  pages?: number
  isbn?: string
  body: string
  /** the raw Binding, kept only so the review screen can say what it saw */
  binding: string
}

export interface GrScan {
  /** every data row the file held */
  total: number
  /** complete, and not already on the shelf — imported as they are */
  ready: GrBook[]
  /** readable and wanted, but Binding said nothing this app understands. One
      answer covers all of them, which is why they are worth asking about. */
  needFormat: GrBook[]
  /** Goodreads holds no rating for these. They are listed unchecked: checking
      one imports it rated 3 — a placeholder in the middle of the scale, there
      to be corrected on the book's own page, never a silent opinion. */
  unrated: GrBook[]
  /** already on the shelf, matched on title and author within the same year */
  duplicates: GrBook[]
  /** on the read shelf, dated, but finished before the window opens */
  beforeWindow: number
  /** to-read and currently-reading */
  otherShelves: number
  /** no readable Date Read at all. Listed unchecked: checking one imports it
      dated today — which is inside the window by construction — to be
      corrected on the book's own page. */
  noDate: GrBook[]
  /** the format seen most often across the file, offered as the default answer
      for `needFormat` — a shelf that is 90% paperbacks is a decent prior for
      the rows whose binding was blank */
  commonFormat: FormatName
}

/** Read a Goodreads export. Reads only; nothing is written by this function. */
export async function scanGoodreads(text: string): Promise<GrScan> {
  const rows = parseCsv(text)
  if (!rows.length) throw new Error('That file is empty.')

  const head = rows[0].map((h) => h.trim())
  const col = (name: string) => head.indexOf(name)
  const iTitle = col('Title')
  const iAuthor = col('Author')
  if (iTitle < 0 || iAuthor < 0) {
    throw new Error(
      'That doesn’t look like a Goodreads export — it has no Title and Author columns. ' +
        'Use My Books → Import and export → Export Library.'
    )
  }
  const iShelf = col('Exclusive Shelf')
  const iRead = col('Date Read')
  const iRating = col('My Rating')
  const iBinding = col('Binding')
  const iPages = col('Number of Pages')
  const iIsbn13 = col('ISBN13')
  const iIsbn = col('ISBN')
  const iReview = col('My Review')

  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '')

  const scan: GrScan = {
    total: 0, ready: [], needFormat: [], unrated: [], duplicates: [],
    beforeWindow: 0, otherShelves: 0, noDate: [], commonFormat: 'Physical',
  }

  const kept: GrBook[] = []
  const tally = new Map<FormatName, number>()

  for (const r of rows.slice(1)) {
    /* A trailing newline yields one empty row, and a row of nothing but commas
       is not a book either. */
    if (!r.length || !at(r, iTitle).trim()) continue
    scan.total++

    /* Only what was actually read. `to-read` is a wish and
       `currently-reading` has no finish date by definition. */
    const shelf = at(r, iShelf).trim().toLowerCase()
    if (iShelf >= 0 && shelf && shelf !== 'read') { scan.otherShelves++; continue }

    const finished = isoDate(at(r, iRead))
    /* The window is a hard wall: nothing finished before it comes in, checked
       or not. An UNDATED row is different — the file simply does not say when
       it was read, so it is kept and offered unchecked; importing it dates it
       today, which is inside the window by construction. */
    if (finished && Number(finished.slice(0, 4)) < FROM_YEAR) { scan.beforeWindow++; continue }

    const { title, series, seriesNo } = splitSeries(at(r, iTitle))
    const fmt = toFormat(at(r, iBinding))
    if (fmt) tally.set(fmt, (tally.get(fmt) ?? 0) + 1)
    const pages = Number(unarmour(at(r, iPages)))

    kept.push({
      title,
      author: at(r, iAuthor).trim(),
      series,
      seriesNo,
      finished,
      rating: Number(at(r, iRating)) || 0,
      formats: fmt ? [fmt] : [],
      pages: Number.isFinite(pages) && pages > 0 ? pages : undefined,
      isbn: unarmour(at(r, iIsbn13)) || unarmour(at(r, iIsbn)) || undefined,
      body: htmlToText(at(r, iReview)),
      binding: at(r, iBinding).trim(),
    })
  }

  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top) scan.commonFormat = top[0]

  /* ── Already here? ──────────────────────────────────────────────────────
     `fingerprint()` is title|author|FINISHED, and that is deliberately too
     strict for this job: a book logged by hand on the 14th and exported by
     Goodreads as read on the 15th is one reading, and an exact-date match
     would cheerfully shelve it twice. So the check here is looser — title and
     author, within the same year — and a different year is left alone, because
     that is a re-read and genuinely a second entry.

     The exact-fingerprint checks still happen, downstream, in `mergeLibrary`:
     this pass is the one that catches date drift. */
  const mine = await db.reviews.toArray()
  const flat = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const seen = new Set(mine.map((m) => `${flat(m.title)}|${flat(m.author)}|${m.finished.slice(0, 4)}`))
  /* For UNDATED rows the year-scoped key proves nothing — there is no year.
     They match on title and author alone: if the book is on the shelf at all,
     an undated copy stamped with today's date is a duplicate, not a re-read,
     because a re-read is a claim the row cannot make without a date. */
  const seenAny = new Set(mine.map((m) => `${flat(m.title)}|${flat(m.author)}`))

  for (const b of kept) {
    const any = `${flat(b.title)}|${flat(b.author)}`
    if (!b.finished) {
      if (seenAny.has(any)) { scan.duplicates.push(b); continue }
      seenAny.add(any)
      scan.noDate.push(b)
      continue
    }
    const key = `${any}|${b.finished.slice(0, 4)}`
    if (seen.has(key)) { scan.duplicates.push(b); continue }
    /* Within the file too — Goodreads can hold the same book twice across
       shelves, and two rows of one book would be two cards. */
    seen.add(key)
    seenAny.add(any)
    if (!b.rating) { scan.unrated.push(b); continue }
    if (!b.formats.length) { scan.needFormat.push(b); continue }
    scan.ready.push(b)
  }

  return scan
}

/* ── Handing it to the merge ────────────────────────────────────────────────*/

/** What a checked-in book gets where Goodreads held no rating: the middle of
    the scale, there to be corrected on the book's own page. The sheet says so
    beside the checkbox, so nothing is filled in silently. */
export const AUTO_RATING = 3

/** Today, as the app's ISO date — what a checked-in undated book is stamped
    with, which is inside the window by construction. */
export function todayIso(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/**
 * The CHECKED rows, as reviews, ready for `mergeLibrary`. `no` is left at 0
 * and the fold assigns the real number — numbering is per-device and stays
 * that way, because the Nº is printed on cards that have already been handed
 * out. Gaps are filled here, and only here, so a book the reader checked in
 * always arrives complete: a missing format takes `formats` (the sheet's one
 * question — and it is multi-select, because format is multi-select everywhere
 * in this app), a missing rating takes AUTO_RATING, a missing date takes today.
 */
export function toReviews(books: GrBook[], formats: FormatName[]): Review[] {
  const now = Date.now()
  const today = todayIso()
  return books.map((b) => ({
    no: 0,
    title: b.title,
    author: b.author,
    series: b.series,
    seriesNo: b.seriesNo,
    finished: b.finished || today,
    formats: b.formats.length ? b.formats : formats,
    rating: b.rating || AUTO_RATING,
    pages: b.pages,
    isbn: b.isbn,
    body: b.body,
    plates: [],
    /* No cover, and deliberately none invented — the CSV carries no artwork at
       all, and a generated placeholder is banned. `backfillCovers` goes and
       looks one up afterwards, by ISBN, at a pace the catalogues will tolerate. */
    style: 'archive' as const,
    /* Marked, so the whole import can be undone as a group from Settings.
       Only rows the import ADDS carry it — a shelf copy that Replace merely
       updated was yours before the file arrived and stays through a removal. */
    source: 'goodreads' as const,
    createdAt: now,
    editedAt: now,
  }))
}

/** The fingerprints this import would write, so a caller can report on what
    it actually did without re-deriving the mapping. */
export function fingerprintsOf(rows: Review[]): string[] {
  return rows.map((r) => fingerprint(r))
}

/**
 * Replace shelf copies with what the file carries — runs only when the reader
 * chose Replace in the import sheet, never by default. Field by field, and
 * only fields the file's row actually has: "never replace something with less
 * than itself" is the same rule the merge fold runs on, so a blank rating, an
 * empty review or a missing date in the file never erases what is here. The
 * cover, plates, style, Nº and created date are this device's own — Goodreads
 * carries none of them — and are never touched.
 */
export async function replaceDuplicates(dups: GrBook[]): Promise<number> {
  const mine = await db.reviews.toArray()
  const flat = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  let replaced = 0
  for (const b of dups) {
    /* The same loose match that named it a duplicate: title and author, within
       the same year — or any year for a row the file left undated. */
    const row = mine.find(
      (m) =>
        flat(m.title) === flat(b.title) &&
        flat(m.author) === flat(b.author) &&
        (!b.finished || m.finished.slice(0, 4) === b.finished.slice(0, 4))
    )
    if (!row || row.id == null) continue
    const patch: Partial<Review> = {}
    if (b.rating) patch.rating = b.rating
    if (b.finished) patch.finished = b.finished
    if (b.body) patch.body = b.body
    if (b.formats.length) patch.formats = b.formats
    if (b.pages) patch.pages = b.pages
    if (b.series) {
      patch.series = b.series
      patch.seriesNo = b.seriesNo
    }
    /* An ISBN is an edition claim; the file's only fills a gap, never
       overrules a row that already knows its edition. */
    if (b.isbn && !row.isbn) patch.isbn = b.isbn
    if (!Object.keys(patch).length) continue
    patch.editedAt = Date.now()
    await db.reviews.update(row.id, patch)
    replaced++
  }
  return replaced
}

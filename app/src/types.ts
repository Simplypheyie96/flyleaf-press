/* ONE set of twelve styles, and every card in the app answers to it — the
   review, the monthly collage, and the currently-reading card alike.

   It used to be two sets of twelve with two vocabularies, so the same idea
   had a different name depending on which page you were standing on: the
   register card was Archive on a review and Ledger on a month, the proof grid
   was Catalogue here and Contact Sheet there. Twelve clothes, twenty-four
   names, and no way to tell from a picker that any of them were the same
   thing. The review styles are the ones with the names, so they are the set.

   The collage stylesheet is POSITIONAL (.c1-.c12), so the classes did not
   have to move; what moved is which style id points at which class. Ten of
   the twelve already sat on the same ground as the review style they now
   are. The two that did not — the franked sheet on manila and the listings
   board on electric — took the ground of the style they became (Dust Jacket's
   lilac and Masthead's sage), because a swatch dot that disagrees with the
   card under it is the fault this whole change is about. */
export type StyleId =
  | 'archive' | 'masthead' | 'catalogue' | 'scrapbook' | 'fieldnotes' | 'jacket' | 'airmail'
  | 'herbarium' | 'broadside' | 'jcard' | 'passport' | 'specimen'

export const STYLE_IDS: StyleId[] = [
  'archive', 'masthead', 'catalogue', 'scrapbook', 'fieldnotes', 'jacket', 'airmail',
  'herbarium', 'broadside', 'jcard', 'passport', 'specimen',
]

/* The styles a YEAR offers. Scrapbook, Archive and Broadside draw one row per
   book as a collage, which holds a month and runs to a strip nobody can read
   as an object at two hundred rows — a year gets only the styles that PACK:
   the grids and the spine rail. All twelve still ship and still serve every
   month, and every one of them is still a review style. */
export const YEAR_COLLAGE_IDS: StyleId[] = [
  'catalogue', 'airmail', 'fieldnotes', 'jacket', 'herbarium', 'passport', 'specimen',
]

/* The twelve ids a collage or a story card used to be saved under, mapped onto
   the style each one now is. A stored pick is a pick the reader made and it
   survives the rename — `settings.defaultCollage` of 'ledger' reads back as
   Archive, which is the same card it always drew. Same shape as `liveHand()`,
   and for the same reason: coerce on read rather than migrate the table. */
const RETIRED: Record<string, StyleId> = {
  ledger: 'archive', marquee: 'masthead', contact: 'catalogue', tickets: 'scrapbook',
  pinboard: 'fieldnotes', postmark: 'jacket', shelf: 'airmail', cabinet: 'herbarium',
  playbill: 'broadside', mixtape: 'jcard', visa: 'passport', charset: 'specimen',
}

/** Coerce a stored collage style onto the unified set. */
export function liveStyle(id: string | undefined): StyleId {
  if (id && STYLE_IDS.includes(id as StyleId)) return id as StyleId
  return (id && RETIRED[id]) || 'archive'
}

export const STYLE_NAMES: Record<StyleId, string> = {
  archive: 'Archive',
  masthead: 'Masthead',
  catalogue: 'Catalogue',
  scrapbook: 'Scrapbook',
  fieldnotes: 'Field Notes',
  jacket: 'Dust Jacket',
  airmail: 'Airmail',
  herbarium: 'Herbarium',
  broadside: 'Broadside',
  jcard: 'J-Card',
  passport: 'Passport',
  specimen: 'Specimen',
}

/* THE HAND A REVIEW IS WRITTEN IN.

   Kalam carried every review, and one handwriting on every card is one voice
   for everybody's reading — so the hand is now the reader's pick, per review,
   the same way the card's clothes already are. Three faces, self-hosted beside
   the rest (see `src/fonts.ts`, which holds their files and the size each one
   needs to read at Kalam's size). It was six; Gloria Hallelujah, Gochi Hand and
   Schoolbell were cut on sight.

   `Review.hand` is OPTIONAL and absent means Kalam: every review written before
   this existed stays exactly as it was printed, and the recorded default is
   still Kalam rather than something a migration invented. A row still carrying
   one of the three retired ids is read the same way — `HANDS[id] ?? HANDS.kalam`
   in both emitters, and the editor coerces it back to `kalam` when the review is
   next opened — so nothing has to be migrated for a face to leave.

   `notes` is the user's OWN face — HandwrittenNotes.ttf out of their Library,
   asked for by name, converted to woff2 and committed to the repo. It is the
   one face here that is not SIL OFL: its name table licenses it for personal
   use, and it ships on the owner's own app at the owner's instruction. It is
   also the one face with holes in it — no em dash, en dash or ellipsis — which
   is why every hand's family stack falls through to Kalam rather than to the
   generic `cursive` (see `handVars`). */
export type HandId = 'kalam' | 'notes' | 'shantell'
export const HAND_IDS: HandId[] = ['kalam', 'notes', 'shantell']
export const HAND_NAMES: Record<HandId, string> = {
  kalam: 'Kalam',
  notes: 'Handwritten Notes',
  shantell: 'Shantell Sans',
}

/** The hand a stored row should be EDITED in. A review saved under a face that
    has since been retired reads back as Kalam — which is what the card already
    prints it as, since both emitters fall through to Kalam on an id they do not
    know. Without this the editor would hold an id no chip matches, show nothing
    pressed, and write the dead face back on save. */
export function liveHand(hand?: string): HandId {
  return HAND_IDS.includes(hand as HandId) ? (hand as HandId) : 'kalam'
}

/* the ground each style sits on — used for the little pastel swatch dots */
export const STYLE_GROUNDS: Record<StyleId, string> = {
  archive: '#DCA94C',
  masthead: '#D9E0D0',
  catalogue: '#121416',
  scrapbook: '#BFEBEE',
  fieldnotes: '#DAE4EE',
  jacket: '#D8CCEA',
  airmail: '#F6EBD9',
  herbarium: '#A6CFBB',
  broadside: '#FDBDB5',
  jcard: '#F2BC97',
  passport: '#E5BDD0',
  specimen: '#1E4645',
}

export const FORMAT_NAMES = ['Ebook', 'Audiobook', 'Physical'] as const
export type FormatName = (typeof FORMAT_NAMES)[number]

export interface Plate {
  /** dataURL of an uploaded photo — or absent when the plate uses seeded line art */
  image?: string
  /** seeded line-art key (demo data only) */
  art?: 'spread' | 'shelf' | 'window'
  caption: string
}

export interface Review {
  id?: number
  /** running review number — Nº on the card colophon */
  no: number
  title: string
  author: string
  series?: string
  seriesNo?: string
  /** ISO yyyy-mm-dd */
  started?: string
  /** ISO yyyy-mm-dd — also decides which month collage the book joins */
  finished: string
  formats: FormatName[]
  /** 0.25 steps, 0.25–5 */
  rating: number
  /**
   * The cover, or nothing. A dataURL (manual upload / fetched catalogue art),
   * a local path (seed data), or undefined — never a generated placeholder.
   */
  cover?: string
  /**
   * Every candidate cover URL the catalogues offered, in trust order —
   * persisted on the row (the Flyleaf pattern) so the cover can be CHANGED
   * later from the edit page, not only at add time.
   */
  covers?: string[]
  isbn?: string
  /**
   * Pages in the edition that was actually read. Auto-filled from the
   * catalogue where one knows, and always editable — catalogues answer for
   * *an* edition, not the one in someone's hands, and a large-print or
   * omnibus copy is a different number. Absent when nothing knew and the
   * reader didn't say; the card then simply omits the line rather than
   * printing a guess.
   */
  pages?: number
  /**
   * What the book is about, in the catalogues' own words — filled from Open
   * Library's subjects, Apple's genres and Google's categories at the moment
   * the book is added, canonicalised by `src/tags.ts`, and editable like the
   * page count. Optional, and absent means none: a review written before this
   * existed simply prints no tag line, and nothing is migrated.
   */
  tags?: string[]
  /** the review text — paragraphs separated by blank lines */
  body: string
  plates: Plate[]
  /** the style this review is displayed in; sharing can pick any style */
  style: StyleId
  /** the handwriting the review body is set in — absent means Kalam */
  hand?: HandId
  /**
   * Where the row came in from, when it wasn't written here by hand. Set by
   * the Goodreads import so it can be undone as a group — Settings offers
   * "Remove the Goodreads import" against exactly these rows. Absent on
   * everything else, including shelf copies an import merely updated.
   */
  source?: 'goodreads'
  createdAt: number
  /**
   * When this row was last written. Sync needs it: two devices holding the
   * same book have to agree which side's version of the rating, the body or
   * the cover is the current one, and a merge that only ever *added* rows
   * would leave an edit made on the phone invisible on the laptop forever.
   * Absent on rows written before sync existed — treated as `createdAt`.
   */
  editedAt?: number
}

/**
 * A book picked for a month that has not been read yet — the month's hopefuls.
 *
 * It is deliberately NOT a Review with empty fields. A review carries a rating
 * and two dates and a body, all of which are required to save one, and none of
 * which a book you merely intend to read can honestly have; a hopeful put on
 * the shelf as a review would be a rated, dated, reviewed book that nobody has
 * opened. What it does carry is exactly what the card prints — the title, the
 * author, the cover, and the length if a catalogue knew it.
 *
 * `covers` persists the candidate art the same way a review does, so the cover
 * stays changeable from the list afterwards rather than only at add time.
 */
export interface Hopeful {
  id?: number
  /** the month this list is for — 'YYYY-MM', the same key the collages use */
  month: string
  title: string
  author: string
  series?: string
  isbn?: string
  /** a dataURL, or nothing — never a generated placeholder */
  cover?: string
  /** every candidate cover the catalogues offered, in trust order */
  covers?: string[]
  pages?: number
  /** decides the order on the card — first added, first printed */
  createdAt: number
  editedAt?: number
}

/**
 * A review that was deleted, remembered by fingerprint so the deletion can
 * travel. Without these a merge is one-directional: delete a review on the
 * phone, and the laptop — which still holds it — puts it straight back on the
 * next sync. It stores no title-as-content, only the same key the merge
 * matches on, and the moment it happened.
 */
export interface Grave {
  key: string
  at: number
}

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ShelfView = 'list' | 'covers'

/* Which COLUMN the review is laid on, and therefore what shape the file is.
   Text renders at the same size in both files (both export at exactly 2×);
   what differs is the width of the paper. Large card composes on a 988px
   column and saves 2040px wide — a long review runs SHORTER because each line
   holds more words, not because anything shrinks. Small card is the standard
   688px column saved 1440px wide, and runs taller. An earlier version made
   the two the same composition merely scaled, which made "Large" a blown-up
   copy of "Small" — same aspect, no reason to exist — and before that it
   switched Small into the compact phone layout, which was a different-looking
   object. Both were cut on report. The ids keep their old names because they
   persist in settings; renaming them would orphan every saved pick. */
export type ExportShape = 'wide' | 'phone'
export const EXPORT_SHAPES: readonly ExportShape[] = ['wide', 'phone'] as const
export const EXPORT_SHAPE_NAMES: Record<ExportShape, string> = {
  wide: 'Large card',
  phone: 'Small card',
}
/* How wide the FILE comes out, per option — round numbers (2040 and 1440),
   each exactly 2× its own leaf (1020 / 720). The export scale is still
   DERIVED (file ÷ leaf) rather than hardcoded, so the width is exact by
   construction — and because both scales are the integer 2, text rasterizes
   at the same device size in both files and the banded writer's seams land
   on every second row. See tallPng in share/export.ts. */
export const SHAPE_FILE_W: Record<ExportShape, number> = { wide: 2040, phone: 1440 }
/* The MAT is the same on both shapes. It is a slim even border, not a frame:
   the card is the object, and every pixel of mat is a pixel the card does not
   get in the file. Its floor is the tallest thing that VISIBLY overhangs a
   card — the decorations are tuned so nothing reaches past ~14px. */
export const MAT = 16
/* The CARD widths — the leaf is this plus the mat on both sides. `wide` is
   the broad column (988 + 16 mat each side = a 1020px leaf → 2040px file);
   `phone` is the standard column every screen shows (688 → a 720px leaf →
   1440px file). The on-screen compact sizing (`.card-compact`, ~350px) is a
   display concern that lives in cards.css and never enters an export. */
export const SHAPE_CARD_W: Record<ExportShape, number> = { wide: 988, phone: 688 }
export const SHAPE_W: Record<ExportShape, number> = {
  wide: SHAPE_CARD_W.wide + MAT * 2,
  phone: SHAPE_CARD_W.phone + MAT * 2,
}

export interface Settings {
  id: number
  name: string
  /** avatar seed — one of the drawn faces, or '' for no face */
  face: string
  onboarded: boolean
  defaultStyle: StyleId
  defaultCollage: StyleId
  /** PDF export is a settings thing — off by default, sharing is images only */
  pdfEnabled: boolean
  /** chrome theme only — the cards are printed objects and never go dark */
  theme: ThemeChoice
  shelfView: ShelfView
  /** remembered from the download sheet, and reused by Share */
  exportShape: ExportShape
}

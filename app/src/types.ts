export type StyleId = 'archive' | 'masthead' | 'catalogue' | 'scrapbook' | 'fieldnotes'
export type CollageId = 'contact' | 'shelf' | 'tickets' | 'pinboard' | 'ledger'

export const STYLE_IDS: StyleId[] = ['archive', 'masthead', 'catalogue', 'scrapbook', 'fieldnotes']
export const COLLAGE_IDS: CollageId[] = ['contact', 'shelf', 'tickets', 'pinboard', 'ledger']

export const STYLE_NAMES: Record<StyleId, string> = {
  archive: 'Archive',
  masthead: 'Masthead',
  catalogue: 'Catalogue',
  scrapbook: 'Scrapbook',
  fieldnotes: 'Field Notes',
}
export const COLLAGE_NAMES: Record<CollageId, string> = {
  contact: 'Contact Sheet',
  shelf: 'Shelf',
  tickets: 'Tickets',
  pinboard: 'Pinboard',
  ledger: 'Ledger',
}

/* the ground each style sits on — used for the little pastel swatch dots */
export const STYLE_GROUNDS: Record<StyleId, string> = {
  archive: '#DCA94C',
  masthead: '#F6EBD9',
  catalogue: '#221E1B',
  scrapbook: '#F3D9DD',
  fieldnotes: '#DAE4EE',
}
export const COLLAGE_GROUNDS: Record<CollageId, string> = {
  contact: '#221E1B',
  shelf: '#F6EBD9',
  tickets: '#F3D9DD',
  pinboard: '#DAE4EE',
  ledger: '#DCA94C',
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
  /** the review text — paragraphs separated by blank lines */
  body: string
  plates: Plate[]
  /** the style this review is displayed in; sharing can pick any style */
  style: StyleId
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

/* Which LAYOUT of the card gets saved — not what resolution, and not what
   background it sits on. The card CSS carries no media queries; its mobile
   sizing is the .card-compact class, chosen by whatever box the card is in.
   So the export can lay the same card out either way:
     wide  — the paper layout, cover beside the metadata
     phone — the compact layout, the card at exactly the width a handset gives it
   Both save as the card on its own mat; only the card's proportions differ.
   Deliberately not "portrait"/"landscape" — both are taller than they are
   wide, so that pair would describe neither one. */
export type ExportShape = 'wide' | 'phone'
export const EXPORT_SHAPES: readonly ExportShape[] = ['wide', 'phone'] as const
export const EXPORT_SHAPE_NAMES: Record<ExportShape, string> = {
  wide: 'Wide layout',
  phone: 'Phone layout',
}
/* One quality for both. Resolution was never the interesting choice here —
   a 3× file is not "for desktop", it is just a bigger file of the same thing. */
export const EXPORT_SCALE = 2
/* The MAT is the same on both shapes and cannot shrink: the rosette patch hangs
   ~45px past the card's top-right corner in absolute pixels, whatever the card's
   width, so a slimmer mat would clip it on the narrow shape. Measured, not
   guessed — see the overhang check in the QA sweep. */
export const MAT = 50
/* The width each layout composes the CARD at — the leaf is this plus the mat on
   both sides. A phone at 390 gives its card 350 after the app's 20px gutters, so
   that is the width the phone shape must reproduce: setting the LEAF to 390
   instead squeezed the card to 288, narrower than any handset ever shows it. */
export const SHAPE_CARD_W: Record<ExportShape, number> = { wide: 620, phone: 350 }
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
  defaultCollage: CollageId
  /** PDF export is a settings thing — off by default, sharing is images only */
  pdfEnabled: boolean
  /** chrome theme only — the cards are printed objects and never go dark */
  theme: ThemeChoice
  shelfView: ShelfView
  /** remembered from the download sheet, and reused by Share */
  exportShape: ExportShape
}

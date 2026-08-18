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
  /** the review text — paragraphs separated by blank lines */
  body: string
  plates: Plate[]
  /** the style this review is displayed in; sharing can pick any style */
  style: StyleId
  createdAt: number
}

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ShelfView = 'list' | 'covers'

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
}

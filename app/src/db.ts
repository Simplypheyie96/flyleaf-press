import Dexie, { type EntityTable } from 'dexie'
import type { Grave, Hopeful, Review, Settings } from './types'

export const db = new Dexie('flyleaf-press') as Dexie & {
  reviews: EntityTable<Review, 'id'>
  settings: EntityTable<Settings, 'id'>
  graves: EntityTable<Grave, 'key'>
  hopefuls: EntityTable<Hopeful, 'id'>
}

db.version(1).stores({
  reviews: '++id, no, title, author, finished, createdAt',
  settings: 'id',
})
/* v2 adds what sync needs: a stamp on every row so the two sides can tell
   whose copy is newer, and the headstones that let a deletion travel. Both are
   additive — v1 rows keep their ids and simply have no editedAt yet. */
db.version(2).stores({
  reviews: '++id, no, title, author, finished, createdAt, editedAt',
  settings: 'id',
  graves: 'key, at',
})
/* v3 adds the hopefuls — books picked for a month before they are read, which
   are a different kind of row from a review and not a review with holes in it:
   no rating, no dates, no body, and nothing to paginate. They live in their own
   table so nothing that walks the shelf, the collages or the stats has to learn
   to skip them. Additive, like v2: existing rows are untouched. */
db.version(3).stores({
  reviews: '++id, no, title, author, finished, createdAt, editedAt',
  settings: 'id',
  graves: 'key, at',
  hopefuls: '++id, month, createdAt, editedAt',
})

const SETTINGS_DEFAULTS: Settings = {
  id: 1,
  name: '',
  face: '',
  onboarded: false,
  defaultStyle: 'archive',
  defaultCollage: 'archive',
  pdfEnabled: false,
  theme: 'system',
  shelfView: 'list',
  /* the paper layout by default — it's the card as the app composed it, and
     the compact one is a deliberate choice for posting from a phone */
  exportShape: 'wide',
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get(1)
  /* rows written by older versions lack the newer fields — fill, keep, persist */
  const merged: Settings = { ...SETTINGS_DEFAULTS, ...(s ?? {}) }
  if (!s || Object.keys(SETTINGS_DEFAULTS).some((k) => !(k in s))) {
    await db.settings.put(merged)
  }
  return merged
}

export async function nextReviewNo(): Promise<number> {
  const last = await db.reviews.orderBy('no').last()
  return (last?.no ?? 0) + 1
}

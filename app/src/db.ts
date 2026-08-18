import Dexie, { type EntityTable } from 'dexie'
import type { Review, Settings } from './types'

export const db = new Dexie('flyleaf-press') as Dexie & {
  reviews: EntityTable<Review, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  reviews: '++id, no, title, author, finished, createdAt',
  settings: 'id',
})

const SETTINGS_DEFAULTS: Settings = {
  id: 1,
  name: '',
  face: '',
  onboarded: false,
  defaultStyle: 'archive',
  defaultCollage: 'ledger',
  pdfEnabled: false,
  theme: 'system',
  shelfView: 'list',
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

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Hopeful } from './types'
import type { Candidate } from './catalog'

/* What the hopefuls list, and Home all need to know about a
   picked book: has it been reviewed yet, and how to open the editor on it. */

/** The same flattening the Goodreads dedupe uses, for the same reason: two
    catalogues, or a catalogue and a hand edit, disagree about spacing and case
    long before they disagree about the book. */
export const flat = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/* A hopeful stops being a hopeful when the book gets read, and a review can be
   written from anywhere — so the match is on content, not on an id: title and
   author, flattened, exactly as the sync fold and the Goodreads import match.

   It reads the TITLE INDEX KEYS first and fetches only the rows whose title
   flattens onto one we are asking about. `db.reviews.toArray()` would pull every
   body and cover data URL to read two fields off each row. Returns hopeful id →
   review id. */
export function useReviewed(rows: Hopeful[] | undefined) {
  const stamp = (rows ?? []).map((h) => `${h.id}:${flat(h.title)}|${flat(h.author)}`).join('~')
  return useLiveQuery(async () => {
    const found = new Map<number, number>()
    const want = rows ?? []
    if (want.length === 0) return found
    const wanted = new Set(want.map((h) => flat(h.title)))
    const keys = (await db.reviews.orderBy('title').keys()) as string[]
    const hits = [...new Set(keys.filter((t) => wanted.has(flat(t))))]
    if (hits.length === 0) return found
    const mine = await db.reviews.where('title').anyOf(hits).toArray()
    for (const h of want) {
      if (h.id == null) continue
      const hit = mine.find((r) => flat(r.title) === flat(h.title) && flat(r.author) === flat(h.author))
      if (hit?.id != null) found.set(h.id, hit.id)
    }
    return found
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])
}

/* Route state that opens the editor on its second step, filled in, with the
   cover already chosen. The id deliberately does NOT travel: saving a review
   never removes a hopeful — it is matched by content instead. */
export const writeState = (h: Hopeful) => ({
  candidate: {
    title: h.title,
    author: h.author,
    series: h.series,
    isbn: h.isbn,
    pages: h.pages,
    covers: h.covers ?? [],
    source: 'openlibrary',
  } satisfies Candidate,
  cover: h.cover,
})

/* Days since a book was started, counting the first day as day 1. */
export const dayOf = (startedAt: number) => Math.max(1, Math.floor((Date.now() - startedAt) / 86400000) + 1)

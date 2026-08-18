/* One format, one merge, two doors.

   A library that arrives from Google Drive and a library restored from a file
   somebody emailed themselves are the same document read the same way. That is
   deliberate: two readers of the format would drift, and the one that got less
   testing would be the one somebody's whole shelf came back through.

   IDENTITY IS CONTENT, NOT ROW ID. Auto-increment ids are per-device — the
   fourth review written on a phone and the fourth written on a laptop are both
   id 4 and are not the same book. So a review is recognised by its title, its
   author, and the day it was finished. Two devices that were handed the same
   book from the same catalogue produce the same fingerprint, which is what
   makes merging idempotent: syncing twice adds nothing the second time. */

import { db } from '../db'
import type { Grave, Review } from '../types'

export const FORMAT = 'flyleaf-press'
export const VERSION = 2

export interface LibraryFile {
  app: string
  version: number
  reviews: Review[]
  graves?: Grave[]
}

/** What makes two rows the same book. Case and surrounding space are noise —
    "The Salt Path" typed by hand and "The Salt Path " from a catalogue are one
    book, and a merge that thought otherwise would quietly double the shelf. */
export function fingerprint(r: Pick<Review, 'title' | 'author' | 'finished'>): string {
  const flat = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `${flat(r.title)}|${flat(r.author)}|${r.finished ?? ''}`
}

/** When a row was last written. Rows from before sync existed have no stamp;
    the day they were created is the honest answer for them. */
export function stampOf(r: Review): number {
  return r.editedAt ?? r.createdAt ?? 0
}

export async function exportLibrary(): Promise<LibraryFile> {
  const [reviews, graves] = await Promise.all([db.reviews.toArray(), db.graves.toArray()])
  return { app: FORMAT, version: VERSION, reviews, graves }
}

export async function exportBlob(): Promise<Blob> {
  return new Blob([JSON.stringify(await exportLibrary())], { type: 'application/json' })
}

/** Record that a review was deleted here, so the deletion reaches the other
    device instead of being undone by it. Called by every delete path. */
export async function bury(r: Review): Promise<void> {
  await db.graves.put({ key: fingerprint(r), at: Date.now() })
}

export interface MergeResult {
  /** Reviews that were not on this device before. */
  added: number
  /** Reviews already here whose other copy was newer, and won. */
  updated: number
  /** Reviews removed here because the other side had deleted them. */
  removed: number
}

/**
 * Fold another library into this one. It cannot lose work: a row is only ever
 * replaced by a copy of ITSELF that was written later, and never by less than
 * itself. That invariant is what makes it safe for sync.ts to overwrite the
 * Drive copy wholesale — what goes up is always the union of both sides.
 *
 * The one thing that does remove a row is a headstone that postdates it. A
 * deletion is work too, and a merge that silently resurrected a review
 * somebody had thrown away would be the same bug as one that lost it.
 */
export async function mergeLibrary(text: string): Promise<MergeResult> {
  let data: LibraryFile
  try {
    data = JSON.parse(text) as LibraryFile
  } catch {
    throw new Error('That file isn’t readable — it doesn’t look like a Flyleaf Press export.')
  }
  if (!Array.isArray(data?.reviews)) {
    throw new Error('That file isn’t a Flyleaf Press library.')
  }

  const [mine, myGraves] = await Promise.all([db.reviews.toArray(), db.graves.toArray()])
  const here = new Map(mine.map((r) => [fingerprint(r), r]))

  /* Both sides' headstones, latest wins — so a review deleted on the phone and
     then deliberately written again on the laptop survives, because the second
     writing is newer than the burial. */
  const graves = new Map<string, number>()
  for (const g of [...myGraves, ...(data.graves ?? [])]) {
    graves.set(g.key, Math.max(graves.get(g.key) ?? 0, g.at))
  }

  const result: MergeResult = { added: 0, updated: 0, removed: 0 }

  /* Numbering stays local. `no` is the Nº printed on the colophon, and cards
     have already been shared carrying it — renumbering the shelf to agree with
     another device would rewrite a number somebody has handed out. So an
     arriving review takes the next free number HERE, and the two devices can
     hold the same book under different numbers. That is a visible divergence
     and it is the smaller one. */
  let nextNo = mine.reduce((m, r) => Math.max(m, r.no ?? 0), 0)

  for (const raw of data.reviews) {
    if (!raw?.title || !raw.finished || typeof raw.rating !== 'number') continue
    const key = fingerprint(raw)
    const stamp = stampOf(raw)
    const buried = graves.get(key)
    if (buried !== undefined && buried >= stamp) continue

    const existing = here.get(key)
    if (!existing) {
      const { id: _drop, ...rest } = raw
      await db.reviews.add({ ...rest, no: ++nextNo } as Review)
      result.added++
      continue
    }
    if (stamp > stampOf(existing)) {
      const { id: _drop, no: _keepNo, ...rest } = raw
      await db.reviews.update(existing.id as number, rest as Partial<Review>)
      result.updated++
    }
  }

  /* Deletions made elsewhere, applied here. Only for rows this device has not
     touched since — an edit that postdates the burial means it was written
     again on purpose. */
  for (const [key, at] of graves) {
    const row = here.get(key)
    if (row && stampOf(row) <= at) {
      await db.reviews.delete(row.id as number)
      result.removed++
    }
  }

  /* Headstones travel on, so a third device still holding the review learns
     about the deletion too. */
  if (graves.size) {
    await db.graves.bulkPut([...graves].map(([key, at]) => ({ key, at })))
  }

  return result
}

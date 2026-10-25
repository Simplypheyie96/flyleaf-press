/* One format, one merge, two doors.

   A library that arrives from the Flyleaf account and a library restored from a file
   somebody emailed themselves are the same document read the same way. That is
   deliberate: two readers of the format would drift, and the one that got less
   testing would be the one somebody's whole shelf came back through.

   IDENTITY IS CONTENT, NOT ROW ID. Auto-increment ids are per-device — the
   fourth review written on a phone and the fourth written on a laptop are both
   id 4 and are not the same book. So a review is recognised by its title, its
   author, and the day it was finished. Two devices that were handed the same
   book from the same catalogue produce the same fingerprint, which is what
   makes merging idempotent: syncing twice adds nothing the second time. */

import { SETTINGS_DEFAULTS, db } from '../db'
import type { Grave, Hopeful, Review } from '../types'

/** Every table that holds somebody's work, and so must travel. sync.ts
    watches exactly these, and `npm run check:sync` fails the build when a
    table in db.ts is in neither list — a new kind of row cannot again be
    added without being synced, the way hopefuls once were. */
export const SYNCED = ['reviews', 'hopefuls'] as const
/** Tables that do not travel as rows: settings stays per device (only the name
    and face ride along, as `profile`), and graves travel inside the merge. */
export const NOT_ROWS = ['settings', 'graves'] as const

export const FORMAT = 'flyleaf-press'
export const VERSION = 4

export interface LibraryFile {
  app: string
  version: number
  reviews: Review[]
  graves?: Grave[]
  /* The months' picked-but-unread books. Optional, because a version-3 file
     predates them — and absent is read as "don't know", never as "none". */
  hopefuls?: Hopeful[]
  /* Who was writing these — the name and the drawn face, nothing else. A
     library restored onto a new phone that came back as an anonymous shelf
     would have restored the books and lost the reader; the name is printed on
     the cards. Optional, because a version-2 file predates it, and absent is
     read as "don't know", never as "blank". */
  profile?: { name: string; face: string }
}

/** What makes two rows the same book. Case and surrounding space are noise —
    "The Salt Path" typed by hand and "The Salt Path " from a catalogue are one
    book, and a merge that thought otherwise would quietly double the shelf. */
export function fingerprint(r: Pick<Review, 'title' | 'author' | 'finished'>): string {
  const flat = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `${flat(r.title)}|${flat(r.author)}|${r.finished ?? ''}`
}

/** A hopeful is the same book picked for the same month. The `h|` prefix keeps
    its headstones in the one graves table without ever matching a review's. */
export function hopefulPrint(h: Pick<Hopeful, 'month' | 'title' | 'author'>): string {
  const flat = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `h|${h.month}|${flat(h.title)}|${flat(h.author)}`
}

/** When a row was last written. Rows from before sync existed have no stamp;
    the day they were created is the honest answer for them. */
export function stampOf(r: Review | Hopeful): number {
  return r.editedAt ?? r.createdAt ?? 0
}

export async function exportLibrary(): Promise<LibraryFile> {
  const [reviews, graves, hopefuls, settings] = await Promise.all([
    db.reviews.toArray(),
    db.graves.toArray(),
    db.hopefuls.toArray(),
    db.settings.get(1),
  ])
  const profile = settings ? { name: settings.name, face: settings.face } : undefined
  return { app: FORMAT, version: VERSION, reviews, graves, hopefuls, profile }
}

export async function exportBlob(): Promise<Blob> {
  return new Blob([JSON.stringify(await exportLibrary())], { type: 'application/json' })
}

/* COVERS TRAVEL BESIDE THE LIBRARY, NOT INSIDE IT. An uploaded cover or plate
   is a data URL on the row, and a shelf of them would push the account copy
   past the 8 MB one sync can carry. So the copy sent to the account carries
   `media:<sha-256>` where each image was, and the images go up once each, by
   that hash, ahead of it. A file somebody exports still carries every image
   inline: it has to stand on its own. */
const REF = 'media:'

function decode(url: string): { type: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0) return null
  const head = url.slice(5, comma).split(';')
  if (!head.includes('base64')) return null
  const bin = atob(url.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { type: head[0] || 'application/octet-stream', bytes }
}

async function dataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`
}

/** The same row with every image (the cover, and a review's plates) passed
    through `swap`. */
async function images<T extends Review | Hopeful>(row: T, swap: (s: string) => Promise<string>): Promise<T> {
  const out = { ...row }
  if (out.cover) out.cover = await swap(out.cover)
  const plates = (out as Review).plates
  if (Array.isArray(plates)) {
    ;(out as Review).plates = await Promise.all(plates.map(async (p) => (p.image ? { ...p, image: await swap(p.image) } : p)))
  }
  return out
}

/** The library as the account keeps it: images by reference, and the images. */
export async function exportForCloud(): Promise<{ blob: Blob; media: Map<string, Blob> }> {
  const library = await exportLibrary()
  const media = new Map<string, Blob>()
  const out = async (s: string) => {
    const raw = decode(s)
    if (!raw) return s
    const digest = await crypto.subtle.digest('SHA-256', raw.bytes)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    media.set(hash, new Blob([raw.bytes], { type: raw.type }))
    return REF + hash
  }
  library.reviews = await Promise.all(library.reviews.map((r) => images(r, out)))
  library.hopefuls = await Promise.all((library.hopefuls ?? []).map((h) => images(h, out)))
  return { blob: new Blob([JSON.stringify(library)], { type: 'application/json' }), media }
}

/** Record that a review was deleted here, so the deletion reaches the other
    device instead of being undone by it. Called by every delete path. */
export async function bury(r: Review): Promise<void> {
  await db.graves.put({ key: fingerprint(r), at: Date.now() })
}

/** Remove a hopeful and leave a headstone, for the same reason as `bury`. */
export async function dropHopeful(h: Hopeful): Promise<void> {
  await db.graves.put({ key: hopefulPrint(h), at: Date.now() })
  await db.hopefuls.delete(h.id as number)
}

/** Carry books to another month's list. The month is part of a hopeful's
    print, so the old print gets a headstone or the next sync would bring the
    book back to the month it left. A book already on the new list just goes. */
export async function moveHopefuls(books: Hopeful[], month: string): Promise<void> {
  const there = new Set((await db.hopefuls.where('month').equals(month).toArray()).map(hopefulPrint))
  for (const h of books) {
    if (there.has(hopefulPrint({ ...h, month }))) { await dropHopeful(h); continue }
    await db.graves.put({ key: hopefulPrint(h), at: Date.now() })
    await db.hopefuls.update(h.id as number, { month, editedAt: Date.now() })
  }
}

/** How each synced table names a row on its headstone. Typed over SYNCED, so
    a table cannot be added there without saying how its deletions travel. */
const PRINTS: { [T in (typeof SYNCED)[number]]: (row: never) => string } = {
  reviews: fingerprint,
  hopefuls: hopefulPrint,
}

/** Delete everything a reader has put in the app: every row of every synced
    table, the name, the face and every preference, back to a first run. Each
    row leaves a headstone so the wipe reaches the other device instead of being
    undone by the next sync — the headstones and the account sign-in are the
    only things kept, because they are how the deletion travels. Removing the
    account copy itself is sync.ts's `clearAccount`, which Settings runs after
    this. */
export async function deleteEverything(): Promise<void> {
  const at = Date.now()
  for (const name of SYNCED) {
    const rows = await db.table(name).toArray()
    await db.graves.bulkPut(rows.map((r) => ({ key: PRINTS[name](r as never), at })))
    await db.table(name).clear()
  }
  await db.settings.put(SETTINGS_DEFAULTS)
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
 * account copy wholesale — what goes up is always the union of both sides.
 *
 * The one thing that does remove a row is a headstone that postdates it. A
 * deletion is work too, and a merge that silently resurrected a review
 * somebody had thrown away would be the same bug as one that lost it.
 */
export async function mergeLibrary(
  text: string,
  how: { media?: (hash: string) => Promise<Blob> } = {},
): Promise<MergeResult> {
  let data: LibraryFile
  try {
    data = JSON.parse(text) as LibraryFile
  } catch {
    throw new Error('That file isn’t readable — it doesn’t look like a Flyleaf Press or Bookprint export.')
  }
  if (!Array.isArray(data?.reviews)) {
    throw new Error('That file isn’t a Flyleaf Press or Bookprint library.')
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

  /* Images by reference come down only for rows that are actually written
     here, and each image once. */
  const fetched = new Map<string, Promise<string>>()
  const inflate = <T extends Review | Hopeful>(row: T) =>
    images(row, async (s) => {
      if (!s.startsWith(REF)) return s
      if (!how.media) throw new Error('That library refers to covers it does not carry.')
      const hash = s.slice(REF.length)
      if (!fetched.has(hash)) fetched.set(hash, how.media(hash).then(dataUrl))
      return fetched.get(hash)!
    })

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
      const { id: _drop, ...rest } = await inflate(raw)
      await db.reviews.add({ ...rest, no: ++nextNo } as Review)
      result.added++
      continue
    }
    if (stamp > stampOf(existing)) {
      const { id: _drop, no: _keepNo, ...rest } = await inflate(raw)
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

  /* Hopefuls, by the same rules: a row is only replaced by a later copy of
     itself, and only a later headstone removes one. */
  const myHopefuls = await db.hopefuls.toArray()
  const hopefulsHere = new Map(myHopefuls.map((h) => [hopefulPrint(h), h]))
  for (const raw of data.hopefuls ?? []) {
    if (!raw?.title || !raw.month) continue
    const key = hopefulPrint(raw)
    const stamp = stampOf(raw)
    const buried = graves.get(key)
    if (buried !== undefined && buried >= stamp) continue
    const existing = hopefulsHere.get(key)
    if (!existing) {
      const { id: _drop, ...rest } = await inflate(raw)
      await db.hopefuls.add(rest as Hopeful)
      hopefulsHere.set(key, rest as Hopeful)
    } else if (stamp > stampOf(existing)) {
      const { id: _drop, ...rest } = await inflate(raw)
      await db.hopefuls.update(existing.id as number, rest)
    }
  }
  for (const [key, at] of graves) {
    const row = hopefulsHere.get(key)
    if (row?.id != null && stampOf(row) <= at) await db.hopefuls.delete(row.id)
  }

  /* Headstones travel on, so a third device still holding the review learns
     about the deletion too. */
  if (graves.size) {
    await db.graves.bulkPut([...graves].map(([key, at]) => ({ key, at })))
  }

  /* The name and face come across ONLY onto a device that has none of its
     own. A merge may not overwrite a choice somebody made here — two devices
     can legitimately carry different names, and the fold rule everywhere else
     in this file is "never replace something with less than itself". Blank is
     less than a name. In practice this fires exactly once: on the device that
     has just been installed and has not been through onboarding. */
  if (data.profile) {
    const settings = await db.settings.get(1)
    if (settings && !settings.name && !settings.face) {
      await db.settings.update(1, { name: data.profile.name, face: data.profile.face })
    }
  }

  return result
}

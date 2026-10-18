/* The guard that keeps sync from quietly leaving a kind of row behind again.

   Hopefuls shipped in their own table and never went to Drive, because nothing
   forced the question. This runs before every build, so a deploy cannot go out
   with a table, a field, an edit or a deletion that does not survive the trip
   between two devices. It drives the real export and merge against an
   in-memory IndexedDB — two devices are played by wiping between them. */

import 'fake-indexeddb/auto'
import { db } from '../src/db'
import { NOT_ROWS, SYNCED, dropHopeful, bury, exportLibrary, mergeLibrary } from '../src/sync/backup'
import type { Hopeful, Review } from '../src/types'

type Synced = (typeof SYNCED)[number]

/* One full row per synced table, every optional field filled, so a field the
   export or merge drops shows up as a difference. A new table fails below
   until it has one here. */
const FIXTURES: Record<Synced, () => Record<string, unknown>> = {
  reviews: (): Review => ({
    no: 1, title: 'Piranesi', author: 'Susanna Clarke', series: 'S', seriesNo: '1',
    started: '2026-01-01', finished: '2026-01-09', formats: ['Physical'], rating: 4.5,
    cover: 'data:image/png;base64,AA', covers: ['https://x/c.jpg'], isbn: '9781635575637',
    pages: 272, tags: ['fantasy'], body: 'A house of tides.', plates: [], style: 'archive',
    hand: 'shantell' as Review['hand'], source: 'goodreads', createdAt: 1000, editedAt: 2000,
  }),
  hopefuls: (): Hopeful => ({
    month: '2026-10', title: 'Circe', author: 'Madeline Miller', series: 'S', isbn: '9780316556347',
    cover: 'data:image/png;base64,AA', covers: ['https://x/c.jpg'], pages: 393, createdAt: 1000, editedAt: 2000,
  }),
}

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const strip = ({ id: _i, no: _n, ...rest }: Record<string, unknown>) => rest
const wipe = () => Promise.all(db.tables.map((t) => t.clear()))
const asText = async () => JSON.stringify(await exportLibrary())

/* 1. Every table is accounted for. */
const known = new Set<string>([...SYNCED, ...NOT_ROWS])
for (const t of db.tables) {
  if (!known.has(t.name)) {
    fail(`Table "${t.name}" is not synced. Add it to SYNCED in src/sync/backup.ts, export and merge it there, and give it a fixture in scripts/sync-check.ts — or list it in NOT_ROWS with the reason it stays on one device.`)
  }
}
for (const name of SYNCED) {
  const schema = db.table(name).schema
  for (const index of ['createdAt', 'editedAt']) {
    if (!schema.indexes.some((i) => i.name === index)) {
      fail(`Table "${name}" needs an index on ${index}: sync uses it to notice changes.`)
    }
  }
}

/* 2. Every row, with every field, arrives on the other device. */
await wipe()
for (const name of SYNCED) await db.table(name).add(FIXTURES[name]())
const phone = await asText()
await wipe()
await mergeLibrary(phone)
for (const name of SYNCED) {
  const rows = await db.table(name).toArray()
  if (rows.length !== 1) {
    fail(`"${name}" did not arrive on the other device (${rows.length} rows after merge).`)
    continue
  }
  const want = strip(FIXTURES[name]())
  const got = strip(rows[0])
  for (const key of Object.keys(want)) {
    if (JSON.stringify(got[key]) !== JSON.stringify(want[key])) fail(`"${name}.${key}" was lost on the way across.`)
  }
}

/* 3. Merging twice adds nothing. */
await mergeLibrary(phone)
for (const name of SYNCED) {
  const n = await db.table(name).count()
  if (n !== 1) fail(`Merging "${name}" twice made ${n} rows — the merge is not idempotent.`)
}

/* 4. A newer edit wins on the other device. */
await wipe()
await mergeLibrary(phone)
await db.reviews.toCollection().modify({ body: 'edited', editedAt: 9000 })
await db.hopefuls.toCollection().modify({ cover: 'data:edited', editedAt: 9000 })
const edited = await asText()
await wipe()
await mergeLibrary(phone)
await mergeLibrary(edited)
if ((await db.reviews.toArray())[0]?.body !== 'edited') fail('An edited review did not reach the other device.')
if ((await db.hopefuls.toArray())[0]?.cover !== 'data:edited') fail('An edited hopeful did not reach the other device.')

/* 5. A deletion reaches the other device, and a stale copy cannot undo it. */
await wipe()
await mergeLibrary(phone)
for (const r of await db.reviews.toArray()) await bury(r)
await db.reviews.clear()
for (const h of await db.hopefuls.toArray()) await dropHopeful(h)
const deleted = await asText()
await wipe()
await mergeLibrary(phone)
await mergeLibrary(deleted)
for (const name of SYNCED) {
  const n = await db.table(name).count()
  if (n !== 0) fail(`A "${name}" row deleted on one device survived on the other.`)
}

if (failures.length) {
  console.error(`Sync check failed:\n${failures.map((f) => `  • ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`Sync check passed: ${SYNCED.join(', ')} travel whole, edits and deletions included.`)

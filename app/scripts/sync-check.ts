/* The guard that keeps sync from quietly leaving a kind of row behind again.

   Hopefuls shipped in their own table and never synced, because nothing
   forced the question. This runs before every build, so a deploy cannot go out
   with a table, a field, an edit or a deletion that does not survive the trip
   between two devices. It drives the real export and merge against an
   in-memory IndexedDB — two devices are played by wiping between them. */

import 'fake-indexeddb/auto'
import { SETTINGS_DEFAULTS, db } from '../src/db'
import { NOT_ROWS, SYNCED, deleteEverything, exportForCloud, exportLibrary, mergeLibrary } from '../src/sync/backup'
import type { Hopeful, Review } from '../src/types'

type Synced = (typeof SYNCED)[number]

/* One full row per synced table, every optional field filled, so a field the
   export or merge drops shows up as a difference. A new table fails below
   until it has one here. */
const FIXTURES: Record<Synced, () => Record<string, unknown>> = {
  reviews: (): Review => ({
    no: 1, title: 'Piranesi', author: 'Susanna Clarke', series: 'S', seriesNo: '1',
    started: '2026-01-01', finished: '2026-01-09', formats: ['Physical'], rating: 4.5,
    cover: 'data:image/png;base64,AAAA', covers: ['https://x/c.jpg'], isbn: '9781635575637',
    pages: 272, tags: ['fantasy'], body: 'A house of tides.', plates: [{ image: 'data:image/jpeg;base64,AQID', caption: 'Tide' }], style: 'archive',
    hand: 'shantell' as Review['hand'], source: 'goodreads', createdAt: 1000, editedAt: 2000,
  }),
  hopefuls: (): Hopeful => ({
    month: '2026-10', title: 'Circe', author: 'Madeline Miller', series: 'S', isbn: '9780316556347',
    cover: 'data:image/png;base64,AAAA', covers: ['https://x/c.jpg'], pages: 393, createdAt: 1000, editedAt: 2000,
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

/* 5. A deletion reaches the other device, and a stale copy cannot undo it.
   Goes through deleteEverything — the path Delete everything takes — so a synced
   table it forgets fails here, and so does a preference it leaves behind. */
await wipe()
await mergeLibrary(phone)
await deleteEverything()
const deleted = await asText()
await wipe()
await mergeLibrary(phone)
await mergeLibrary(deleted)
for (const name of SYNCED) {
  const n = await db.table(name).count()
  if (n !== 0) fail(`A "${name}" row deleted on one device survived on the other.`)
}
await db.settings.put({ ...SETTINGS_DEFAULTS, name: 'Reader', face: 'f1', onboarded: true, theme: 'dark' })
await deleteEverything()
if (JSON.stringify(await db.settings.get(1)) !== JSON.stringify(SETTINGS_DEFAULTS))
  fail('Delete everything left a setting, the name or the face behind.')

/* 6. The account copy carries covers and plates by reference, never inline,
   and they come back whole on the other device. Run through exportForCloud
   and a merge fed from the media it handed over — the same pair sync.ts uses
   with the Worker in between. */
await wipe()
for (const name of SYNCED) await db.table(name).add(FIXTURES[name]())
const cloud = await exportForCloud()
const doc = await cloud.blob.text()
if (doc.includes('data:image')) fail('An image went into the account copy inline instead of by reference — it would push the copy past what one sync carries.')
if (cloud.media.size !== 2) fail(`The account copy handed over ${cloud.media.size} images; expected 2 (the cover, shared by both rows, and the plate).`)
await wipe()
await mergeLibrary(doc, {
  media: async (hash) => {
    const blob = cloud.media.get(hash)
    if (!blob) throw new Error(`missing ${hash}`)
    return blob
  },
})
for (const name of SYNCED) {
  const row = (await db.table(name).toArray())[0] as (Review & Hopeful) | undefined
  const want = FIXTURES[name]() as Review & Hopeful
  if (row?.cover !== want.cover) fail(`A "${name}" cover did not come back whole through the account.`)
  if (name === 'reviews' && row?.plates?.[0]?.image !== want.plates[0].image) fail('A plate image did not come back whole through the account.')
}

if (failures.length) {
  console.error(`Sync check failed:\n${failures.map((f) => `  • ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`Sync check passed: ${SYNCED.join(', ')} travel whole, edits, deletions and covers included.`)

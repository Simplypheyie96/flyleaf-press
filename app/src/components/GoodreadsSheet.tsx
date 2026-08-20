import { useEffect, useRef, useState } from 'react'
import { FORMAT_NAMES, type FormatName } from '../types'
import { FORMAT, VERSION, type LibraryFile } from '../sync/backup'
import { mergeLibrary } from '../sync/backup'
import {
  scanGoodreads, toReviews, AUTO_RATING, FROM_YEAR,
  type GrBook, type GrScan,
} from '../import/goodreads'
import { backfillCovers, type Progress } from '../import/covers'

/* Reading in a Goodreads export.

   THE SCAN WRITES NOTHING. It reads the file, lists what it found, and stops.
   Every book that CAN come in is a row with a checkbox: the complete ones
   arrive checked, and the ones with a gap — no rating, no date read — arrive
   unchecked, each saying exactly what checking it will do. Nothing is filled
   in silently: a checked unrated book comes in rated 3 (the middle of the
   scale, there to be corrected), and a checked undated book is dated today.
   Both say so on their own row, in so many words, before the button is
   pressed.

   The one grouped question stays: Goodreads records an EDITION word
   (Paperback, Kindle Edition, Audio CD) rather than a medium, and sometimes
   records nothing at all. "What were these read on?" is answerable in one
   tap and covers every such row at once.

   The one thing with NO checkbox is a book finished before the window opens.
   The import takes 2026 onward — a hard wall, not a default — so those rows
   are counted and left out, with the sentence saying why. */

type Stage = 'reading' | 'report' | 'importing' | 'done'

interface Item {
  b: GrBook
  key: string
  /** complete rows arrive checked; rows with a gap arrive unchecked */
  sure: boolean
  /** what checking this row fills in, or nothing for a complete one */
  note?: string
}

function itemsOf(scan: GrScan): Item[] {
  const mk = (b: GrBook, sure: boolean): Item => {
    const gaps: string[] = []
    if (!b.rating) gaps.push(`no rating — comes in rated ${AUTO_RATING}`)
    if (!b.finished) gaps.push('no date read — comes in dated today')
    if (!b.formats.length) gaps.push('format from the pick below')
    return {
      b,
      key: `${b.title}|${b.author}|${b.finished}`,
      sure,
      note: gaps.join(' · ') || undefined,
    }
  }
  return [
    ...scan.ready.map((b) => mk(b, true)),
    ...scan.needFormat.map((b) => mk(b, true)),
    ...scan.unrated.map((b) => mk(b, false)),
    ...scan.noDate.map((b) => mk(b, false)),
  ]
}

export function GoodreadsSheet({ file, onClose }: { file: File; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('reading')
  const [scan, setScan] = useState<GrScan | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [fmt, setFmt] = useState<FormatName>('Physical')
  const [added, setAdded] = useState(0)
  const [cov, setCov] = useState<Progress | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    let live = true
    file.text()
      .then((t) => scanGoodreads(t))
      .then((s) => {
        if (!live) return
        const it = itemsOf(s)
        setScan(s)
        setItems(it)
        setSel(new Set(it.filter((i) => i.sure).map((i) => i.key)))
        setFmt(s.commonFormat)
        setStage('report')
      })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : String(e)); setStage('report') } })
    return () => { live = false }
  }, [file])

  /* Escape closes, except while something is being written — backing out
     halfway through a merge would leave a shelf nobody can describe. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage !== 'importing') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function close() {
    abort.current?.abort()
    onClose()
  }

  function toggle(key: string) {
    setSel((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const picked = items.filter((i) => sel.has(i.key)).map((i) => i.b)
  /* the format question is shown whenever any LISTED row lacks one, selected
     or not — a question that appears and disappears as boxes are ticked would
     jump the sheet around under the finger doing the ticking */
  const asksFormat = items.some((i) => !i.b.formats.length)

  async function run() {
    if (!scan || !picked.length) return
    setStage('importing')
    const reviews = toReviews(picked, fmt)
    /* THE THIRD DOOR. This does not touch the database itself — it hands the
       rows to the same fold a hand-carried backup and a Drive sync arrive
       through, so the exact-fingerprint dedupe, the tombstone check that keeps
       a deliberately deleted book from coming back, and the local Nº numbering
       are all the behaviour that is already tested rather than a second
       implementation of it. */
    const lib: LibraryFile = { app: FORMAT, version: VERSION, reviews }
    const res = await mergeLibrary(JSON.stringify(lib))
    setAdded(res.added)

    /* Then go and find the artwork. A Goodreads export carries none at all, so
       without this every imported book is a blank card. It runs here rather
       than on a later visit because this is the moment somebody is watching
       and can see it happen. */
    if (res.added > 0) {
      abort.current = new AbortController()
      await backfillCovers(setCov, abort.current.signal)
    }
    setStage('done')
  }

  const willAdd = sel.size

  return (
    <div
      className="share-scrim"
      onClick={(e) => e.target === e.currentTarget && stage !== 'importing' && close()}
      role="dialog"
      aria-modal="true"
      aria-label="Import from Goodreads"
    >
      <div className="confirm-sheet">
        <div className="ui-lbl">Import from Goodreads</div>

        {stage === 'reading' && <p>Reading the file…</p>}

        {error && <p>{error}</p>}

        {stage === 'report' && scan && !error && (
          <>
            <p>
              {scan.total} row{scan.total === 1 ? '' : 's'} in the file.
              {' '}Nothing has been added yet.
            </p>

            {(scan.duplicates.length > 0 || scan.beforeWindow > 0 || scan.otherShelves > 0) && (
              <dl className="gr-tally">
                {scan.duplicates.length > 0 && <Row n={scan.duplicates.length} what="already on your shelf" />}
                {scan.beforeWindow > 0 && (
                  <Row n={scan.beforeWindow} what={`finished before ${FROM_YEAR} — the import takes ${FROM_YEAR} onward`} />
                )}
                {scan.otherShelves > 0 && <Row n={scan.otherShelves} what="not on your read shelf" />}
              </dl>
            )}

            {items.length > 0 && (
              <div className="gr-ask">
                <div className="ui-lbl">The books</div>
                {/* a real export is a year of reading — checking forty boxes one
                    at a time is not an interface, so past a handful the list
                    carries its own bulk controls and a running count */}
                {items.length > 6 && (
                  <div className="gr-bulk">
                    <span>{sel.size} of {items.length} checked</span>
                    <button type="button" onClick={() => setSel(new Set(items.map((i) => i.key)))}>
                      Check all
                    </button>
                    <button type="button" onClick={() => setSel(new Set())}>
                      Uncheck all
                    </button>
                  </div>
                )}
                {items.some((i) => i.note) && (
                  <p>
                    Books with a gap arrive unchecked. Check one and the gap is
                    filled the way its row says — a placeholder to correct on
                    the book's own page, never left blank.
                  </p>
                )}
                <ul className="gr-list">
                  {items.map((i) => (
                    <li key={i.key}>
                      <label className="gr-item">
                        <input
                          type="checkbox"
                          checked={sel.has(i.key)}
                          onChange={() => toggle(i.key)}
                        />
                        <span>
                          <span className="gr-item-t">{i.b.title} — {i.b.author}</span>
                          {i.note && <span className="gr-item-n">{i.note}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {asksFormat && (
              <div className="gr-ask">
                <div className="ui-lbl">What were these read on?</div>
                <p>
                  Goodreads records the edition rather than the medium, and said
                  nothing for some of these. The pick covers every book missing
                  a format.
                </p>
                <div className="fmt-pick">
                  {FORMAT_NAMES.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={fmt === f}
                      onClick={() => setFmt(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="confirm-actions">
              <button className="btn" onClick={run} disabled={willAdd === 0} autoFocus>
                {willAdd === 0
                  ? 'Nothing to import'
                  : `Import ${willAdd} book${willAdd === 1 ? '' : 's'}`}
              </button>
              <button className="btn btn--ghost" onClick={close}>Cancel</button>
            </div>
          </>
        )}

        {stage === 'importing' && (
          <>
            <p>
              {cov
                ? cov.waiting
                  ? 'A catalogue is rate-limiting us. Waiting a minute, then carrying on.'
                  : `Looking up covers — ${cov.done} of ${cov.total}.`
                : 'Adding the books…'}
            </p>
            {cov && cov.total > 0 && (
              <>
                <div className="gr-bar" role="progressbar" aria-valuenow={cov.done} aria-valuemin={0} aria-valuemax={cov.total}>
                  <span style={{ width: `${Math.round((cov.done / cov.total) * 100)}%` }} />
                </div>
                {cov.current && <p className="gr-now">{cov.current}</p>}
              </>
            )}
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => abort.current?.abort()}>
                Stop looking up covers
              </button>
            </div>
          </>
        )}

        {stage === 'done' && (
          <>
            <p>
              {added === 0
                ? 'Nothing new was added — every book in the file was already on your shelf.'
                : `${added} book${added === 1 ? '' : 's'} added.`}
              {cov && cov.found > 0 && ` ${cov.found} cover${cov.found === 1 ? '' : 's'} found.`}
              {cov && cov.done < cov.total && ` ${cov.total - cov.done} still without one — run the import again to keep looking.`}
            </p>
            <div className="confirm-actions">
              <button className="btn" onClick={close} autoFocus>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ n, what }: { n: number; what: string }) {
  return (
    <>
      <dt>{n}</dt>
      <dd>{what}</dd>
    </>
  )
}

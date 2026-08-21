import { useEffect, useRef, useState } from 'react'
import { FORMAT_NAMES, type FormatName } from '../types'
import { FORMAT, VERSION, type LibraryFile } from '../sync/backup'
import { mergeLibrary } from '../sync/backup'
import {
  scanGoodreads, toReviews, replaceDuplicates, AUTO_RATING, FROM_YEAR,
  type GrBook, type GrScan,
} from '../import/goodreads'
import { backfillCovers, type Progress } from '../import/covers'

/* Reading in a Goodreads export.

   THE SCAN WRITES NOTHING. It reads the file, reports what it found, and
   stops. Every book that CAN come in, comes in when the button is pressed —
   there is no per-row decision to make. A real export is a year of reading,
   and forty checkboxes was homework, not an interface; the rows it existed to
   flag (no rating, no date read) are instead counted out loud in the report,
   with exactly what gets filled in: an unrated book comes in rated 3 (the
   middle of the scale, there to be corrected on its own page), an undated one
   is dated today. Nothing is filled in silently — it is simply said once, for
   the group, rather than asked forty times.

   The one grouped question stays: Goodreads records an EDITION word
   (Paperback, Kindle Edition, Audio CD) rather than a medium, and sometimes
   records nothing at all. "What were these read on?" is answerable in one
   tap and covers every such row at once.

   What never comes in is a book finished before the window opens. The import
   takes 2026 onward — a hard wall, not a default — so those rows are counted
   and left out, with the sentence saying why. */

type Stage = 'reading' | 'report' | 'importing' | 'done'

/** Everything the scan will import, in one list. */
function importable(scan: GrScan): GrBook[] {
  return [...scan.ready, ...scan.needFormat, ...scan.unrated, ...scan.noDate]
}

export function GoodreadsSheet({ file, onClose }: { file: File; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('reading')
  const [scan, setScan] = useState<GrScan | null>(null)
  const [error, setError] = useState<string | null>(null)
  /* Multi-select, like the format field everywhere else in the app — a book
     read half on paper and finished on audio is both, and the import's one
     answer should be able to say so. */
  const [fmts, setFmts] = useState<FormatName[]>(['Physical'])
  /** what to do with books already on the shelf — leaving them is the default,
      because replacing is the choice that can change existing cards */
  const [dupes, setDupes] = useState<'keep' | 'replace'>('keep')
  const [added, setAdded] = useState(0)
  const [replaced, setReplaced] = useState(0)
  const [cov, setCov] = useState<Progress | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    let live = true
    file.text()
      .then((t) => scanGoodreads(t))
      .then((s) => {
        if (!live) return
        setScan(s)
        setFmts([s.commonFormat])
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

  const picked: GrBook[] = scan ? importable(scan) : []
  const asksFormat = picked.some((b) => !b.formats.length)
  const willAdd = picked.length
  const willReplace = dupes === 'replace' ? (scan?.duplicates.length ?? 0) : 0

  async function run() {
    if (!scan || (!picked.length && !willReplace)) return
    setStage('importing')

    if (picked.length) {
      const reviews = toReviews(picked, fmts)
      /* THE THIRD DOOR. This does not touch the database itself — it hands the
         rows to the same fold a hand-carried backup and a Drive sync arrive
         through, so the exact-fingerprint dedupe, the tombstone check that keeps
         a deliberately deleted book from coming back, and the local Nº numbering
         are all the behaviour that is already tested rather than a second
         implementation of it. */
      const lib: LibraryFile = { app: FORMAT, version: VERSION, reviews }
      const res = await mergeLibrary(JSON.stringify(lib))
      setAdded(res.added)
    }

    /* The one write the fold cannot do: overwriting shelf copies with the
       file's, because their fingerprints differ by date on purpose. Only when
       the reader chose it. */
    let redone = 0
    if (willReplace) {
      redone = await replaceDuplicates(scan.duplicates)
      setReplaced(redone)
    }

    /* Then go and find the artwork. A Goodreads export carries none at all, so
       without this every imported book is a blank card. It runs here rather
       than on a later visit because this is the moment somebody is watching
       and can see it happen. */
    if (picked.length > 0 || redone > 0) {
      abort.current = new AbortController()
      await backfillCovers(setCov, abort.current.signal)
    }
    setStage('done')
  }

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

            {(scan.beforeWindow > 0 || scan.otherShelves > 0) && (
              <dl className="gr-tally">
                {scan.beforeWindow > 0 && (
                  <Row n={scan.beforeWindow} what={`finished before ${FROM_YEAR} — the import takes ${FROM_YEAR} onward`} />
                )}
                {scan.otherShelves > 0 && <Row n={scan.otherShelves} what="not on your read shelf" />}
              </dl>
            )}

            {willAdd > 0 && (
              <div className="gr-ask">
                <div className="ui-lbl">The books</div>
                {/* No per-row decisions — everything importable comes in, and
                    what gets filled where the file has a gap is said here, once
                    for the group, so nothing is invented silently. */}
                <p>
                  {willAdd} book{willAdd === 1 ? '' : 's'} to import.
                  {scan.unrated.length > 0 &&
                    ` ${scan.unrated.length} carr${scan.unrated.length === 1 ? 'ies' : 'y'} no rating and come${scan.unrated.length === 1 ? 's' : ''} in rated ${AUTO_RATING} — the middle of the scale, there to be corrected on the book's own page.`}
                  {scan.noDate.length > 0 &&
                    ` ${scan.noDate.length} carr${scan.noDate.length === 1 ? 'ies' : 'y'} no date read and come${scan.noDate.length === 1 ? 's' : ''} in dated today.`}
                </p>
              </div>
            )}

            {scan.duplicates.length > 0 && (
              <div className="gr-ask">
                <div className="ui-lbl">Already on your shelf</div>
                <p>
                  {scan.duplicates.length === 1
                    ? 'One of these books is already here.'
                    : `${scan.duplicates.length} of these books are already here.`}
                  {' '}Replacing takes only what the file carries — rating, dates,
                  review, pages — and never touches a cover, plates, or anything
                  the file left blank.
                </p>
                <div className="fmt-pick">
                  <button
                    type="button"
                    aria-pressed={dupes === 'keep'}
                    onClick={() => setDupes('keep')}
                  >
                    Leave them as they are
                  </button>
                  <button
                    type="button"
                    aria-pressed={dupes === 'replace'}
                    onClick={() => setDupes('replace')}
                  >
                    Replace with the file’s copy
                  </button>
                </div>
              </div>
            )}

            {asksFormat && (
              <div className="gr-ask">
                <div className="ui-lbl">What were these read on?</div>
                <p>
                  Goodreads records the edition rather than the medium, and said
                  nothing for some of these. The pick covers every book missing
                  a format, and more than one can be true.
                </p>
                <div className="fmt-pick">
                  {FORMAT_NAMES.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={fmts.includes(f)}
                      onClick={() =>
                        setFmts((cur) =>
                          cur.includes(f)
                            ? cur.filter((x) => x !== f)
                            : FORMAT_NAMES.filter((x) => x === f || cur.includes(x))
                        )
                      }
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="confirm-actions">
              <button
                className="btn"
                onClick={run}
                disabled={willAdd + willReplace === 0 || (asksFormat && !fmts.length)}
                autoFocus
              >
                {willAdd + willReplace === 0
                  ? 'Nothing to import'
                  : willAdd > 0
                    ? `Import ${willAdd} book${willAdd === 1 ? '' : 's'}`
                    : `Replace ${willReplace} book${willReplace === 1 ? '' : 's'}`}
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
              {added === 0 && replaced === 0
                ? 'Nothing new was added — every book in the file was already on your shelf.'
                : [
                    added > 0 && `${added} book${added === 1 ? '' : 's'} added.`,
                    replaced > 0 && `${replaced} replaced with the file’s copy.`,
                  ].filter(Boolean).join(' ')}
              {cov && cov.found > 0 && ` ${cov.found} cover${cov.found === 1 ? '' : 's'} found.`}
              {cov && cov.done < cov.total && ` ${cov.total - cov.done} still without a cover — run the import again to keep looking.`}
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

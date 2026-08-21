import { useRef, useState } from 'react'
import { GoodreadsSheet } from '../components/GoodreadsSheet'
import { backfillCovers, type Progress } from '../import/covers'
import { Tip, TIP_JAR } from '../components/Tip'
import { FROM_YEAR } from '../import/goodreads'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Settings, ThemeChoice } from '../types'
import { Face, FacePicker } from '../components/Face'
import { Mark } from '../components/Mark'
import { Confirm } from '../components/Confirm'
import { ChoiceSheet } from '../components/ChoiceSheet'
import { printLibraryPdf } from '../share/export'
import { bury, exportLibrary, mergeLibrary } from '../sync/backup'
import { SyncPanel } from '../components/SyncPanel'
import { useInstall, promptInstall, checkForUpdate } from '../pwa'

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

/* Settings — personalization and the housekeeping. PDF export lives HERE,
   as a toggle: sharing itself is always images. */
export function SettingsPage({ settings }: { settings: Settings }) {
  const [msg, setMsg] = useState('')
  const [confirming, setConfirming] = useState<'demo' | 'clear' | 'goodreads' | null>(null)
  /* Export and Import both ask for a format first — the two do different
     things with it, so neither assumes JSON on the user's behalf */
  const [choosing, setChoosing] = useState<'export' | 'import' | null>(null)
  const [facesOpen, setFacesOpen] = useState(false)
  const install = useInstall()
  const [checking, setChecking] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const grRef = useRef<HTMLInputElement>(null)
  const [grFile, setGrFile] = useState<File | null>(null)
  /* the cover sweep, runnable from here as well as from inside the Goodreads
     import — a sweep that got rate-limited or interrupted there had no way to
     be run again, which is how a shelf ends up with "so many books without
     covers" and no button anywhere to fix it */
  const [cov, setCov] = useState<Progress | null>(null)
  const [covMsg, setCovMsg] = useState('')
  const covAbort = useRef<AbortController | null>(null)
  const sweeping = cov !== null && cov.done < cov.total
  /* Live, because the row below is allowed to refuse. A button that offers to
     delete a library which does not exist, warns about consequences that
     cannot happen, and then reports success, is indistinguishable from a
     broken button — which is precisely how it was read. */
  const count = useLiveQuery(() => db.reviews.count(), [], -1)
  /* live for the same reason: the row below counts what it is about to look
     up, and refuses when there is nothing */
  const coverless = useLiveQuery(() => db.reviews.filter((r) => !r.cover).count(), [], -1)
  /* rows the Goodreads import ADDED — its undo works on exactly these, so the
     row below only exists while there is an import to remove */
  const grCount = useLiveQuery(() => db.reviews.filter((r) => r.source === 'goodreads').count(), [], 0)
  const some = count > 0
  /* two forms, because "all 1 review" is not English: the plain count for the
     result line, and a phrase that reads on a button and in a question */
  const nReviews = `${count} review${count === 1 ? '' : 's'}`
  const allOfThem = count === 1 ? 'the one review' : `all ${count} reviews`

  const put = (patch: Partial<Settings>) => db.settings.put({ ...settings, ...patch })

  /* Export and import go through the same document the Drive backup writes —
     one format and one merge, so a library restored from a downloaded file and
     one that arrives from Drive cannot drift apart. */
  const exportJson = async () => {
    const data = await exportLibrary()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'flyleaf-press-library.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    setMsg(`Exported ${data.reviews.length} review${data.reviews.length === 1 ? '' : 's'}.`)
  }

  const importJson = async (file: File) => {
    try {
      const { added, updated, removed } = await mergeLibrary(await file.text())
      const parts = [
        `${added} added`,
        updated ? `${updated} updated` : '',
        removed ? `${removed} removed` : '',
      ].filter(Boolean)
      setMsg(`Imported — ${parts.join(', ')}.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  const exportPdf = async () => {
    const rows = await db.reviews.toArray()
    printLibraryPdf(rows)
    setMsg(`${rows.length} review${rows.length === 1 ? '' : 's'} sent to the print dialog — choose “Save as PDF” there.`)
  }

  /* destructive actions confirm in-app — window.confirm() is unreliable in
     installed PWAs, where it can silently return false */
  /* Dev-only, and dynamically imported so the fixture is not in the production
     graph at all. A shipped app has real users; a button that replaces their
     shelf with a stranger's fourteen books has no business next to it. */
  const resetDemo = async () => {
    setConfirming(null)
    await db.reviews.clear()
    const { seedIfEmpty } = await import('../seed')
    await seedIfEmpty()
    setMsg('Demo library loaded.')
  }

  /* The worker updates on its own when the app is reopened, so this is not
     how updates arrive — it is how you find out whether one is waiting
     without closing the app and coming back. If one is, it claims the page
     and reloads within moments, which is why the "updating" branch says so
     rather than pretending the work is finished. */
  const runUpdateCheck = async () => {
    setChecking(true)
    setUpdateMsg('')
    const result = await checkForUpdate()
    setChecking(false)
    setUpdateMsg(
      result === 'updating' ? 'A newer version is downloading — the app will reload itself in a moment.'
      : result === 'current' ? `You’re on the latest build — ${__APP_VERSION__} · ${__APP_COMMIT__}.`
      : 'Updates need the installed app or a normal page load — this copy is running without a service worker.',
    )
  }

  const clearAll = async () => {
    setConfirming(null)
    const gone = nReviews
    /* headstones for all of them, so clearing here does not simply invite the
       Drive copy to put the whole shelf back on the next sync */
    for (const r of await db.reviews.toArray()) await bury(r)
    await db.reviews.clear()
    /* say what was destroyed. "Library cleared." is true of clearing fourteen
       and of clearing nothing, so it could not tell those two apart either. */
    setMsg(`${gone} deleted. The shelf is empty.`)
  }

  /* Undo for the Goodreads import: removes the rows the import ADDED — marked
     `source: 'goodreads'` when they were built — and nothing else. Buried like
     any other delete, or the next Drive sync would put them straight back. */
  const removeGoodreads = async () => {
    setConfirming(null)
    const rows = (await db.reviews.toArray()).filter((r) => r.source === 'goodreads')
    for (const r of rows) await bury(r)
    await db.reviews.bulkDelete(rows.map((r) => r.id as number))
    setMsg(`${rows.length} imported book${rows.length === 1 ? '' : 's'} removed.`)
  }

  const runCoverSweep = async () => {
    if (sweeping) {
      covAbort.current?.abort()
      return
    }
    setCovMsg('')
    covAbort.current = new AbortController()
    const done = await backfillCovers(setCov, covAbort.current.signal)
    setCov(null)
    const left = done.total - done.found
    setCovMsg(
      done.found === 0
        ? 'No covers found this time — the catalogues may be rate-limiting; try again in a few minutes.'
        : `${done.found} cover${done.found === 1 ? '' : 's'} found.` +
          (left > 0 ? ` ${left} still without one — run it again later to keep looking.` : ''),
    )
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Settings</h1>
          {/* the caption slot is beside the title, not under it — a sentence
              does not fit there at 360px. Where the library lives is the About
              card's job, at the bottom of this very page. */}
          <span>Local-first</span>
        </header>

        <div className="panel">
          <div className="field">
            <label className="ui-lbl" htmlFor="set-name">Your name</label>
            <input id="set-name" type="text" defaultValue={settings.name}
              onBlur={(e) => put({ name: e.target.value.trim() })} />
          </div>
          {/* the face grid is the tallest thing on this page and gets picked
              once — it folds away to a single row showing the current face */}
          <div className="field">
            <button type="button" className="disclose" aria-expanded={facesOpen}
              onClick={() => setFacesOpen(!facesOpen)}>
              <span className="ui-lbl">Your face — optional</span>
              <span className="disclose-right">
                {!facesOpen && (settings.face
                  ? <Face seed={settings.face} size={26} />
                  : <span className="disclose-val">None</span>)}
                <span className="disclose-chev" aria-hidden="true">{facesOpen ? '▲' : '▼'}</span>
              </span>
            </button>
            {facesOpen && (
              <>
                <FacePicker value={settings.face} onPick={(face) => put({ face })} label="Your face" />
                {/* kept because CC BY 4.0 requires it, not to explain the
                    picker sitting directly above it */}
                <p className="field-hint">
                  Faces from the <em>Adventurer</em> set by Lisa Wischofsky (CC BY 4.0), via DiceBear.
                </p>
              </>
            )}
          </div>
          {/* No default-style pickers here. Fourteen swatches was the tallest
              thing on the page after the face picker, and it bought nothing: a
              style is picked on the review page and in its share sheet, and on
              the collage page above the card — where you can see what you are
              choosing. Setting one blind, on a page with no card on it, is the
              worse version of a decision the app already offers in the right
              place. `defaultStyle` / `defaultCollage` stay in Settings as the
              seed those pickers open on; they are simply no longer editable
              from here. */}
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="ui-lbl">Appearance</span>
            <div className="seg" role="radiogroup" aria-label="Appearance">
              {THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={settings.theme === t.id}
                  onClick={() => put({ theme: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="field-hint">Cards stay paper-light in both themes.</p>
          </div>
        </div>

        <SyncPanel />

        {/* The app itself — putting it on the home screen, and asking whether
            there is a newer one. Both are about this device rather than about
            the library, so they sit apart from the housekeeping below. */}
        <div className="panel">
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Install the app</div>
              <p>
                {install.installed
                  ? 'Running from your home screen, with the whole library on this device.'
                  : install.canPrompt
                  ? 'Opens full screen, works offline, same library.'
                  : install.manualOnly
                  ? 'On iPhone and iPad: tap Share, then Add to Home Screen.'
                  : 'This browser hasn’t offered an install yet. In Chrome and Edge, look in the address bar or the ⋮ menu.'}
              </p>
            </div>
            {install.installed ? (
              <span className="set-row-note">Installed</span>
            ) : install.canPrompt ? (
              <button className="btn btn--ghost btn--sm" onClick={() => promptInstall()}>Install</button>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">PDF export</div>
              <p>Adds a Save as PDF button to each review's share sheet.</p>
            </div>
            <button className="toggle" role="switch" aria-checked={settings.pdfEnabled}
              aria-label="PDF export" onClick={() => put({ pdfEnabled: !settings.pdfEnabled })} />
          </div>
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Export library</div>
              <p>Your whole shelf as one file — JSON to back up, PDF to read.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setChoosing('export')}>Export</button>
          </div>
          {/* The import's undo. Shown only while there is an import to remove —
              unlike Delete everything, which is a permanent feature of the app,
              this row on a shelf that never imported would claim an import
              happened. It removes ONLY the rows the import added; books written
              here by hand, and shelf copies an import merely updated, stay. */}
          {grCount > 0 && (
            <div className="set-row">
              <div className="set-row-txt">
                <div className="ui-lbl">Remove the Goodreads import</div>
                <p>
                  Takes the {grCount === 1 ? 'one book' : `${grCount} books`} the
                  import added back off the shelf. Books you added yourself stay.
                </p>
              </div>
              <button className="btn btn--danger btn--sm" onClick={() => setConfirming('goodreads')}>
                Remove
              </button>
            </div>
          )}
          {/* ONE door in. A backup and a Goodreads export are different files,
              but "get reviews into the app" is one job, and two rows for it
              made people ask which one they wanted — the sheet behind this
              button is where that question is answered, file by file. */}
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Import library</div>
              <p>Adds reviews to what's already here — from a backup file or a Goodreads export.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setChoosing('import')}>Import</button>
            <input ref={importRef} type="file" accept="application/json" hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importJson(f)
                e.target.value = ''
              }} />
            <input ref={grRef} type="file" accept=".csv,text/csv" hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setGrFile(f)
                e.target.value = ''
              }} />
          </div>
          {/* a paragraph of copy, so the button goes underneath — and the
              progress bar with it */}
          <div className="set-row set-row--stack">
            <div className="set-row-txt">
              <div className="ui-lbl">Find missing covers</div>
              <p>
                {coverless === -1 ? 'Counting the shelf\u2026'
                  : coverless === 0 ? 'Every book on the shelf has a cover.'
                  : `${coverless} book${coverless === 1 ? ' has' : 's have'} no cover. Looks each one up in the catalogues \u2014 slowly, so they don\u2019t turn us away. You can keep using the app meanwhile.`}
              </p>
              {cov && cov.total > 0 && (
                <>
                  <div className="gr-bar" role="progressbar" aria-valuenow={cov.done} aria-valuemin={0} aria-valuemax={cov.total}>
                    <span style={{ width: `${Math.round((cov.done / cov.total) * 100)}%` }} />
                  </div>
                  <p className="gr-now">
                    {cov.waiting ? 'Waiting out a rate limit to retry the skipped books\u2026' : cov.current ?? `${cov.done} of ${cov.total}`}
                  </p>
                </>
              )}
              {covMsg && <p role="status">{covMsg}</p>}
            </div>
            <button className="btn btn--ghost btn--sm" disabled={coverless < 1 && !sweeping}
              onClick={() => void runCoverSweep()}>
              {sweeping ? 'Stop' : 'Find covers'}
            </button>
          </div>
          {import.meta.env.DEV && (
            <div className="set-row">
              <div className="set-row-txt">
                <div className="ui-lbl">Load the demo library</div>
                <p>Three months of invented reading. Dev server only.</p>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirming('demo')}>Load</button>
            </div>
          )}
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Delete everything</div>
              <p>
                {count === -1 ? 'Counting the shelf\u2026'
                  : some ? `Deletes ${allOfThem} on the shelf, ${count === 1 ? 'and its cover' : 'covers and all'}. There is no cloud copy to recover from.`
                  : 'Nothing to delete \u2014 the shelf is already empty.'}
              </p>
            </div>
            {/* disabled rather than hidden: the row is where somebody comes
                looking for it, and a row that vanishes on an empty shelf reads
                as the feature having gone missing. */}
            <button className="btn btn--danger btn--sm" disabled={!some}
              onClick={() => setConfirming('clear')}>Delete</button>
          </div>
        </div>

        {msg && <p className="field-hint" role="status" style={{ marginTop: 14 }}>{msg}</p>}

        {TIP_JAR && (
          <div className="panel">
            <Tip />
          </div>
        )}

        {/* what this thing is, in the place people look when they want to know.
            The launch screen says the same in one line; this is the longer
            version, with the version stamp for bug reports. */}
        <div className="panel about">
          <div className="about-top">
            <Mark size={38} />
            <div>
              <div className="about-name">Flyleaf Press</div>
              <div className="ui-lbl">Long book reviews, printed</div>
            </div>
          </div>
          {/* The one place in the app where explaining is the job — everywhere
              else the control is its own explanation. Still two paragraphs
              rather than three: what it makes, and where it keeps it. */}
          <p>
            Most reading apps cut a review short or won't let you share it at all. This one shares
            yours whole, as a printed card, running onto another page at a paragraph when it needs
            to. Every month becomes a collage of what you finished.
          </p>
          <p>
            Your library lives on this device, in this browser. No account and no server of ours —
            the host counts page views and nothing else. Nothing else leaves unless you send it:
            Export library writes the whole shelf to one file, and Google Drive backup, if you turn
            it on, keeps a copy in a hidden folder of your own Drive.
          </p>
          {/* the check sits beside the number it checks, at the very bottom
              of the page. "Local-first PWA" gave up the slot: the header and
              the paragraph above both already say it, and a control earns the
              space more than a third restatement does. */}
          <div className="about-foot">
            {/* the commit, not just the version: package.json is bumped by
                hand, so without it two different deploys both read 0.2.0 and
                there is no way to tell a stale installed app from a current
                one */}
            <span className="ui-lbl">Version {__APP_VERSION__} · {__APP_COMMIT__}</span>
            <button className="btn btn--ghost btn--sm" disabled={checking} onClick={runUpdateCheck}>
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
          {updateMsg && <p className="field-hint" role="status" style={{ marginTop: 12 }}>{updateMsg}</p>}
        </div>
      </div>

      {choosing === 'export' && (
        <ChoiceSheet
          title="Export as"
          choices={[
            { id: 'json', label: 'JSON · backup', detail: 'One file holding every review, covers included. This is the one that can be imported back.' },
            { id: 'pdf', label: 'PDF · document', detail: 'Every review as its printed card, oldest first, through the print dialog. To read and keep, not to import.' },
          ]}
          onPick={(id) => {
            setChoosing(null)
            if (id === 'json') exportJson()
            else exportPdf()
          }}
          onCancel={() => setChoosing(null)}
        />
      )}
      {choosing === 'import' && (
        <ChoiceSheet
          title="Import from"
          body="Imported reviews are added to the shelf — nothing already here is replaced without asking."
          choices={[
            { id: 'json', label: 'JSON · backup', detail: 'A file exported from Flyleaf Press on this or another device.' },
            /* Goodreads has had no API since December 2020 — no new keys were
               issued, existing ones answer 403, and it sends no CORS headers,
               so even the RSS feed is unreadable from a browser. The export
               the site gives its own users is the only route in that doesn't
               need a server of ours. It is also the better route: no account,
               no consent screen, no quota, and it works offline. */
            { id: 'goodreads', label: 'Goodreads · CSV', detail: `Books you finished in ${FROM_YEAR} or later. In Goodreads, go to My Books, then Import and export, then Export Library.` },
            { id: 'pdf', label: 'PDF · document', detail: '', unavailable: 'A PDF holds pictures of the cards, not the reviews themselves — there is nothing in it to read back. Export JSON if you want to move a library.' },
          ]}
          onPick={(id) => {
            setChoosing(null)
            if (id === 'json') importRef.current?.click()
            if (id === 'goodreads') grRef.current?.click()
          }}
          onCancel={() => setChoosing(null)}
        />
      )}

      {import.meta.env.DEV && confirming === 'demo' && (
        <Confirm
          title="Load the demo library?"
          body="Everything on the shelf is replaced by the three seeded months. Your own reviews are deleted."
          action="Load demo"
          onConfirm={resetDemo}
          onCancel={() => setConfirming(null)}
        />
      )}
      {grFile && <GoodreadsSheet file={grFile} onClose={() => setGrFile(null)} />}
      {confirming === 'goodreads' && (
        <Confirm
          title={grCount === 1 ? 'Remove the imported book?' : `Remove all ${grCount} imported books?`}
          body="Ratings, covers and anything you've edited on them since go too, here and in any Drive backup. There is no undo."
          action={grCount === 1 ? 'Remove it' : `Remove ${grCount} books`}
          onConfirm={removeGoodreads}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'clear' && (
        <Confirm
          title={`Delete ${allOfThem}?`}
          body="Any Drive backup is cleared along with this device. There is no undo — export a backup first if in doubt."
          action={count === 1 ? 'Delete it' : `Delete ${count} reviews`}
          onConfirm={clearAll}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

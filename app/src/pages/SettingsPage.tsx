import { useRef, useState } from 'react'
import { db } from '../db'
import type { Settings, StyleId, CollageId, ThemeChoice } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS, COLLAGE_IDS, COLLAGE_NAMES, COLLAGE_GROUNDS } from '../types'
import { StylePicker } from '../components/StylePicker'
import { Face, FacePicker } from '../components/Face'
import { Mark } from '../components/Mark'
import { Confirm } from '../components/Confirm'
import { ChoiceSheet } from '../components/ChoiceSheet'
import { printLibraryPdf } from '../share/export'
import { seedIfEmpty } from '../seed'
import { bury, exportLibrary, mergeLibrary } from '../sync/backup'
import { SyncPanel } from '../components/SyncPanel'

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

/* Settings — personalization and the housekeeping. PDF export lives HERE,
   as a toggle: sharing itself is always images. */
export function SettingsPage({ settings }: { settings: Settings }) {
  const [msg, setMsg] = useState('')
  const [confirming, setConfirming] = useState<'demo' | 'clear' | null>(null)
  /* Export and Import both ask for a format first — the two do different
     things with it, so neither assumes JSON on the user's behalf */
  const [choosing, setChoosing] = useState<'export' | 'import' | null>(null)
  const [facesOpen, setFacesOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

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
  const resetDemo = async () => {
    setConfirming(null)
    await db.reviews.clear()
    await seedIfEmpty()
    setMsg('Demo library restored.')
  }

  const clearAll = async () => {
    setConfirming(null)
    /* headstones for all of them, so clearing here does not simply invite the
       Drive copy to put the whole shelf back on the next sync */
    for (const r of await db.reviews.toArray()) await bury(r)
    await db.reviews.clear()
    setMsg('Library cleared.')
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Settings</h1>
          {/* true whether or not Drive is connected — a backup goes to the
              user's own Drive, never to a server of ours */}
          <span>Local-first · nothing is ever stored on our servers</span>
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
                <p className="field-hint">
                  Greets you on the home page. Drawn on this device — nothing is fetched.
                  Faces from the <em>Adventurer</em> set by Lisa Wischofsky (CC BY 4.0), via DiceBear.
                </p>
              </>
            )}
          </div>
          <div className="field">
            <span className="ui-lbl">Appearance</span>
            <div className="seg" role="radiogroup" aria-label="Appearance">
              {THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={settings.theme === t.id}
                  onClick={() => put({ theme: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="field-hint">Dark mode is chrome only — the cards are printed objects and stay paper-light everywhere, including shares.</p>
          </div>
          <div className="field">
            <span className="ui-lbl">Default review style</span>
            <StylePicker ids={STYLE_IDS} names={STYLE_NAMES} grounds={STYLE_GROUNDS}
              value={settings.defaultStyle} onChange={(defaultStyle: StyleId) => put({ defaultStyle })} />
            <p className="field-hint">New reviews start in this style. Every review can switch styles later, and again at share time.</p>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="ui-lbl">Default collage style</span>
            <StylePicker ids={COLLAGE_IDS} names={COLLAGE_NAMES} grounds={COLLAGE_GROUNDS}
              value={settings.defaultCollage} onChange={(defaultCollage: CollageId) => put({ defaultCollage })} />
          </div>
        </div>

        <SyncPanel />

        <div className="panel">
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">PDF export</div>
              <p>
                Sharing is always images — one PNG per page, even two-page reviews. Turn this on to
                also get a "Save as PDF" button on each review's share sheet (via the print dialog).
              </p>
            </div>
            <button className="toggle" role="switch" aria-checked={settings.pdfEnabled}
              aria-label="PDF export" onClick={() => put({ pdfEnabled: !settings.pdfEnabled })} />
          </div>
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Export library</div>
              <p>
                Your whole shelf, in the format you pick — JSON to back it up and bring it back,
                or PDF to keep it as a readable document. Nothing here ever leaves the device on its own.
              </p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setChoosing('export')}>Export</button>
          </div>
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Import library</div>
              <p>Adds the reviews from a Flyleaf Press export file to what's already here.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setChoosing('import')}>Import</button>
            <input ref={importRef} type="file" accept="application/json" hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importJson(f)
                e.target.value = ''
              }} />
          </div>
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Restore demo library</div>
              <p>Puts back the three seeded months to explore the styles with.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setConfirming('demo')}>Restore</button>
          </div>
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Delete everything</div>
              <p>Clears the whole library. There is no cloud copy to recover from.</p>
            </div>
            <button className="btn btn--danger btn--sm" onClick={() => setConfirming('clear')}>Delete</button>
          </div>
        </div>

        {msg && <p className="field-hint" role="status" style={{ marginTop: 14 }}>{msg}</p>}

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
          <p>
            Most reading apps cut a review short, reflow it, or won't let you share it at all.
            This one keeps yours whole: write however much you want, and it comes out as a printed
            card — cover, rating, dates, page count and all — splitting to a second page at a
            paragraph break when it needs to. Each month assembles itself into a collage of
            everything you finished.
          </p>
          <p>
            Your library lives on this device, in this browser. Nothing is sent anywhere unless you
            connect your own Google Drive for backup, and there is no account and no server of ours
            at any point.
          </p>
          <div className="about-foot">
            <span className="ui-lbl">Version {__APP_VERSION__}</span>
            <span className="ui-lbl">Local-first PWA</span>
          </div>
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
          body="Imported reviews are added to the shelf — nothing already here is replaced."
          choices={[
            { id: 'json', label: 'JSON · backup', detail: 'A file exported from Flyleaf Press on this or another device.' },
            { id: 'pdf', label: 'PDF · document', detail: '', unavailable: 'A PDF holds pictures of the cards, not the reviews themselves — there is nothing in it to read back. Export JSON if you want to move a library.' },
          ]}
          onPick={(id) => {
            setChoosing(null)
            if (id === 'json') importRef.current?.click()
          }}
          onCancel={() => setChoosing(null)}
        />
      )}

      {confirming === 'demo' && (
        <Confirm
          title="Restore the demo library?"
          body="Everything on the shelf is replaced by the three seeded months. Your own reviews are deleted."
          action="Restore demo"
          onConfirm={resetDemo}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'clear' && (
        <Confirm
          title="Delete every review?"
          body="The whole library is cleared. There is no cloud copy to recover from — export a backup first if in doubt."
          action="Delete everything"
          onConfirm={clearAll}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

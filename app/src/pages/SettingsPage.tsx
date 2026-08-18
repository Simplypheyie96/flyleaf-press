import { useRef, useState } from 'react'
import { db } from '../db'
import type { Settings, Review, StyleId, CollageId, ThemeChoice } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS, COLLAGE_IDS, COLLAGE_NAMES, COLLAGE_GROUNDS } from '../types'
import { StylePicker } from '../components/StylePicker'
import { FacePicker } from '../components/Face'
import { Confirm } from '../components/Confirm'
import { printLibraryPdf } from '../share/export'
import { seedIfEmpty } from '../seed'

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
  const importRef = useRef<HTMLInputElement>(null)

  const put = (patch: Partial<Settings>) => db.settings.put({ ...settings, ...patch })

  const exportJson = async () => {
    const reviews = await db.reviews.toArray()
    const blob = new Blob([JSON.stringify({ app: 'flyleaf-press', version: 1, reviews }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'flyleaf-press-library.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    setMsg(`Exported ${reviews.length} reviews.`)
  }

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const rows: Review[] = data.reviews
      if (!Array.isArray(rows)) throw new Error('not a library file')
      let added = 0
      for (const r of rows) {
        const { id: _drop, ...rest } = r
        if (!rest.title || !rest.finished || typeof rest.rating !== 'number') continue
        await db.reviews.add(rest as Review)
        added++
      }
      setMsg(`Imported ${added} review${added === 1 ? '' : 's'}.`)
    } catch {
      setMsg("Couldn't read that file — it doesn't look like a Flyleaf Press export.")
    }
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
    await db.reviews.clear()
    setMsg('Library cleared.')
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Settings</h1>
          <span>Local-first · everything stays on this device</span>
        </header>

        <div className="panel">
          <div className="field">
            <label className="ui-lbl" htmlFor="set-name">Your name</label>
            <input id="set-name" type="text" defaultValue={settings.name}
              onBlur={(e) => put({ name: e.target.value.trim() })} />
          </div>
          <div className="field">
            <span className="ui-lbl">Your face — optional</span>
            <FacePicker value={settings.face} onPick={(face) => put({ face })} label="Your face" />
            <p className="field-hint">
              Greets you on the home page. Drawn on this device — nothing is fetched.
              Faces from the <em>Adventurer</em> set by Lisa Wischofsky (CC BY 4.0), via DiceBear.
            </p>
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
          {settings.pdfEnabled && (
            <div className="set-row">
              <div className="set-row-txt">
                <div className="ui-lbl">Whole library as PDF</div>
                <p>Every review, oldest finish first, each in its own saved style — one document via the print dialog.</p>
              </div>
              <button className="btn btn--ghost btn--sm"
                onClick={async () => printLibraryPdf(await db.reviews.toArray())}>
                Print / PDF
              </button>
            </div>
          )}
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Export library</div>
              <p>Every review as one JSON file — your backup, since nothing here ever leaves the device on its own.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={exportJson}>Export</button>
          </div>
          <div className="set-row">
            <div className="set-row-txt">
              <div className="ui-lbl">Import library</div>
              <p>Adds the reviews from a Flyleaf Press export file to what's already here.</p>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => importRef.current?.click()}>Import</button>
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
      </div>

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

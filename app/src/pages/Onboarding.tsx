import { useState } from 'react'
import { db } from '../db'
import type { Settings } from '../types'
import { FacePicker } from '../components/Face'
import { mark } from '../cards/assets'

/* Launch screen: a name and a face, nothing else. Style choices belong to
   share time (and defaults live in Settings) — the first run shouldn't ask
   design questions before there's anything to design. */
export function Onboarding({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const [name, setName] = useState(settings.name)
  const [face, setFace] = useState(settings.face)

  const start = async () => {
    await db.settings.put({ ...settings, name: name.trim(), face, onboarded: true })
    onDone()
  }

  return (
    <div className="onb">
      <div className="onb-inner">
        <div className="onb-mark" dangerouslySetInnerHTML={{ __html: mark(44) }} />
        <h1>Flyleaf Press</h1>
        <p className="onb-sub">
          Write book reviews of any length and share them whole, as printed pages.
          Long reviews split to a second page at a paragraph — never truncated,
          never reformatted.
        </p>

        <div className="field">
          <label className="ui-lbl" htmlFor="onb-name">Your name — optional</label>
          <input id="onb-name" type="text" value={name} placeholder="Shown nowhere but your own shelf"
            onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <span className="ui-lbl">Pick a face — optional</span>
          <FacePicker value={face} onPick={setFace} label="Pick a face" />
          <p className="field-hint">It greets you on the home page. Drawn on this device — nothing is fetched.</p>
        </div>

        <button className="btn" onClick={start}>Open the shelf</button>
      </div>
    </div>
  )
}

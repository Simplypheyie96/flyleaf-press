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
        {/* The line the launch image, the OG card and the About panel all
            carry. It is the app in two clauses; the paragraph that used to be
            here explained pagination to someone who had not written anything
            yet. */}
        <p className="onb-sub">Long book reviews, printed</p>
        <p className="onb-sub">And every month as a collage</p>

        <div className="field">
          <label className="ui-lbl" htmlFor="onb-name">Your name — optional</label>
          <input id="onb-name" type="text" value={name} placeholder="e.g. Mabel"
            onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <span className="ui-lbl">Pick a face — optional</span>
          <FacePicker value={face} onPick={setFace} label="Pick a face" />
        </div>

        <button className="btn" onClick={start}>Open the shelf</button>
      </div>
    </div>
  )
}

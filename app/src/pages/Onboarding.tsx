import { useState } from 'react'
import { db } from '../db'
import type { Settings } from '../types'
import { FacePicker } from '../components/Face'
import { mark } from '../cards/assets'
import { RestoreNotice } from '../components/RestoreNotice'

/* Launch screen: a name and a face, nothing else. Style choices belong to
   share time (and defaults live in Settings) — the first run shouldn't ask
   design questions before there's anything to design. */
export function Onboarding({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const [name, setName] = useState(settings.name)
  const [face, setFace] = useState(settings.face)

  /* Read back rather than writing the props through. A restore puts the name
     and face out of the backup into settings a moment before this runs, and
     the `settings` this screen was rendered with predates that — writing it
     back would undo the restore on the way out. What was actually typed here
     still wins; empty falls through to whatever came down. */
  const start = async () => {
    const current = (await db.settings.get(1)) ?? settings
    await db.settings.put({
      ...current,
      name: name.trim() || current.name,
      face: face || current.face,
      onboarded: true,
    })
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

        {/* Asked HERE, because this is the first screen a new device shows and
            therefore the first honest moment to ask it. Waiting until the
            empty shelf means somebody who has been writing for months is made
            to invent a name and a face they already have, and only then told
            their library might be recoverable. A restore that finds a library
            closes this screen on the spot, name and face included — they came
            down with it, and asking for them again would be asking somebody to
            re-invent what the app is holding. An empty Drive leaves the screen
            exactly as it was: there is nothing to take the name from, so the
            fields still have a job. */}
        <RestoreNotice
          prompt="Already have a shelf on another device?"
          onRestored={start}
        />
      </div>
    </div>
  )
}

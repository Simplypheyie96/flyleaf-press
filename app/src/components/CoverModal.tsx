import { useEffect, useRef, useState } from 'react'
import { coverToDataUrl, searchBooks } from '../catalog'

const fileToDataUrl = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(f)
  })

interface Props {
  /** the candidate art already on the row, in trust order */
  covers: string[]
  /** the cover on the row now — a dataURL — so the grid can show what is picked */
  current?: string
  /** what to ask the catalogues when the row arrived with no candidates */
  seed: string
  /** candidates found in here, so the cover stays changeable next time */
  onCovers: (next: string[]) => void
  /** a storable dataURL, or undefined for no cover */
  onPick: (cover: string | undefined) => void
  onClose: () => void
}

/**
 * The cover chooser, as its own modal.
 *
 * The review editor grows its own copy of this because it holds the pick as an
 * INDEX into the candidate list and resolves it to a dataURL at save time —
 * one write, at the end of a form. A hopeful has no form and no save button:
 * the list is the record, so a cover picked here is converted and written
 * immediately, and this component hands back bytes rather than an index.
 *
 * The conversion is the part worth having in one place. A candidate URL is not
 * a cover — plenty of catalogue hosts send no CORS headers, so the fetch can
 * never become a dataURL — and a picker that silently stored a URL it could
 * not read would show art on this device and a blank on the next.
 */
export function CoverModal({ covers, current, seed, onCovers, onPick, onClose }: Props) {
  const [hunting, setHunting] = useState(false)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  /* the hunt below runs once per mount, and React 19's dev double-invoke of
     effects would otherwise ask three catalogues twice */
  const hunted = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* A row with no candidates has nothing to swap between — go and find some,
     once, quietly (the same thing the review editor does on an old row). */
  useEffect(() => {
    if (covers.length || !seed.trim() || hunted.current) return
    hunted.current = true
    setHunting(true)
    searchBooks(seed)
      .then((res) => {
        const found: string[] = []
        for (const c of res.candidates)
          for (const u of c.covers) if (!found.includes(u)) found.push(u)
        if (found.length) onCovers(found.slice(0, 12))
        else setNote(res.limited > 0 ? 'A catalogue is rate-limiting us — try again in a minute.' : '')
      })
      .catch(() => {})
      .finally(() => setHunting(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchMore = async () => {
    const term = q.trim()
    if (!term || searching) return
    setSearching(true)
    setNote('')
    try {
      const res = await searchBooks(term)
      const found: string[] = []
      for (const c of res.candidates)
        for (const u of c.covers) if (!covers.includes(u) && !found.includes(u)) found.push(u)
      if (found.length) onCovers([...covers, ...found.slice(0, 12)])
      else
        setNote(
          res.limited > 0
            ? 'A catalogue is rate-limiting us — try again in a minute.'
            : 'No covers under that title.'
        )
    } catch {
      setNote('The search failed. Check the connection and try again.')
    } finally {
      setSearching(false)
    }
  }

  const choose = async (url: string) => {
    setBusy(true)
    setNote('')
    try {
      const data = await coverToDataUrl(url)
      if (!data) {
        setNote('That cover could not be saved — the catalogue would not hand it over. Pick another, or upload your own.')
        return
      }
      onPick(data)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="share-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a cover"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-sheet">
        <div className="modal-top">
          <span className="ui-lbl">Choose a cover</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Done
          </button>
        </div>

        {(hunting || busy) && (
          <p className="field-hint" aria-live="polite">
            {busy ? 'Saving the cover…' : 'Looking for covers…'}
          </p>
        )}

        <div className="cov-pick">
          {current && (
            <button type="button" aria-pressed onClick={onClose}>
              <img src={current} alt="The cover on this book now" />
            </button>
          )}
          {covers.map((u, i) => (
            <button key={u} type="button" disabled={busy} onClick={() => choose(u)}>
              <img src={u} alt={`Cover option ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>

        {!hunting && covers.length === 0 && !current && (
          <p className="field-hint">No covers found. Upload your own, or go without.</p>
        )}

        <div className="field">
          <label className="ui-lbl" htmlFor="cm-q">Find covers under another title</label>
          <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
            <input
              id="cm-q"
              type="search"
              value={q}
              style={{ flex: 1, minWidth: 0 }}
              placeholder="e.g. the book's other name"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchMore()}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={searching || !q.trim()}
              onClick={searchMore}
            >
              {searching ? 'Searching…' : 'Find covers'}
            </button>
          </div>
          {note && <p className="field-hint">{note}</p>}
        </div>

        <div className="modal-actions">
          <label className="btn btn--ghost btn--sm">
            Upload your own
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) {
                  onPick(await fileToDataUrl(f))
                  onClose()
                }
                e.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-pressed={!current}
            onClick={() => {
              onPick(undefined)
              onClose()
            }}
          >
            No cover
          </button>
        </div>
      </div>
    </div>
  )
}

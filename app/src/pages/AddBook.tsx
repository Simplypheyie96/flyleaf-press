import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchBooks, isIsbn, type SearchResult, type Candidate } from '../catalog'

/* how long to sit still before asking three catalogues anything. Long enough
   that ordinary typing doesn't fire a request per keystroke, short enough that
   results feel like they're keeping up with the word being typed. */
const DEBOUNCE = 350
const MIN_CHARS = 3

/* Add a book: search three catalogues in parallel (Open Library, Apple Books,
   Google Books) by title, author, or ISBN — or skip the catalogues entirely
   and enter the book by hand. Results arrive as you type; there is no step
   where you finish a phrase and then go looking for a button. */
export function AddBook() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  /* three catalogues answering at their own pace means responses can land out
     of order — a slow "pi" must never overwrite the results for "piranesi" */
  const seq = useRef(0)

  const run = async (term: string) => {
    const mine = ++seq.current
    setBusy(true)
    try {
      const res = await searchBooks(term)
      if (seq.current === mine) setResult(res)
    } finally {
      if (seq.current === mine) setBusy(false)
    }
  }

  useEffect(() => {
    const term = q.trim()
    /* an ISBN is matched exactly, so it is worth searching the moment it is
       complete; prose needs a few letters before the catalogues mean anything */
    if (term.length < MIN_CHARS && !isIsbn(term)) {
      seq.current++
      setResult(null)
      setBusy(false)
      return
    }
    const t = setTimeout(() => run(term), DEBOUNCE)
    return () => clearTimeout(t)
  }, [q])

  const pick = (c: Candidate) => nav('/write', { state: { candidate: c } })

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Add a book</h1>
          <span>Step 1 of 2 · Find it</span>
        </header>

        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) run(q.trim()) }}>
          <div className="field">
            <label className="ui-lbl" htmlFor="q">Title, author, or ISBN</label>
            <input
              id="q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Piranesi, or 9781635575637"
              autoFocus
            />
            <p className="field-hint" aria-live="polite">
              {busy
                ? 'Searching Open Library, Apple Books, and Google Books…'
                : isIsbn(q)
                  ? 'That looks like an ISBN — it will be matched exactly.'
                  : 'Results appear as you type, from Open Library, Apple Books, and Google Books.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" type="button" onClick={() => nav('/write')}>
              Enter details by hand
            </button>
          </div>
        </form>

        {result && (
          <div className="res">
            <p className="field-hint" role="status">
              {result.answered === 0
                ? 'The search never happened — none of the three catalogues answered. Check your connection and try again.'
                : result.candidates.length === 0
                  ? `Not in these catalogues (${result.answered} of ${result.asked} answered). You can still enter it by hand.`
                  : `${result.candidates.length} match${result.candidates.length > 1 ? 'es' : ''} · ${result.answered} of ${result.asked} catalogues answered.`}
            </p>
            {result.candidates.map((c, i) => (
              <button key={i} className="res-row" onClick={() => pick(c)}>
                {c.covers[0] ? <img src={c.covers[0]} alt="" loading="lazy" /> : <span />}
                <span>
                  <span className="res-t">{c.title}</span>
                  <span className="res-a" style={{ display: 'block' }}>
                    {c.author}
                    {c.year ? ` · ${c.year}` : ''}
                    {c.pages ? ` · ${c.pages} pp` : ''}
                  </span>
                </span>
                <span className="res-src">{c.source === 'openlibrary' ? 'Open Library' : c.source}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

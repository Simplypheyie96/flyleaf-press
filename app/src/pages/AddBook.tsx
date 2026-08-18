import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchBooks, isIsbn, type SearchResult, type Candidate } from '../catalog'

/* Add a book: search three catalogues in parallel (Open Library, Apple Books,
   Google Books) by title, author, or ISBN — or skip the catalogues entirely
   and enter the book by hand. */
export function AddBook() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!q.trim() || busy) return
    setBusy(true)
    try {
      setResult(await searchBooks(q.trim()))
    } finally {
      setBusy(false)
    }
  }

  const pick = (c: Candidate) => nav('/write', { state: { candidate: c } })

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>Add a book</h1>
          <span>Step 1 of 2 · Find it</span>
        </header>

        <form onSubmit={run}>
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
            <p className="field-hint">
              Searches Open Library, Apple Books, and Google Books at once.
              {isIsbn(q) ? ' That looks like an ISBN — it will be matched exactly.' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="submit" disabled={busy || !q.trim()}>
              {busy ? 'Searching…' : 'Search catalogues'}
            </button>
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

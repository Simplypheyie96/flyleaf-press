import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { CollageId, ExportShape, Hopeful, Review, Settings } from '../types'
import { COLLAGE_IDS, COLLAGE_NAMES, COLLAGE_GROUNDS } from '../types'
import { CollapsedCard } from '../components/CollapsedCard'
import { CoverModal } from '../components/CoverModal'
import { ExportSheet } from '../components/ExportSheet'
import { StylePicker } from '../components/StylePicker'
import { faceUri } from '../components/Face'
import { renderCollage, type MonthData } from '../cards/collage'
import {
  shareCollageImage, buildCollagePage, collageBaseName,
  shareStoryImage, buildStoryPage, storyBaseName, type ExportMode,
} from '../share/export'
import { monthName, currentMonthKey } from '../format'
import { coverToDataUrl, isIsbn, searchBooks, type Candidate, type SearchResult } from '../catalog'

const DEBOUNCE = 350
const MIN_CHARS = 3

/* The story card composes on ONE column and only one: 688px of card on a
   720px leaf is 1440 x 2560, which is 9:16 to the pixel, and the broad column
   would be a different aspect and therefore not a story. Module-level because
   `ExportSheet` measures on a dependency of this array — an inline literal is
   a new array every render, so the whole card would be rebuilt and remeasured
   on every keystroke anywhere on the page. */
const STORY_SHAPES = ['phone'] as const

/** The same flattening the Goodreads dedupe uses, for the same reason: two
    catalogues, or a catalogue and a hand edit, disagree about spacing and case
    long before they disagree about the book. */
const flat = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/* A hopeful stands in for a Review only where the card is concerned. The
   collage renderers are typed on Review because that is what they print for a
   month and a year, and a fourth set of renderers for a list that wants the
   exact same seven objects would be three hundred lines saying nothing new.
   The made-up fields are all ones a hopefuls card never reads: the rating is
   suppressed by `span: 'hopefuls'` at every site, there are no formats to
   print, and `finished` exists only so nothing that sorts by it throws — it is
   never shown, because the book has not been finished. */
function asReview(h: Hopeful): Review {
  return {
    id: h.id,
    no: 0,
    title: h.title,
    author: h.author,
    series: h.series,
    finished: `${h.month}-01`,
    formats: [],
    rating: 0,
    cover: h.cover,
    covers: h.covers,
    isbn: h.isbn,
    pages: h.pages,
    body: '',
    plates: [],
    style: 'archive',
    createdAt: h.createdAt,
  }
}

/**
 * One month's hopefuls — the books picked for it before they are read.
 *
 * The page is a list you build and a card you hand out, in that order: the
 * search adds a row the moment you press it (there is no form and no save
 * button, because a hopeful is three facts and a picture), and everything
 * below the list is the same share machinery the month collage uses.
 */
export function HopefulsDetail({ settings }: { settings: Settings }) {
  const nav = useNavigate()
  const { month } = useParams()
  const key = month ?? currentMonthKey()

  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [adding, setAdding] = useState(false)
  /* three catalogues answering at their own pace can land out of order */
  const seq = useRef(0)

  const [style, setStyle] = useState<CollageId>(settings.defaultCollage)
  /* The page does two jobs — building the list, and handing the card out — and
     they are not done at the same time. Stacked, the second is pushed off the
     bottom by the first: a twenty-book month puts the style picker and the
     Share button twenty rows down, so the half of the page that exists to be
     SHARED is the half nobody scrolls to. Two tabs, and each job gets the whole
     screen while it is the one being done. */
  const [tab, setTab] = useState<'list' | 'card'>('list')
  const [sharing, setSharing] = useState(false)
  /* which row's cover is being changed — an id, so the modal always reads the
     live row rather than a copy taken when it opened */
  const [coverFor, setCoverFor] = useState<number | null>(null)
  /* and which row is being shared as a story, for the same reason. The style
     is its own state rather than the collage tab's: a hopefuls list and one
     book in a portrait frame are two different objects, and the style that
     suits twelve covers in a grid is not necessarily the one that suits a
     single cover at 500px. It still OPENS on the same default. */
  const [storyFor, setStoryFor] = useState<number | null>(null)
  const [storyStyle, setStoryStyle] = useState<CollageId>(settings.defaultCollage)

  const rows = useLiveQuery(
    () => db.hopefuls.where('month').equals(key).sortBy('createdAt'),
    [key]
  )

  /* A hopeful stops being a hopeful when the book gets read, and the list has
     no way of noticing on its own. Writing it up FROM here removes the row —
     `write()` carries the id and the editor buries it on save — but that is
     only one of the two ways a book gets reviewed. Search the shelf, add it,
     write it up, and the hopefuls list is untouched: the row sits there
     offering to review a book that is already on the shelf, which is the
     reported fault.

     The match is on content, not on the id, exactly as the sync fold and the
     Goodreads import match: title and author, flattened, with no date in the
     key — a hopeful has no finished date, and any review of that book means it
     has been read.

     It reads the TITLE INDEX KEYS first and fetches only the rows whose title
     flattens onto one we are asking about. `db.reviews.toArray()` would be the
     obvious way to write this and is the wrong one: a review row carries its
     body and its cover as a data URL, so a two-hundred-book shelf is tens of
     megabytes pulled in order to read two fields off each row, on a page that
     redraws whenever anything in the database changes. Index keys are strings
     and nothing else, and the second query is normally nought or one row. */
  const stamp = (rows ?? []).map((h) => `${h.id}:${flat(h.title)}|${flat(h.author)}`).join('~')
  const reviewed = useLiveQuery(async () => {
    const found = new Map<number, number>()
    const want = rows ?? []
    if (want.length === 0) return found
    const wanted = new Set(want.map((h) => flat(h.title)))
    const keys = (await db.reviews.orderBy('title').keys()) as string[]
    const hits = [...new Set(keys.filter((t) => wanted.has(flat(t))))]
    if (hits.length === 0) return found
    const mine = await db.reviews.where('title').anyOf(hits).toArray()
    for (const h of want) {
      if (h.id == null) continue
      const hit = mine.find(
        (r) => flat(r.title) === flat(h.title) && flat(r.author) === flat(h.author)
      )
      if (hit?.id != null) found.set(h.id, hit.id)
    }
    return found
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

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
    if (term.length < MIN_CHARS && !isIsbn(term)) {
      seq.current++
      setResult(null)
      setBusy(false)
      return
    }
    const t = setTimeout(() => run(term), DEBOUNCE)
    return () => clearTimeout(t)
  }, [q])

  const add = async (c: Candidate) => {
    setAdding(true)
    try {
      /* The candidate's art is a URL on somebody else's host. It is converted
         here, at add time, for the same reason a review's is: the card is
         rasterized into a file, and a file cannot hold a link. */
      const cover = c.covers[0] ? await coverToDataUrl(c.covers[0]) : undefined
      await db.hopefuls.add({
        month: key,
        title: c.title,
        author: c.author,
        series: c.series,
        isbn: c.isbn,
        cover,
        covers: c.covers,
        pages: c.pages,
        createdAt: Date.now(),
      })
      setQ('')
      setResult(null)
    } finally {
      setAdding(false)
    }
  }

  /* A hopeful is a book you have already looked up: the title, the author,
     the series, the ISBN, the length and the jacket are all sitting on the
     row. Writing it up should therefore cost nothing that has already been
     paid for — the editor opens on the second step, filled in, with the
     cover you chose here already chosen there. The row's id travels too, so
     a saved review takes the book off this list. */
  const write = (h: Hopeful) =>
    nav('/write', {
      state: {
        candidate: {
          title: h.title,
          author: h.author,
          series: h.series,
          isbn: h.isbn,
          pages: h.pages,
          covers: h.covers ?? [],
          source: 'openlibrary',
        } satisfies Candidate,
        cover: h.cover,
        hopeful: h.id,
      },
    })

  const books = (rows ?? []).map(asReview)
  const data: MonthData = { name: monthName(key), books, span: 'hopefuls' }

  const build = useCallback(
    (host: HTMLDivElement, shape: ExportShape) =>
      buildCollagePage({ name: monthName(key), books, span: 'hopefuls' }, style, host, shape),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, style, rows]
  )

  /* The story is one book, and it is the only card in the app that carries the
     reader's name — so the face is resolved to a data URI HERE, in React,
     where the cache lives. The renderer is a template literal and cannot call
     a hook or hold a cache of its own. */
  const told = (rows ?? []).find((r) => r.id === storyFor)
  const story: MonthData = {
    name: monthName(key),
    books: told ? [asReview(told)] : [],
    span: 'reading',
    reader: { name: settings.name, face: settings.face ? faceUri(settings.face) : undefined },
  }
  const storyBuild = useCallback(
    (host: HTMLDivElement) => buildStoryPage(story, storyStyle, host),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storyFor, storyStyle, rows, settings.name, settings.face]
  )

  if (!rows) return null

  const editing = rows.find((r) => r.id === coverFor)

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>{monthName(key)}</h1>
          <span>
            <Link to="/collage" style={{ color: 'inherit', textDecoration: 'none' }}>← Collage</Link>
          </span>
        </header>

        {rows.length > 0 && (
          <div className="seg mo-seg" role="group" aria-label="Hopefuls view">
            <button aria-pressed={tab === 'list'} onClick={() => setTab('list')}>The list</button>
            <button aria-pressed={tab === 'card'} onClick={() => setTab('card')}>The card</button>
          </div>
        )}

        {tab === 'list' && (
          <>
            <div className="field">
              <label className="ui-lbl" htmlFor="hq">Add a hopeful</label>
              <input
                id="hq"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Title, author, or ISBN"
              />
              <p className="field-hint" aria-live="polite">
                {adding ? 'Adding…' : busy ? 'Searching…' : 'Results appear as you type.'}
              </p>
            </div>

            {result && (
              <div className="res">
                <p className="field-hint" role="status">
                  {result.answered === 0
                    ? result.limited > 0
                      ? 'The catalogues are rate-limiting us. Wait a few seconds and try again.'
                      : 'No catalogue answered. Check your connection and try again.'
                    : result.candidates.length === 0
                      ? `Not in these catalogues (${result.answered} of ${result.asked} answered).`
                      : `${result.candidates.length} match${result.candidates.length > 1 ? 'es' : ''} · ${result.answered} of ${result.asked} catalogues answered.` +
                        (result.limited > 0 ? ' One is rate-limiting us.' : '')}
                </p>
                {result.candidates.map((c, i) => (
                  <button key={i} className="res-row" disabled={adding} onClick={() => add(c)}>
                    {c.covers[0] ? <img src={c.covers[0]} alt="" loading="lazy" /> : <span />}
                    <span>
                      <span className="res-t">{c.title}</span>
                      <span className="res-a" style={{ display: 'block' }}>
                        {c.author}
                        {c.year ? ` · ${c.year}` : ''}
                      </span>
                    </span>
                    <span className="res-src">Add</span>
                  </button>
                ))}
              </div>
            )}

            {rows.length === 0 ? (
              <div className="empty">
                <div className="ui-h">No hopefuls yet</div>
                <p>Search above for a book you mean to read this month.</p>
              </div>
            ) : (
              <div className="field">
                <span className="ui-lbl">
                  {rows.length} hopeful{rows.length === 1 ? '' : 's'}
                </span>
                <div className="mo-list">
                  {rows.map((h) => (
                    <div className="hope-row" key={h.id}>
                      {h.cover
                        ? <img src={h.cover} alt="" />
                        : <span className="hope-miss">No cover</span>}
                      <span className="hope-txt">
                        <span className="res-t">{h.title}</span>
                        <span className="res-a" style={{ display: 'block' }}>{h.author}</span>
                      </span>
                      <span className="hope-acts">
                        {reviewed?.get(h.id!) != null ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => nav(`/review/${reviewed.get(h.id!)}`)}
                          >
                            Reviewed
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => write(h)}
                          >
                            Review it
                          </button>
                        )}
                        {/* A Share here is not the hopefuls card — that is
                            the whole list, and it lives on the other tab — it
                            is THIS book in a portrait frame. It is hidden once
                            the book has been reviewed, because a finished book
                            has its own page to share from. */}
                        {reviewed?.get(h.id!) == null && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setStoryFor(h.id!)}
                          >
                            Share
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setCoverFor(h.id!)}
                        >
                          Cover
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => db.hopefuls.delete(h.id!)}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'card' && rows.length > 0 && (
          <>
            <div className="field">
              <StylePicker
                ids={COLLAGE_IDS}
                names={COLLAGE_NAMES}
                grounds={COLLAGE_GROUNDS}
                value={style}
                onChange={setStyle}
                label="Collage style"
              />
            </div>

            <CollapsedCard html={renderCollage(data, style)} />

            <div className="detail-acts detail-acts--one">
              <button className="btn" onClick={() => setSharing(true)}>Share</button>
            </div>
          </>
        )}
      </div>

      {editing && (
        <CoverModal
          covers={editing.covers ?? []}
          current={editing.cover}
          seed={`${editing.title} ${editing.author}`}
          onCovers={(next) => db.hopefuls.update(editing.id!, { covers: next })}
          onPick={(cover) => db.hopefuls.update(editing.id!, { cover, editedAt: Date.now() })}
          onClose={() => setCoverFor(null)}
        />
      )}

      {told && (
        <ExportSheet
          heading={told.title}
          baseName={storyBaseName(story)}
          picker={
            <StylePicker
              ids={COLLAGE_IDS}
              names={COLLAGE_NAMES}
              grounds={COLLAGE_GROUNDS}
              value={storyStyle}
              onChange={setStoryStyle}
              label="Card style"
            />
          }
          build={storyBuild}
          shape="phone"
          shapes={STORY_SHAPES}
          onShape={() => {}}
          exportImages={(mode: ExportMode) => shareStoryImage(story, storyStyle, mode)}
          onClose={() => setStoryFor(null)}
        />
      )}

      {sharing && (
        <ExportSheet
          heading={`${monthName(key)} hopefuls`}
          baseName={collageBaseName(data)}
          build={build}
          shape={settings.exportShape}
          onShape={(s) => db.settings.update(1, { exportShape: s })}
          exportImages={(mode: ExportMode, shape: ExportShape) =>
            shareCollageImage(data, style, mode, shape)}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  )
}

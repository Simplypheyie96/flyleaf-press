import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { db, getSettings, nextReviewNo } from '../db'
import type { Review, StyleId, HandId, FormatName, Plate } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS, HAND_IDS, HAND_NAMES, FORMAT_NAMES } from '../types'
import { HANDS, handProps } from '../fonts'
import { StarInput } from '../components/StarInput'
import { DateField } from '../components/DateField'
import { StylePicker } from '../components/StylePicker'
import { coverToDataUrl, lookupPages, searchBooks, type Candidate } from '../catalog'
import { todayIso } from '../format'

const fileToDataUrl = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(f)
  })

/* Write (or edit) a review. Reached from a catalogue pick — which pre-fills
   title, author, series, ISBN, and cover candidates — or by hand with every
   field blank. The cover pick is an INDEX into the candidate art, resolved to
   a stored dataURL only at save time; "no cover" is an explicit, honest state. */
export function Write() {
  const nav = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  /* Route state, from a catalogue pick or from a hopeful being written up. A
     hopeful arrives carrying a cover it already holds as BYTES — somebody
     chose that picture on the hopefuls page, and going back to a URL to
     arrive at the same one is a way to lose it — so it rides the same slot an
     upload does. `hopeful` is the row's id: that list is books you mean to
     read, so writing one up moves it onto the shelf rather than leaving the
     hopefuls card advertising a book you have finished. Nothing is lost in
     the move — every fact the row held is on this form. */
  const sent = location.state as
    { candidate?: Candidate; cover?: string; hopeful?: number } | null
  const candidate = sent?.candidate
  const held = sent?.cover
  const fromHopeful = sent?.hopeful

  const editing = id != null
  const [loaded, setLoaded] = useState(!editing)
  const [focusWrite, setFocusWrite] = useState(false)
  const [existing, setExisting] = useState<Review | null>(null)

  const [title, setTitle] = useState(candidate?.title ?? '')
  const [author, setAuthor] = useState(candidate?.author ?? '')
  const [series, setSeries] = useState(candidate?.series ?? '')
  const [seriesNo, setSeriesNo] = useState(candidate?.seriesNo ?? '')
  /* held as a string so the field can be emptied — a half-typed "12" must not
     become 12 and then fight the next keystroke */
  const [pages, setPages] = useState(candidate?.pages ? String(candidate.pages) : '')
  const [started, setStarted] = useState('')
  const [finished, setFinished] = useState(todayIso())
  const [formats, setFormats] = useState<FormatName[]>([])
  /* 0 is "not yet rated". A form that starts at 3.5 invents an opinion and
     then prints it on the card as though it were yours. */
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [style, setStyle] = useState<StyleId>('archive')
  /* Kalam is the default and stays the recorded one — this is the seed, not a
     migration, and a review saved in it carries no `hand` at all. */
  const [hand, setHand] = useState<HandId>('kalam')
  const [plates, setPlates] = useState<Plate[]>([])

  /* cover: candidate index, an uploaded dataURL, or explicitly none.
     Candidates persist on the row (the Flyleaf pattern), so editing a review
     still offers the catalogue art; a row saved before candidates were kept
     gets one quiet search to find some. */
  const [covers, setCovers] = useState<string[]>(candidate?.covers ?? [])
  const [hunting, setHunting] = useState(false)
  const [coverIdx, setCoverIdx] = useState<number | 'none' | 'upload'>(
    held ? 'upload' : (candidate?.covers ?? []).length ? 0 : 'none'
  )
  const [uploadedCover, setUploadedCover] = useState(held ?? '')
  /* a carried cover is not an upload, and calling somebody's own catalogue
     pick one would be a small lie in the one line that explains the picture */
  const [carried, setCarried] = useState(!!held)
  /* the candidate grid lives in a modal — a long candidate list would
     otherwise swallow the form */
  const [coverOpen, setCoverOpen] = useState(false)

  /* the modal's own search: a book published under two names ("Another Life"
     is also "The Things We Do for Love") keeps its other jacket reachable —
     found covers are APPENDED to the grid, never replacing what is there */
  const [coverQ, setCoverQ] = useState('')
  const [coverSearching, setCoverSearching] = useState(false)
  const [coverNote, setCoverNote] = useState('')

  const [saving, setSaving] = useState(false)

  const searchMoreCovers = async () => {
    const q = coverQ.trim()
    if (!q || coverSearching) return
    setCoverSearching(true)
    setCoverNote('')
    try {
      const res = await searchBooks(q)
      const found: string[] = []
      for (const c of res.candidates)
        for (const u of c.covers) if (!covers.includes(u) && !found.includes(u)) found.push(u)
      if (found.length) {
        setCovers((cur) => [...cur, ...found.filter((u) => !cur.includes(u)).slice(0, 12)])
      } else {
        setCoverNote(
          res.limited > 0
            ? 'A catalogue is rate-limiting us — try again in a minute.'
            : 'No covers under that title.'
        )
      }
    } catch {
      setCoverNote('The search failed. Check the connection and try again.')
    } finally {
      setCoverSearching(false)
    }
  }

  useEffect(() => {
    getSettings().then((s) => !editing && setStyle(s.defaultStyle))
  }, [editing])

  /* Apple's ebook API never reports a length and Google's quota can run dry,
     so a perfectly good candidate often arrives with no page count. Go and ask
     for one — once, quietly, and only into a field the user hasn't typed in.
     The old version of this only ran when the candidate carried an ISBN, which
     is exactly the case Apple never satisfies, so the books most likely to be
     missing a length were the ones it never asked about. */
  useEffect(() => {
    if (editing || pages || !candidate || candidate.pages) return
    let live = true
    lookupPages(candidate).then((n) => {
      if (live && n) setPages((cur) => (cur ? cur : String(n)))
    })
    return () => { live = false }
    /* candidate is route state and never changes for a given mount */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  /* the focused writing page takes the whole viewport — freeze the page
     behind it and let Escape close it */
  useEffect(() => {
    if (!focusWrite) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocusWrite(false)
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [focusWrite])

  useEffect(() => {
    if (!coverOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCoverOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [coverOpen])

  useEffect(() => {
    if (!editing) return
    db.reviews.get(Number(id)).then((r) => {
      if (!r) return nav('/', { replace: true })
      setExisting(r)
      setTitle(r.title); setAuthor(r.author)
      setSeries(r.series ?? ''); setSeriesNo(r.seriesNo ?? '')
      setPages(r.pages ? String(r.pages) : '')
      setStarted(r.started ?? ''); setFinished(r.finished)
      setFormats(r.formats); setRating(r.rating)
      setBody(r.body); setStyle(r.style); setHand(r.hand ?? 'kalam'); setPlates(r.plates)
      if (r.cover) { setUploadedCover(r.cover); setCoverIdx('upload') }
      const kept = r.covers ?? []
      setCovers(kept)
      /* a row saved before candidates were persisted has nothing to swap
         between — go and find some, once, quietly (the Flyleaf pattern) */
      if (kept.length === 0) {
        setHunting(true)
        searchBooks(r.isbn || `${r.title} ${r.author}`)
          .then((res) => {
            const found: string[] = []
            for (const c of res.candidates)
              for (const u of c.covers) if (!found.includes(u)) found.push(u)
            setCovers(found.slice(0, 8))
          })
          .catch(() => {})
          .finally(() => setHunting(false))
      }
      setLoaded(true)
    })
  }, [editing, id, nav])

  const toggleFormat = (f: FormatName) =>
    setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))

  const addPlate = async (file: File) => {
    const image = await fileToDataUrl(file)
    setPlates((cur) => [...cur, { image, caption: '' }])
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      let cover: string | undefined
      if (coverIdx === 'upload') cover = uploadedCover || undefined
      else if (coverIdx !== 'none') cover = await coverToDataUrl(covers[coverIdx])

      const rec: Omit<Review, 'id'> = {
        no: existing?.no ?? (await nextReviewNo()),
        title: title.trim(),
        author: author.trim(),
        series: series.trim() || undefined,
        seriesNo: seriesNo.trim() || undefined,
        started: started || undefined,
        finished,
        formats,
        rating,
        cover,
        covers: covers.length ? covers : undefined,
        isbn: existing?.isbn ?? candidate?.isbn,
        pages: Number(pages) > 0 ? Number(pages) : undefined,
        body: body.trim(),
        plates: plates.map((p) => ({ ...p, caption: p.caption.trim() })),
        style,
        /* absent means Kalam, which is what every row written before the hand
           was a choice already says — so the default writes nothing */
        hand: hand === 'kalam' ? undefined : hand,
        createdAt: existing?.createdAt ?? Date.now(),
        /* stamped on every save, edits included — this is how a sync knows
           whose copy of a review is the current one */
        editedAt: Date.now(),
      }
      const savedId = editing ? (await db.reviews.put({ ...rec, id: Number(id) }), Number(id)) : await db.reviews.add(rec as Review)
      /* the hopeful has become the review — after the write, so an abandoned
         form leaves the list exactly as it was */
      if (fromHopeful != null && !editing) await db.hopefuls.delete(fromHopeful)
      nav(`/review/${savedId}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null
  /* named, so the hint can say which piece is actually missing rather than
     reciting the whole list back at someone who only forgot one */
  /* The body is NOT on this list. A rating and the two dates are a complete
     record of having read something — plenty of books get finished without
     anything worth writing down, and refusing to save one loses the reading
     as well as the note. What can't be missing is the opinion and the dates:
     those are what the card, the shelf order, and the monthly collage are
     built from. */
  const missing = [
    !title.trim() && 'a title',
    !author.trim() && 'an author',
    !formats.length && 'at least one format',
    !rating && 'a rating',
    !started && 'the date you started',
    !finished && 'the date you finished',
  ].filter(Boolean) as string[]
  const canSave = missing.length === 0
  const chosenCover =
    coverIdx === 'upload' ? uploadedCover : typeof coverIdx === 'number' ? covers[coverIdx] : ''

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>{editing ? 'Edit review' : 'Write the review'}</h1>
          <span>{editing ? `Review Nº ${existing?.no}` : 'Step 2 of 2'}</span>
        </header>

        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The book</h2>
          <div className="field">
            <label className="ui-lbl" htmlFor="w-title">Title</label>
            <input id="w-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label className="ui-lbl" htmlFor="w-author">Author</label>
            <input id="w-author" type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="field">
              <label className="ui-lbl" htmlFor="w-series">Series</label>
              <input id="w-series" type="text" value={series} placeholder="Auto-filled"
                onChange={(e) => setSeries(e.target.value)} />
            </div>
            <div className="field">
              <label className="ui-lbl" htmlFor="w-seriesno">Entry</label>
              <input id="w-seriesno" type="text" value={seriesNo} placeholder="e.g. Book 1"
                onChange={(e) => setSeriesNo(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="ui-lbl" htmlFor="w-pages">Pages</label>
            <input id="w-pages" className="inp-num" type="number" inputMode="numeric" min={1} max={99999}
              value={pages} placeholder="Auto-filled" onChange={(e) => setPages(e.target.value)} />
          </div>
          <div className="field">
            <span className="ui-lbl">Cover</span>
            <div className="cov-cur">
              {chosenCover
                ? <img src={chosenCover} alt="The chosen cover" />
                : <span className="cov-none">No cover</span>}
              <div className="cov-cur-txt">
                <p className="field-hint">
                  {hunting
                    ? 'Looking for covers…'
                    : chosenCover
                      ? coverIdx === 'upload'
                      ? carried ? 'The cover you picked' : 'Your own upload'
                      : 'From the catalogues'
                      : 'The card prints a blank slot'}
                </p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCoverOpen(true)}>
                  Edit cover
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The reading</h2>
          <div className="date-row">
            <DateField id="w-started" label="Date started" value={started} onChange={setStarted} />
            <DateField id="w-finished" label="Date finished" value={finished} onChange={setFinished} />
          </div>
          <div className="field">
            <span className="ui-lbl">Rating</span>
            <StarInput value={rating} onChange={setRating} />
            <p className="field-hint">Half stars by tap or drag — type the number for quarters.</p>
          </div>
        </section>

        {/* Format is required to save, and as one more label inside "The
            reading" it read as an aside and got walked past — so the review
            could not be saved and the reason was three fields up. Its own
            heading is what makes it a step rather than a detail, and the
            chips are drawn as real buttons for the same reason. */}
        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The format</h2>
          <div className="field">
            <span className="ui-lbl">Pick all that apply</span>
            <div className="fmt-pick">
              {FORMAT_NAMES.map((f) => (
                <button key={f} type="button" aria-pressed={formats.includes(f)}
                  onClick={() => toggleFormat(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The review</h2>
          <div className="field">
          <label className="ui-lbl" htmlFor="w-body">Your note — optional</label>
          <div className="canvas-wrap">
            <textarea id="w-body" className="hand" style={handProps(hand)}
              value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Blank lines make paragraphs." />
            <button type="button" className="canvas-expand" onClick={() => setFocusWrite(true)}>
              Expand
            </button>
          </div>
          {focusWrite && (
            <div className="write-focus" role="dialog" aria-modal="true" aria-label="The review, full page">
              <header className="write-focus-head">
                <span className="ui-lbl">{title.trim() || 'The review'}</span>
                <button type="button" className="canvas-expand write-focus-done"
                  onClick={() => setFocusWrite(false)}>
                  Done
                </button>
              </header>
              <textarea className="hand" autoFocus style={handProps(hand)}
                value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Blank lines make paragraphs."
                aria-label="The review" />
            </div>
          )}
          </div>

          {/* The hand is part of the writing, not part of the card's clothes,
              so it sits here rather than in "The card" — and the canvas above
              is already set in it, so the review is written in the face it
              gets printed in. Each name is drawn in its own face at its own
              size: the sample IS the label, and a list of five identical words
              in one font would be five choices nobody could tell apart. */}
          <div className="field">
            <span className="ui-lbl">The hand</span>
            <div className="hand-pick">
              {HAND_IDS.map((h) => (
                <button key={h} type="button" aria-pressed={hand === h}
                  onClick={() => setHand(h)}
                  style={{ fontFamily: `"${HANDS[h].family}", cursive`, fontSize: HANDS[h].size * 0.88 }}>
                  {HAND_NAMES[h]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The plates</h2>
          <div className="field">
          <span className="ui-lbl">Photos — optional</span>
          <div className="plate-edit">
            {plates.map((p, i) => (
              <div key={i} className="plate-edit-row">
                {p.image ? <img src={p.image} alt="" /> : <span className="cov-none" style={{ width: 64, aspectRatio: '1' }}>Art</span>}
                <input type="text" value={p.caption} placeholder="a caption, in your hand"
                  onChange={(e) => setPlates((cur) => cur.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
                <button className="btn btn--danger btn--sm" type="button"
                  onClick={() => setPlates((cur) => cur.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          {plates.length < 4 && (
            <label className="btn btn--ghost btn--sm" style={{ width: 'max-content' }}>
              Add a photo
              <input type="file" accept="image/*" hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) await addPlate(f)
                  e.target.value = ''
                }} />
            </label>
          )}
          </div>
        </section>

        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The card</h2>
          <div className="field">
            <StylePicker ids={STYLE_IDS} names={STYLE_NAMES} grounds={STYLE_GROUNDS} value={style} onChange={setStyle} />
          </div>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={save} disabled={!canSave || saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save review'}
          </button>
          <button className="btn btn--ghost" onClick={() => nav(-1)}>Cancel</button>
        </div>
        {!canSave && (
          <p className="field-hint" style={{ marginTop: 12 }}>
            Still needs {missing.length > 1
              ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
              : missing[0]}.
          </p>
        )}
      </div>

      {coverOpen && (
        <div className="share-scrim" role="dialog" aria-modal="true" aria-label="Choose a cover"
          onClick={(e) => e.target === e.currentTarget && setCoverOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-top">
              <span className="ui-lbl">Choose a cover</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCoverOpen(false)}>
                Done
              </button>
            </div>
            {hunting && <p className="field-hint">Looking for covers…</p>}
            <div className="cov-pick">
              {uploadedCover && (
                <button type="button" aria-pressed={coverIdx === 'upload'}
                  onClick={() => { setCoverIdx('upload'); setCoverOpen(false) }}>
                  <img src={uploadedCover} alt={carried ? 'The cover you picked' : 'Your uploaded cover'} />
                </button>
              )}
              {covers.map((u, i) => (
                <button key={u} type="button" aria-pressed={coverIdx === i}
                  onClick={() => { setCoverIdx(i); setCoverOpen(false) }}>
                  <img src={u} alt={`Cover option ${i + 1}`} loading="lazy" />
                </button>
              ))}
            </div>
            {!hunting && covers.length === 0 && !uploadedCover && (
              <p className="field-hint">No covers found. Upload your own, or go without.</p>
            )}
            <div className="field">
              <label className="ui-lbl" htmlFor="w-coverq">Find covers under another title</label>
              <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                <input id="w-coverq" type="search" value={coverQ} style={{ flex: 1, minWidth: 0 }}
                  placeholder="e.g. the book's other name"
                  onChange={(e) => setCoverQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchMoreCovers()} />
                <button type="button" className="btn btn--ghost btn--sm"
                  disabled={coverSearching || !coverQ.trim()} onClick={searchMoreCovers}>
                  {coverSearching ? 'Searching…' : 'Find covers'}
                </button>
              </div>
              {coverNote && <p className="field-hint">{coverNote}</p>}
            </div>
            <div className="modal-actions">
              <label className="btn btn--ghost btn--sm">
                Upload your own
                <input type="file" accept="image/*" hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setUploadedCover(await fileToDataUrl(f))
                      setCarried(false)
                      setCoverIdx('upload')
                      setCoverOpen(false)
                    }
                    e.target.value = ''
                  }} />
              </label>
              <button type="button" className="btn btn--ghost btn--sm" aria-pressed={coverIdx === 'none'}
                onClick={() => { setCoverIdx('none'); setCoverOpen(false) }}>
                No cover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { db, getSettings, nextReviewNo } from '../db'
import type { Review, StyleId, FormatName, Plate } from '../types'
import { STYLE_IDS, STYLE_NAMES, STYLE_GROUNDS, FORMAT_NAMES } from '../types'
import { StarInput } from '../components/StarInput'
import { StylePicker } from '../components/StylePicker'
import { coverToDataUrl, searchBooks, type Candidate } from '../catalog'
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
  const candidate = (location.state as { candidate?: Candidate } | null)?.candidate

  const editing = id != null
  const [loaded, setLoaded] = useState(!editing)
  const [focusWrite, setFocusWrite] = useState(false)
  const [existing, setExisting] = useState<Review | null>(null)

  const [title, setTitle] = useState(candidate?.title ?? '')
  const [author, setAuthor] = useState(candidate?.author ?? '')
  const [series, setSeries] = useState(candidate?.series ?? '')
  const [seriesNo, setSeriesNo] = useState(candidate?.seriesNo ?? '')
  const [started, setStarted] = useState('')
  const [finished, setFinished] = useState(todayIso())
  const [formats, setFormats] = useState<FormatName[]>([])
  const [rating, setRating] = useState(3.5)
  const [body, setBody] = useState('')
  const [style, setStyle] = useState<StyleId>('archive')
  const [plates, setPlates] = useState<Plate[]>([])

  /* cover: candidate index, an uploaded dataURL, or explicitly none.
     Candidates persist on the row (the Flyleaf pattern), so editing a review
     still offers the catalogue art; a row saved before candidates were kept
     gets one quiet search to find some. */
  const [covers, setCovers] = useState<string[]>(candidate?.covers ?? [])
  const [hunting, setHunting] = useState(false)
  const [coverIdx, setCoverIdx] = useState<number | 'none' | 'upload'>(
    (candidate?.covers ?? []).length ? 0 : 'none'
  )
  const [uploadedCover, setUploadedCover] = useState('')
  /* the candidate grid lives in a modal — a long candidate list would
     otherwise swallow the form */
  const [coverOpen, setCoverOpen] = useState(false)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings().then((s) => !editing && setStyle(s.defaultStyle))
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
      setStarted(r.started ?? ''); setFinished(r.finished)
      setFormats(r.formats); setRating(r.rating)
      setBody(r.body); setStyle(r.style); setPlates(r.plates)
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
    if (!title.trim() || !author.trim() || !body.trim() || formats.length === 0) return
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
        body: body.trim(),
        plates: plates.map((p) => ({ ...p, caption: p.caption.trim() })),
        style,
        createdAt: existing?.createdAt ?? Date.now(),
      }
      const savedId = editing ? (await db.reviews.put({ ...rec, id: Number(id) }), Number(id)) : await db.reviews.add(rec as Review)
      nav(`/review/${savedId}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null
  const canSave = !!(title.trim() && author.trim() && body.trim() && formats.length)
  const chosenCover =
    coverIdx === 'upload' ? uploadedCover : typeof coverIdx === 'number' ? covers[coverIdx] : ''

  return (
    <div className="page">
      <div className="page-inner">
        <header className="app-head">
          <h1>{editing ? 'Edit review' : 'Write the review'}</h1>
          <span>{editing ? `Nº ${existing?.no}` : 'Step 2 of 2'}</span>
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
            <span className="ui-lbl">Cover</span>
            <div className="cov-cur">
              {chosenCover
                ? <img src={chosenCover} alt="The chosen cover" />
                : <span className="cov-none">No cover</span>}
              <div className="cov-cur-txt">
                <p className="field-hint">
                  {hunting
                    ? 'Looking for covers in the catalogues…'
                    : chosenCover
                      ? coverIdx === 'upload' ? 'Your own upload.' : 'From the catalogues.'
                      : 'The card prints an honest "no cover" slot — never a placeholder.'}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="field">
              <label className="ui-lbl" htmlFor="w-started">Date started</label>
              <input id="w-started" type="date" value={started} onChange={(e) => setStarted(e.target.value)} />
            </div>
            <div className="field">
              <label className="ui-lbl" htmlFor="w-finished">Date finished</label>
              <input id="w-finished" type="date" value={finished} onChange={(e) => setFinished(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <span className="ui-lbl">Formats — pick all that apply</span>
            <div className="fmt-pick">
              {FORMAT_NAMES.map((f, i) => (
                <span key={f} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {i > 0 && <span className="sep">·</span>}
                  <button type="button" aria-pressed={formats.includes(f)} onClick={() => toggleFormat(f)}>
                    {f}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="ui-lbl">Rating</span>
            <StarInput value={rating} onChange={setRating} />
            <p className="field-hint">Quarter steps — drag across the stars, or nudge with the arrow keys.</p>
          </div>
        </section>

        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The review</h2>
          <div className="field">
          <label className="ui-lbl" htmlFor="w-body">Write however much you want</label>
          <div className="canvas-wrap">
            <textarea id="w-body" className="hand"
              value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Blank lines make paragraphs. If it outgrows one page it splits to a second at a paragraph — shared whole either way." />
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
              <textarea className="hand" autoFocus
                value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Blank lines make paragraphs. If it outgrows one page it splits to a second at a paragraph — shared whole either way."
                aria-label="The review" />
            </div>
          )}
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
          <p className="field-hint">
            Photos print as polaroid plates in a row under the review. Skip this entirely and the
            card closes clean after the text — no empty frames, no placeholders.
          </p>
          </div>
        </section>

        <section className="form-sec">
          <h2 className="ui-lbl form-sec-h">The card</h2>
          <div className="field">
            <span className="ui-lbl">Style — changeable any time, including at share</span>
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
            Needs a title, an author, at least one format, and the review itself.
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
            {hunting && <p className="field-hint">Looking for covers in the catalogues…</p>}
            <div className="cov-pick">
              {uploadedCover && (
                <button type="button" aria-pressed={coverIdx === 'upload'}
                  onClick={() => { setCoverIdx('upload'); setCoverOpen(false) }}>
                  <img src={uploadedCover} alt="Your uploaded cover" />
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
              <p className="field-hint">The catalogues had no art for this one — upload your own, or go without.</p>
            )}
            <div className="modal-actions">
              <label className="btn btn--ghost btn--sm">
                Upload your own
                <input type="file" accept="image/*" hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setUploadedCover(await fileToDataUrl(f))
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

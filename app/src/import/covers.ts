/* Finding covers for books that arrived without one.

   A Goodreads export carries no artwork whatsoever — not a URL, not a
   thumbnail, nothing. So an import of eighty books lands eighty blank cards,
   and this app's rule is that a cover is real or absent, never generated. That
   leaves going and looking, which means talking to catalogues that rate-limit
   anonymous callers by IP — and eighty searches fired at once is the fastest
   way to be turned away for the next minute.

   Two things make it affordable:

   1. OPEN LIBRARY'S COVER ENDPOINT IS NOT A SEARCH. `covers.openlibrary.org`
      is a static image host addressed by ISBN, and `?default=false` makes it
      answer 404 instead of handing back a blank placeholder that would be
      stored as if it were a cover. It costs no search quota at all, and a
      Goodreads row nearly always has an ISBN13. It is tried first for exactly
      that reason.

   2. THE FALLBACK GOES ONE AT A TIME. `searchBooks` already carries a 60s
      per-source cooldown and a per-query cache, so the sweep's only job is to
      not stampede: one book in flight, a pause between — and when a catalogue
      says it has had enough, the book is deferred to the end of the queue and
      the sweep moves on, waiting only once, at the end, for whatever cooldown
      is still left.

   Resumability is a property of the query, not of saved progress: the sweep
   only ever looks at rows that have no cover, so stopping it and starting it
   again picks up precisely where it stopped. Nothing needs to be written down,
   and there is no half-finished state to get stale. */

import { db } from '../db'
import { amazonCover, cooldownRemaining, coverToDataUrl, isbn10Of, otherIsbn, searchBooks } from '../catalog'
import type { Review } from '../types'

/** Between two static cover fetches. Enough to be a queue rather than a burst. */
const CDN_GAP_MS = 120
/** Between two catalogue searches — the expensive path. */
const SEARCH_GAP_MS = 1200

/* Abort-aware, because the longest sleep here is a rate-limit cooldown of up
   to a minute: a Stop pressed during it must end the wait, not be discovered
   after it. */
const sleep = (ms: number, sig?: AbortSignal) =>
  new Promise<void>((r) => {
    if (sig?.aborted) return r()
    const t = setTimeout(done, ms)
    function done() {
      sig?.removeEventListener('abort', done)
      clearTimeout(t)
      r()
    }
    sig?.addEventListener('abort', done)
  })

export interface Progress {
  done: number
  total: number
  found: number
  /** the book being looked up right now, for the line under the bar */
  current?: string
  /** true while waiting out a rate limit before retrying the deferred books —
      only ever at the END of the sweep, so the pause can be explained rather
      than looking like a stall */
  waiting?: boolean
}

/** Open Library's static cover host. `default=false` is what makes a miss a
    404 rather than a 1×1 grey placeholder saved as somebody's book. */
function olCover(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`
}

/**
 * Fill in missing covers, one book at a time, in the background.
 *
 * Never touches a row that already has a `cover`: a manual upload and a
 * deliberate pick are both choices, and this is a sweep, not an opinion.
 */
export async function backfillCovers(
  onProgress: (p: Progress) => void,
  signal?: AbortSignal
): Promise<Progress> {
  const all = await db.reviews.toArray()
  const todo = all.filter((r) => !r.cover)
  const p: Progress = { done: 0, total: todo.length, found: 0 }
  onProgress({ ...p })

  /* Two passes. A book whose search came back rate-limited is not waited on —
     it is DEFERRED to the end and the sweep moves straight to the next book:
     its static-host lookups and the catalogues still answering owe nothing to
     the one that turned us away. Only when nothing else is left does the sweep
     wait, and only for as long as the cooldown actually has left — not a flat
     minute spent in front of a bar that looks stalled. */
  const deferred: Review[] = []
  await pass(todo, deferred)
  if (deferred.length && !signal?.aborted) {
    const wait = cooldownRemaining()
    if (wait > 0) {
      p.waiting = true
      onProgress({ ...p })
      await sleep(wait, signal)
      p.waiting = false
      onProgress({ ...p })
    }
    /* One retry pass. A book limited AGAIN here is the catalogue genuinely
       unavailable — it stays coverless, which is the honest outcome and never
       recorded as "has no cover", and the sweep can be run again later. */
    if (!signal?.aborted) await pass(deferred, null)
  }

  p.current = undefined
  onProgress({ ...p })
  return p

  /** One run down a list of books. `defer` is where a rate-limited book goes
      to be retried later — or null on the retry pass itself, where a second
      limit just counts the book done and coverless. */
  async function pass(list: Review[], defer: Review[] | null) {
    for (const r of list) {
      if (signal?.aborted) return
      p.current = r.title
      onProgress({ ...p })

      const got = await coverFor(r, signal)
      if (got === 'limited' && defer) {
        /* not done — it comes back at the end of the queue */
        defer.push(r)
        p.current = undefined
        onProgress({ ...p })
        continue
      }
      if (got && got !== 'limited' && r.id != null) {
        /* `covers` too, not just `cover` — the edit page's cover grid reads the
           candidate list, and a row with none gets a fresh catalogue search when
           it opens. Storing what we already found saves that. */
        await db.reviews.update(r.id, {
          cover: got.cover,
          covers: got.covers?.length ? got.covers : undefined,
          editedAt: Date.now(),
        })
        p.found++
      }

      p.done++
      p.current = undefined
      onProgress({ ...p })
      if (signal?.aborted) return
      const searched = got === 'limited' || (got !== undefined && got.viaSearch)
      await sleep(searched ? SEARCH_GAP_MS : CDN_GAP_MS, signal)
    }
  }

  async function coverFor(
    rec: Review,
    sig?: AbortSignal
  ): Promise<{ cover: string; covers?: string[]; viaSearch: boolean } | 'limited' | undefined> {
    /* Cheapest first: the exact edition, by number, off a static host —
       under BOTH forms of the number, because Open Library indexes a cover
       by whichever ISBN the edition was catalogued with. */
    if (rec.isbn) {
      const twin = otherIsbn(rec.isbn)
      const ten = isbn10Of(rec.isbn)
      const urls = [
        ...(twin ? [rec.isbn, twin] : [rec.isbn]).map(olCover),
        /* Amazon last: OL's art is usually cleaner, but for an
           Amazon-imprint book it is the only host that answers at all. */
        ...(ten ? [amazonCover(ten)] : []),
      ]
      for (const url of urls) {
        if (sig?.aborted) return undefined
        const data = await coverToDataUrl(url)
        /* The URL is kept alongside the bytes so the edit page's cover grid
           has a candidate to show without going and searching again. */
        if (data) return { cover: data, covers: [url], viaSearch: false }
        await sleep(CDN_GAP_MS, sig)
      }
    }
    if (sig?.aborted) return undefined

    /* Then the metered path — and only once per book (plus one retry with
       the subtitle cut: a colon subtitle is the commonest reason a search
       misses a book the catalogues actually hold). */
    const q = `${rec.title} ${rec.author}`.trim()
    if (!q) return undefined
    try {
      const res = await searchBooks(q)
      /* A rate-limited silence is not a miss — the book is handed back to the
         caller to be deferred and retried once the cooldown has run out,
         while the sweep gets on with the books it CAN still look up. */
      if (res.limited > 0 && !res.candidates.length) return 'limited'
      const got = await fromCandidates(res.candidates)
      if (got) return got
      /* Nothing usable under the full title. If it carries a subtitle, try
         once more without it — same author, so the risk of the wrong book is
         small, and a wrong cover would still only be a CANDIDATE fetch that
         has to match this title's search. */
      const short = rec.title.split(':')[0].trim()
      if (sig?.aborted || !short || short === rec.title.trim()) return undefined
      await sleep(SEARCH_GAP_MS, sig)
      if (sig?.aborted) return undefined
      const retry = await searchBooks(`${short} ${rec.author}`.trim())
      return await fromCandidates(retry.candidates)
    } catch {
      return undefined
    }
  }

  /* The candidate list is URLs; the card needs bytes. Google's cover host
     (`books.google.com/books/content`) sends no CORS headers, so a fetch of
     it can NEVER become a data URL — measured, not assumed — which is why it
     sorts to the back: a book whose first candidates are all Google's would
     otherwise spend every attempt on requests that cannot succeed. Six
     attempts, not unlimited: a book whose first six reachable covers are all
     dead is not worth a seventh request in a sweep of eighty. The whole list
     still lands on the row so the cover stays changeable by hand afterwards. */
  async function fromCandidates(
    cands: { covers: string[] }[]
  ): Promise<{ cover: string; covers: string[]; viaSearch: true } | undefined> {
    const urls = [...new Set(cands.flatMap((c) => c.covers).filter(Boolean))]
    const corsBlocked = (u: string) => u.includes('books.google.')
    const tryable = [...urls.filter((u) => !corsBlocked(u)), ...urls.filter(corsBlocked)]
    for (const u of tryable.slice(0, 6)) {
      const data = await coverToDataUrl(u)
      if (data) return { cover: data, covers: urls, viaSearch: true }
    }
    return undefined
  }
}

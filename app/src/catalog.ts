/* Book search — three catalogues in parallel, merged on a trust order.
   Ported mechanics: track how many catalogues ANSWERED (so "not in these
   catalogues" is distinguishable from "the search never happened"), detect
   ISBN by shape not check digit, and keep the cover pick as an INDEX into
   the candidate list, never a URL. */

export interface Candidate {
  title: string
  author: string
  series?: string
  seriesNo?: string
  isbn?: string
  year?: string
  /** pages in the catalogue's edition — Open Library and Google know, Apple doesn't */
  pages?: number
  /** candidate cover URLs, best first — the user's pick is an index into this */
  covers: string[]
  source: 'openlibrary' | 'apple' | 'google'
}

export interface SearchResult {
  candidates: Candidate[]
  /** how many of the three catalogues answered at all */
  answered: number
  asked: number
  /** how many turned us away rather than failed — a quota, not a fault. Worth
      distinguishing: "we are being rate-limited" is a wait-and-retry, while a
      catalogue that errored is a different problem and might never come back
      on this query. */
  limited: number
}

type Source = Candidate['source']

/** A catalogue said no because of a quota, not because it broke. */
class RateLimited extends Error {
  constructor(public source: Source) {
    super(source + ' is rate limiting')
  }
}

/* Google Books allows a small number of anonymous requests per IP per minute,
   shared by everyone behind that address. Search-as-you-type spends them fast,
   and a phone on carrier NAT can arrive already over the line — which is how a
   perfectly working app ends up reporting "2 of 3 catalogues answered" to
   someone who has typed nothing unusual.

   Three things are done about it, in order of how much they help:

   1. An optional API key. Quota then counts against the key, not the IP.
      Compiled into the bundle and therefore public, so it is only safe with
      an HTTP-referrer restriction set on it in the Google Cloud console —
      see .env.example. Unset, everything below still applies.
   2. A per-query cache, so retyping, backspacing, or coming back to the same
      book does not spend the allowance twice. The catalogues are answering
      about published books; the answer does not change within a session.
   3. A cooldown. Once a catalogue has said 429, asking it again immediately
      is both futile and part of the problem, so it is skipped for a minute
      and reported as limited rather than silently retried. */
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_BOOKS_KEY

const COOLDOWN_MS = 60_000
const coolUntil: Record<Source, number> = { openlibrary: 0, apple: 0, google: 0 }

/** How long until EVERY catalogue is answering again — 0 when none is cooling.
    The cover sweep reads it: a rate-limited book is deferred to the end of the
    queue rather than waited on, and this is how long the retry pass at the end
    actually has to wait. Max across sources, not min — the deferral exists so
    the retry meets all three answering. */
export function cooldownRemaining(): number {
  return Math.max(0, ...Object.values(coolUntil).map((t) => t - Date.now()))
}

/** Turn a bad response into either a RateLimited (and a cooldown) or a plain
    error. Google reports an exhausted quota as 403 as often as 429, so both
    count; for the others only 429 does. */
function reject(source: Source, status: number): never {
  const limited = status === 429 || (source === 'google' && status === 403)
  if (limited) {
    coolUntil[source] = Date.now() + COOLDOWN_MS
    throw new RateLimited(source)
  }
  throw new Error(source + ' ' + status)
}

/* Small LRU, session-lifetime. Bounded because a long add-a-book session can
   type a lot of queries and this is holding cover URLs, not just ids. */
const CACHE_MAX = 60
const cache = new Map<string, Candidate[]>()

async function ask(source: Source, q: string, run: () => Promise<Candidate[]>): Promise<Candidate[]> {
  const key = source + '\u0000' + q.trim().toLowerCase()
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  if (Date.now() < coolUntil[source]) throw new RateLimited(source)
  const list = await run()
  cache.set(key, list)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
  return list
}

export function isIsbn(q: string): boolean {
  const s = q.replace(/[-\s]/g, '')
  return /^\d{9}[\dX]$/.test(s) || /^97[89]\d{10}$/.test(s)
}

/** The other form of the same number. Cover hosts index by whichever ISBN an
    edition was catalogued under, so a 13 that misses can hit as a 10 and vice
    versa. Only 978-prefixed 13s convert; a 979 book has no 10-digit form. */
export function otherIsbn(isbn: string): string | undefined {
  const s = isbn.replace(/[-\s]/g, '')
  if (/^978\d{10}$/.test(s)) {
    const core = s.slice(3, 12)
    const sum = [...core].reduce((a, d, i) => a + Number(d) * (10 - i), 0)
    const check = (11 - (sum % 11)) % 11
    return core + (check === 10 ? 'X' : String(check))
  }
  if (/^\d{9}[\dX]$/i.test(s)) {
    const core = `978${s.slice(0, 9)}`
    const sum = [...core].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0)
    return core + String((10 - (sum % 10)) % 10)
  }
  return undefined
}

/** The 10-digit form of an ISBN, if it has one: the number itself when it is
    already a 10, its converted twin when it is a 978-prefixed 13, and nothing
    for a 979 (which has no 10-digit form). */
export function isbn10Of(isbn: string): string | undefined {
  const s = isbn.replace(/[-\s]/g, '')
  if (/^\d{9}[\dX]$/i.test(s)) return s
  if (/^978\d{10}$/.test(s)) return otherIsbn(s)
  return undefined
}

/** Amazon's static cover host — the only place that reliably has art for
    Amazon-imprint books (Lake Union, Montlake, 47North…), which Apple never
    sells and Open Library often catalogues coverless. Keyed by ISBN-10 ONLY
    (a 13 answers with the miss GIF even when the book exists), CORS-open
    (`access-control-allow-origin: *`, measured), no API and no quota. A miss
    is a 200 carrying a 43-byte 1×1 GIF, not a 404 — which is exactly what
    `coverToDataUrl`'s `blob.size < 500` guard exists to reject, so a blank
    can never be saved as somebody's cover. */
export function amazonCover(isbn10: string): string {
  return `https://images-na.ssl-images-amazon.com/images/P/${encodeURIComponent(isbn10)}.01.LZZ.jpg`
}

/* Open Library only returns the fields you ask for, and the page count is not
   in the default set — an ISBN lookup without this list came back with every
   candidate's `pages` undefined, which is what made the Pages field stop
   auto-filling for the most precise way to search. Both branches ask for it. */
const OL_FIELDS = 'title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median'

async function searchOpenLibrary(q: string): Promise<Candidate[]> {
  const url = isIsbn(q)
    ? `https://openlibrary.org/search.json?isbn=${encodeURIComponent(q.replace(/[-\s]/g, ''))}&limit=8&fields=${OL_FIELDS}`
    : `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=${OL_FIELDS}`
  const res = await fetch(url)
  if (!res.ok) reject('openlibrary', res.status)
  const data = await res.json()
  return (data.docs || []).map((d: any): Candidate => {
    const covers: string[] = []
    if (d.cover_i) covers.push(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`)
    const isbn = (d.isbn || []).find((i: string) => /^97[89]\d{10}$/.test(i)) || (d.isbn || [])[0]
    if (isbn) covers.push(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`)
    return {
      title: d.title,
      author: (d.author_name || []).join(', ') || 'Unknown',
      isbn,
      year: d.first_publish_year ? String(d.first_publish_year) : undefined,
      /* the median across every edition Open Library holds — the closest thing
         to "how long is this book" when we don't know which printing was read */
      pages: d.number_of_pages_median || undefined,
      covers,
      source: 'openlibrary',
    }
  })
}

async function searchApple(q: string): Promise<Candidate[]> {
  /* `country=US` pins the storefront — same as Flyleaf. Without it Apple picks
     one from the caller's IP, and storefronts differ wildly in catalogue depth:
     a book that is plainly on Apple Books comes back empty from a thin one. */
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=ebook&limit=8&country=US`
  const res = await fetch(url)
  if (!res.ok) reject('apple', res.status)
  const data = await res.json()
  return (data.results || []).map((r: any): Candidate => ({
    title: r.trackName,
    author: r.artistName || 'Unknown',
    year: r.releaseDate ? r.releaseDate.slice(0, 4) : undefined,
    covers: r.artworkUrl100 ? [r.artworkUrl100.replace('100x100', '600x600')] : [],
    source: 'apple',
  }))
}

async function searchGoogle(q: string): Promise<Candidate[]> {
  const query = isIsbn(q) ? `isbn:${q.replace(/[-\s]/g, '')}` : q
  const url =
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8` +
    (GOOGLE_KEY ? `&key=${encodeURIComponent(GOOGLE_KEY)}` : '')
  const res = await fetch(url)
  if (!res.ok) reject('google', res.status)
  const data = await res.json()
  return (data.items || []).map((it: any): Candidate => {
    const v = it.volumeInfo || {}
    const isbn13 = (v.industryIdentifiers || []).find((x: any) => x.type === 'ISBN_13')?.identifier
    const covers: string[] = []
    if (v.imageLinks?.thumbnail) covers.push(v.imageLinks.thumbnail.replace('http://', 'https://').replace('zoom=1', 'zoom=2'))
    return {
      title: v.title,
      author: (v.authors || []).join(', ') || 'Unknown',
      series: v.seriesInfo?.bookDisplayNumber ? v.seriesInfo?.shortSeriesBookTitle : undefined,
      isbn: isbn13,
      year: v.publishedDate ? v.publishedDate.slice(0, 4) : undefined,
      pages: v.pageCount || undefined,
      covers,
      source: 'google',
    }
  })
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/* merge on a trust order: Open Library > Apple > Google. Duplicates (same
   normalized title+author) fold into the trusted row but keep every cover
   candidate so the user can flip through all catalogue art. */
export async function searchBooks(q: string): Promise<SearchResult> {
  const settled = await Promise.allSettled([
    ask('openlibrary', q, () => searchOpenLibrary(q)),
    ask('apple', q, () => searchApple(q)),
    ask('google', q, () => searchGoogle(q)),
  ])
  const answered = settled.filter((s) => s.status === 'fulfilled').length
  const limited = settled.filter(
    (s) => s.status === 'rejected' && s.reason instanceof RateLimited,
  ).length
  const lists = settled.map((s) => (s.status === 'fulfilled' ? s.value : []))

  const merged: Candidate[] = []
  const index = new Map<string, Candidate>()
  for (const list of lists) {
    for (const c of list) {
      if (!c.title) continue
      const key = norm(c.title) + '|' + norm(c.author.split(',')[0] || '')
      const existing = index.get(key)
      if (existing) {
        for (const cov of c.covers) if (!existing.covers.includes(cov)) existing.covers.push(cov)
        if (!existing.isbn && c.isbn) existing.isbn = c.isbn
        if (!existing.series && c.series) existing.series = c.series
        /* a page count from a less-trusted catalogue still beats none */
        if (!existing.pages && c.pages) existing.pages = c.pages
      } else {
        index.set(key, c)
        merged.push(c)
      }
    }
  }
  /* Amazon's cover host as a last candidate for anything carrying an ISBN —
     it is how an Amazon-imprint book (which Open Library returns coverless
     and Apple does not carry at all) still shows its art at Add time. Last,
     because catalogue art is usually cleaner when it exists. */
  for (const c of merged) {
    const ten = c.isbn ? isbn10Of(c.isbn) : undefined
    if (!ten) continue
    const u = amazonCover(ten)
    if (!c.covers.includes(u)) c.covers.push(u)
  }
  return { candidates: merged.slice(0, 12), answered, asked: 3, limited }
}

/* Filling in a page count the search didn't come back with.

   The search asks three catalogues one question and merges the answers, and a
   length is the field most likely to be missing from all three at once: Apple
   never reports one, Google's quota runs dry, and Open Library's search index
   carries a median only for books it holds several editions of. So a
   perfectly ordinary book — the sort with one printing and an Apple listing —
   used to arrive with the Pages field blank.

   Three tries, cheapest first, each one asking a narrower question than the
   search did. Any of them may come back with nothing, and nothing is a fact
   worth keeping: the field stays blank rather than being filled with a guess,
   and it is editable regardless, because editions genuinely disagree. */
export async function lookupPages(c: {
  isbn?: string
  title: string
  author: string
}): Promise<number | undefined> {
  /* 1 — the exact edition, if we know which one it is */
  if (c.isbn) {
    const n = await pagesForIsbn(c.isbn)
    if (n) return n
  }
  const title = c.title.trim()
  const author = (c.author || '').split(',')[0].trim()
  if (!title) return undefined

  /* 2 — Google by title and author. Its per-volume pageCount is the most
     reliable single figure any of the three publish, and this is one request
     rather than the eight a search spends. Skipped in a cooldown: asking a
     catalogue that has just refused us is what earned the refusal. */
  if (Date.now() >= coolUntil.google) {
    try {
      const q = `intitle:${title}` + (author ? ` inauthor:${author}` : '')
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5` +
          (GOOGLE_KEY ? `&key=${encodeURIComponent(GOOGLE_KEY)}` : '')
      )
      if (res.ok) {
        const d = await res.json()
        for (const it of d.items || []) {
          const n = Number(it.volumeInfo?.pageCount)
          if (n > 0) return n
        }
      } else if (res.status === 429 || res.status === 403) {
        coolUntil.google = Date.now() + COOLDOWN_MS
      }
    } catch {
      /* offline, or blocked — fall through to the last try */
    }
  }

  /* 3 — Open Library's median across every edition it holds. The vaguest of
     the three and the reason it goes last, but it is the one that answers for
     an old book with a dozen printings and no ISBN we were given. */
  try {
    const res = await fetch(
      'https://openlibrary.org/search.json?limit=1&fields=number_of_pages_median' +
        `&title=${encodeURIComponent(title)}` +
        (author ? `&author=${encodeURIComponent(author)}` : '')
    )
    if (!res.ok) return undefined
    const d = await res.json()
    const n = Number(d.docs?.[0]?.number_of_pages_median)
    return n > 0 ? n : undefined
  } catch {
    return undefined
  }
}

/* The exact-edition lookup the above leans on first. Open Library's /isbn
   endpoint answers for one printing, which is the only figure that is really
   true of the book somebody actually read. */
export async function pagesForIsbn(isbn: string): Promise<number | undefined> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn.replace(/[-\s]/g, ''))}.json`)
    if (!res.ok) return undefined
    const d = await res.json()
    const n = Number(d.number_of_pages)
    return n > 0 ? n : undefined
  } catch {
    return undefined
  }
}

/* Fetch a cover into a dataURL at pick time so the saved review renders
   offline and the share export never trips on a cross-origin canvas. */
export async function coverToDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return undefined
    const blob = await res.blob()
    if (!blob.type.startsWith('image/') || blob.size < 500) return undefined
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => resolve(undefined)
      fr.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

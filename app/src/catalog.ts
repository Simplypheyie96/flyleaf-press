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
  /** candidate cover URLs, best first — the user's pick is an index into this */
  covers: string[]
  source: 'openlibrary' | 'apple' | 'google'
}

export interface SearchResult {
  candidates: Candidate[]
  /** how many of the three catalogues answered at all */
  answered: number
  asked: number
}

export function isIsbn(q: string): boolean {
  const s = q.replace(/[-\s]/g, '')
  return /^\d{9}[\dX]$/.test(s) || /^97[89]\d{10}$/.test(s)
}

async function searchOpenLibrary(q: string): Promise<Candidate[]> {
  const url = isIsbn(q)
    ? `https://openlibrary.org/search.json?isbn=${encodeURIComponent(q.replace(/[-\s]/g, ''))}&limit=8`
    : `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=title,author_name,first_publish_year,isbn,cover_i`
  const res = await fetch(url)
  if (!res.ok) throw new Error('openlibrary ' + res.status)
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
      covers,
      source: 'openlibrary',
    }
  })
}

async function searchApple(q: string): Promise<Candidate[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=ebook&limit=8`
  const res = await fetch(url)
  if (!res.ok) throw new Error('apple ' + res.status)
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
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8`
  const res = await fetch(url)
  if (!res.ok) throw new Error('google ' + res.status)
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
  const sources = [searchOpenLibrary(q), searchApple(q), searchGoogle(q)]
  const settled = await Promise.allSettled(sources)
  const answered = settled.filter((s) => s.status === 'fulfilled').length
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
      } else {
        index.set(key, c)
        merged.push(c)
      }
    }
  }
  return { candidates: merged.slice(0, 12), answered, asked: 3 }
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

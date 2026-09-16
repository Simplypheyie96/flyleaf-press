/* Tags — the subject words a card can print, canonicalised out of three
   catalogues that do not agree on what a category even is.

   Measured, not guessed. For "The Fifth Season" the three sources answer:

     Apple   genres      Epic Fantasy · Books · Sci-Fi & Fantasy · Fantasy ·
                         Fiction & Literature · Literary Fiction
     Google  categories  Fiction / Fantasy / Epic          (a BISAC path)
     OpenLib subject     LGBTQ novels · Fiction, fantasy, epic ·
                         Mothers and daughters, fiction · Fiction, dystopian ·
                         New York Times reviewed · Hugo Award Winner ·
                         award:hugo_award=2016 · End of the world · Fiction …

   So: Apple hands over clean leaves with one junk entry, Google hands over a
   slash path, and Open Library hands over a comma-INVERTED path mixed with
   provenance noise and machine keys. All three go through the same pipe. */

/* Four is what a fact lane on a card holds. The narrowest home any of the
   twelve gives them is the archive rail, 92px of content, where each phrase
   already takes a line or two of its own. */
export const MAX_TAGS = 4

export type TagSource = 'apple' | 'google' | 'openlibrary'

/* Exact strings that are never a subject — they describe the record, the
   library it sits in, or the format, not the book. Keyed normalised. */
const JUNK = new Set([
  'books', 'book', 'ebook', 'ebooks', 'e book', 'audiobook', 'audiobooks',
  'paperback', 'hardcover', 'large type books', 'textbooks',
  'accessible book', 'protected daisy', 'in library', 'overdrive',
  'internet archive wishlist', 'open library staff picks',
  'popular print disabled books', 'lending library',
  'new york times reviewed', 'new york times bestseller',
  'fiction in english', 'translations into english', 'english fiction',
  'reading level', 'nyt', 'general', 'miscellanea', 'collections',
])

/* Real subjects, but so broad they say nothing on a card. Kept in the pool
   and ranked last, so a book whose catalogues offer nothing else still gets
   a word rather than a blank line. */
const BROAD = new Set([
  'fiction', 'nonfiction', 'non fiction', 'literature', 'novels', 'novel',
  'fiction literature', 'literary collections', 'juvenile',
  /* Apple's top-level shelf, on almost every novel it sells */
  'fiction and literature',
  /* real words, but bare taxonomy links that say nothing on their own —
     "Epic Fantasy" earns its place, "Epic" does not */
  'epic', 'historical', 'contemporary', 'ancient', 'modern', 'adventure',
])

/* Provenance, not subject: how a book did, who listed it, which shelf of a
   library site it sat on. Open Library carries a great deal of this. */
const NOISE = /\b(awards?|bestsellers?|best seller|longlist|shortlist|winner|nominee|staff picks?|wishlist|reviewed|accessible|daisy|overdrive)\b/i

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to'])

/* Open Library truncates a heading mid-phrase often enough to matter —
   "Crimes against", "Man-woman relationships in" — and half a phrase is worse
   on a card than no phrase, because it reads as a rendering fault. */
const DANGLE = /\b(against|and|as|at|by|for|from|in|into|of|on|or|the|to|with)$/

/* Shouted tokens get title-cased — Open Library writes whole BISAC paths in
   capitals — so the few that are genuinely initialisms have to be named. */
const ACRONYM = new Set(['LGBTQ', 'LGBTQIA', 'LGBT', 'YA', 'SF', 'US', 'UK', 'USA', 'AI', 'BIPOC'])

/* the dedupe key: case, punctuation and spacing all folded away, so
   "Sci-Fi & Fantasy" and "sci fi and fantasy" are one tag */
export const tagKey = (s: string): string =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()

const capPart = (p: string): string =>
  ACRONYM.has(p.replace(/[^A-Za-z]/g, '').toUpperCase()) && p === p.toUpperCase()
    ? p
    : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()

const titleCase = (s: string): string =>
  s
    .split(/\s+/)
    .map((tok, i) => {
      if (i > 0 && SMALL.has(tok.toLowerCase())) return tok.toLowerCase()
      return tok.split('-').map(capPart).join('-')
    })
    .join(' ')

/* One raw label in, zero or more display-ready phrases out. */
function phrases(raw: string, source: TagSource): string[] {
  let s = raw.trim()
  if (!s) return []
  /* Two of Open Library's machine keys are the best thing it says. `genre:` and
     `form:` are its structured facets — "genre:fantasy" on a book whose prose
     subjects are Labyrinths and Dwellings is the one label that names what the
     book IS — and the guard below would throw them out with the award codes for
     carrying a colon. Unwrapped here, before that guard, and only when what
     follows is a plain word: anything with a second colon or an `=` is a real
     machine key and falls through to be discarded. */
  const facet = /^(?:genre|form|subject):([a-z][a-z _-]*)$/i.exec(s)
  if (facet) s = facet[1].replace(/_/g, ' ').trim()
  /* machine keys (award:hugo_award=2016), dated and numbered subjects
     (20th century, 1900-1999, Reading Level-Grade 4), disambiguators
     (Harry Potter (Fictitious character)) and sentence-length entries are
     records about the record, not words to print on a card */
  if (/[:=(){}[\]<>|]/.test(s)) return []
  if (/\d/.test(s)) return []
  if (s.length > 34) return []
  if (NOISE.test(s)) return []

  /* The comma inversion is an OPEN LIBRARY convention and nobody else's.
     Apple names a shelf with commas in it — "Health, Mind & Body", "Fairy
     Tales, Myths & Fables" — and splitting those produces two half-shelves. */
  let parts: string[]
  if (s.includes('/')) parts = s.split('/').map((p) => p.trim()).reverse()
  else if (source === 'openlibrary' && s.includes(','))
    parts = s.split(',').map((p) => p.trim()).reverse()
  else parts = [s]
  parts = parts.filter(Boolean)
  if (!parts.length) return []
  if (parts.length === 1) return [titleCase(parts[0])]

  /* A path of single words is a taxonomy chain written backwards, and its two
     most specific links read as one phrase: "Fiction, fantasy, epic" and
     "Fiction / Fantasy / Epic" are both Epic Fantasy. A path with a phrase in
     it is not a chain — "Mothers and daughters, fiction" joined that way is
     nonsense — so those segments stand on their own. */
  const allSingle = parts.every((p) => !p.includes(' '))
  if (allSingle) return [titleCase(parts.slice(0, 2).join(' ')), titleCase(parts[0])]
  return parts.map(titleCase)
}


/* Apple's leaves are already the words a person would say, Google's BISAC is
   close behind, and Open Library's are the noisiest — so an OL subject has to
   be corroborated or plentiful to outrank the other two. Agreement across
   catalogues outranks all of it. */
/* Apple's leaves are already the words a person would say, Google's BISAC is
   close behind, and Open Library's are the noisiest — so an OL subject has to
   be corroborated, or near the top of its own list, to outrank the other two.
   Agreement across catalogues outranks all of it. */
const WEIGHT: Record<TagSource, number> = { apple: 6, google: 4, openlibrary: 1.6 }

/* What one label from one catalogue is worth.

   Two measured corrections sit in here. A record answering with SEVENTEEN
   genres is describing a shelf rather than a book — Apple's row for "The Hate
   U Give" lists Animal Fiction and Science Fiction for one contemporary novel
   — so a long answer is worth less per entry. And both catalogues order their
   answers, roughly, by how central each one is, so a label's position in its
   own list is worth reading. Open Library is exempt from the first rule and
   not the second: it ALWAYS answers with thirty or fifty, and scaling it by
   its own length would bury the good subjects it opens with. */
function labelWeight(source: TagSource, i: number, n: number): number {
  const base = source === 'openlibrary' ? WEIGHT[source] : WEIGHT[source] / Math.max(1, n / 6)
  const span = source === 'openlibrary' ? Math.min(n, 20) : n
  return base * Math.max(0.08, 1 - i / (span + 1))
}

/* Raw labels from any mix of catalogues → at most MAX_TAGS printable tags,
   most agreed-upon first. */
export function canonTags(
  input: Array<{ source: TagSource; labels: readonly string[] | undefined }>,
  max = MAX_TAGS
): string[] {
  const seen = new Map<string, { show: string; sources: Set<TagSource>; weight: number; order: number }>()
  let order = 0
  for (const { source, labels } of input) {
    if (!labels) continue
    labels.forEach((raw, i) => {
      if (typeof raw !== 'string') return
      const w = labelWeight(source, i, labels.length)
      for (const p of phrases(raw, source)) {
        const k = tagKey(p)
        if (!k || k.length < 3 || JUNK.has(k) || DANGLE.test(k)) continue
        const hit = seen.get(k)
        if (hit) {
          hit.sources.add(source)
          hit.weight += w
        } else {
          seen.set(k, { show: p, sources: new Set([source]), weight: w, order: order++ })
        }
      }
    })
  }
  const ranked = [...seen.entries()]
    .map(([k, v]) => ({
      ...v,
      key: k,
      score: v.sources.size * 100 + v.weight - (BROAD.has(k) ? 1000 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)

  /* One idea, one slot. Three catalogues describing the same fantasy novel
     hand back "Fantasy", "Epic Fantasy" and "Sci-Fi & Fantasy", and on a card
     with four lines to spend that is three lines saying one word. Where one
     tag's words are wholly inside another's, the MORE SPECIFIC survives — and
     it survives at the better-scoring one's rank, because the broad word is
     usually what two catalogues agreed on and the specific one is what is
     actually worth printing. */
  const kept: typeof ranked = []
  for (const cand of ranked) {
    const words = cand.key.split(' ').length
    let dropped = false
    for (let i = 0; i < kept.length; i++) {
      if (!nests(stem(kept[i].key), stem(cand.key))) continue
      if (words > kept[i].key.split(' ').length) kept[i] = cand
      dropped = true
      break
    }
    if (!dropped) kept.push(cand)
  }
  return kept.slice(0, max).map((v) => v.show)
}

/* Number folded away, for the containment test only. Catalogues disagree on it
   for one idea — Open Library answered "Family Life" and "Families" for the
   same novel, which is two of a card's four lines spent on one word — and the
   test above compares whole words, so "families" never sat inside "family
   life". Deliberately NOT part of `tagKey`: that key is what a stored tag is
   deduped by, and folding number there would make two tags a reader typed
   apart collapse into one. */
const stem = (k: string): string =>
  k
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1') : w))
    .join(' ')

/* True when one key's words sit whole inside the other's — " a " padding so
   "fantasy" matches "epic fantasy" and never matches "fantastic". */
function nests(a: string, b: string): boolean {
  const [x, y] = [` ${a} `, ` ${b} `]
  return x.includes(y) || y.includes(x)
}

/* Fold a second list into a first without duplicating or reordering — the
   same rule the cover candidates merge on. */
export function mergeTags(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] {
  const out: string[] = []
  const keys = new Set<string>()
  for (const t of [...(a ?? []), ...(b ?? [])]) {
    const k = tagKey(t)
    if (!k || keys.has(k)) continue
    keys.add(k)
    out.push(t)
  }
  return out
}

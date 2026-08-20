const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-07-29' → '29 Jul 2026' — the typeset date the cards print */
export function prettyDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

/** '2026-07-29' → '2026-07' */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** '2026-07' → 'July 2026' */
export function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** '2026-07-29' → '2026'. A year key is four digits and a month key is seven,
    which is the only thing distinguishing `/collage/2026` from
    `/collage/2026-07` on the way in — one route, told apart by shape. */
export function yearKey(iso: string): string {
  return iso.slice(0, 4)
}

export function isYearKey(key: string): boolean {
  return /^\d{4}$/.test(key)
}

/** '2026' → '2026'. A year needs no expansion the way a month does, but the
    pair of functions is what lets the collage page treat both the same. */
export function yearName(key: string): string {
  return key
}

export function currentYearKey(): string {
  return String(new Date().getFullYear())
}

export function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function fmtRating(r: number): string {
  return String(+r.toFixed(2))
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** split review text into paragraphs on blank lines */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

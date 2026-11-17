/* One-time rating request in the store apps (Google Play / App Store own sheet).
   Asked once, after real use: 3 times over at least 2 different days.
   The store decides whether the sheet actually shows. */
import { storeApp } from './native'

const KEY = 'press.review'
type State = { n: number; days: string[]; asked?: boolean }

export function noteUse() {
  if (!storeApp) return
  let s: State = { n: 0, days: [] }
  try {
    s = { ...s, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    /* fresh state */
  }
  if (s.asked) return
  const today = new Date().toISOString().slice(0, 10)
  s.n += 1
  if (!s.days.includes(today)) s.days = [...s.days, today].slice(-2)
  const ready = s.n >= 3 && s.days.length >= 2
  if (ready) s.asked = true
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage off: never ask rather than ask every time */
    return
  }
  if (ready) {
    setTimeout(() => {
      void import('@capacitor-community/in-app-review')
        .then(({ InAppReview }) => InAppReview.requestReview())
        .catch(() => {})
    }, 1500)
  }
}

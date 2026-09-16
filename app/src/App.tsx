import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from './db'
import { Nav } from './components/Nav'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { Shelf } from './pages/Shelf'
import { AddBook } from './pages/AddBook'
import { Write } from './pages/Write'
import { ReviewDetail } from './pages/ReviewDetail'
import { Months } from './pages/Months'
import { MonthDetail } from './pages/MonthDetail'
import { HopefulsDetail } from './pages/HopefulsDetail'
import { SettingsPage } from './pages/SettingsPage'
import { backfillTags } from './import/tags'
import type { Settings } from './types'

/* Chrome theme only — the cards re-pin the printed palette in CSS. 'system'
   resolves live, so the app follows the phone when the phone flips. */
function useTheme(settings?: Settings) {
  useEffect(() => {
    if (!settings) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const t = settings.theme === 'system' ? (mq.matches ? 'dark' : 'light') : settings.theme
      document.documentElement.dataset.theme = t
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings?.theme, settings])
}

/* old bookmarks: /months/2026-07 → /collage/2026-07 */
function MonthRedirect() {
  const { key } = useParams()
  return <Navigate to={key ? `/collage/${key}` : '/collage'} replace />
}

/* The demo shelf on the dev server, and nowhere else. Dynamic import inside
   the DEV branch: a static one would keep the fixture in the production graph
   even though the call never runs. */
async function seedTheDevServer() {
  if (!import.meta.env.DEV) return
  const { seedIfEmpty } = await import('./seed')
  await seedIfEmpty()
}

/* Books written up before tags existed get them without anybody going to look
   for a button. One quiet sweep per app open, started late enough that it is
   never competing with the first screen for the network, and only over rows
   that have no tags — so a fully tagged shelf starts nothing at all and an
   interrupted one resumes where it stopped. It paces itself, defers a
   rate-limited book rather than stalling, and the Settings row shows it running
   with a Stop beside it. */
function useQuietTagSweep(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      if (navigator.onLine) void backfillTags()
    }, 6000)
    return () => clearTimeout(t)
  }, [ready])
}

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([getSettings(), seedTheDevServer()]).then(() => setReady(true))
  }, [])

  useQuietTagSweep(ready)

  const settings = useLiveQuery(() => db.settings.get(1), [])
  useTheme(settings)

  if (!ready || !settings) return null

  if (!settings.onboarded) {
    return <Onboarding settings={settings} onDone={() => {}} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home settings={settings} />} />
        <Route path="/shelf" element={<Shelf settings={settings} />} />
        <Route path="/add" element={<AddBook />} />
        <Route path="/write" element={<Write />} />
        <Route path="/review/:id" element={<ReviewDetail settings={settings} />} />
        <Route path="/review/:id/edit" element={<Write />} />
        <Route path="/collage" element={<Months />} />
        <Route path="/collage/:key" element={<MonthDetail settings={settings} />} />
        <Route path="/hopefuls/:month" element={<HopefulsDetail settings={settings} />} />
        <Route path="/months" element={<Navigate to="/collage" replace />} />
        <Route path="/months/:key" element={<MonthRedirect />} />
        <Route path="/settings" element={<SettingsPage settings={settings} />} />
        {/* Anything else is Home, but by redirect rather than by rendering
            Home under the wrong URL: a bad path used to stay in the address
            bar, so a mistyped or dead link looked like it had worked and was
            the thing that got shared on. replace keeps it out of history. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Nav />
    </BrowserRouter>
  )
}

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from './db'
import { seedIfEmpty } from './seed'
import { Nav } from './components/Nav'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { Shelf } from './pages/Shelf'
import { AddBook } from './pages/AddBook'
import { Write } from './pages/Write'
import { ReviewDetail } from './pages/ReviewDetail'
import { Months } from './pages/Months'
import { MonthDetail } from './pages/MonthDetail'
import { SettingsPage } from './pages/SettingsPage'
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

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([getSettings(), seedIfEmpty()]).then(() => setReady(true))
  }, [])

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
        <Route path="/months" element={<Navigate to="/collage" replace />} />
        <Route path="/months/:key" element={<MonthRedirect />} />
        <Route path="/settings" element={<SettingsPage settings={settings} />} />
        <Route path="*" element={<Home settings={settings} />} />
      </Routes>
      <Nav />
    </BrowserRouter>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installFonts } from './fonts'
import './index.css'
import './cards/cards.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { startAutoSync } from './sync/sync'
import { initServiceWorker } from './pwa'
import { Analytics } from '@vercel/analytics/react'

/* Before the first paint: the @font-face rules live in a module now, not
   in a third-party stylesheet, so they have to be installed by hand. */
installFonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      {/* Page views only, and only the shape of the path. Vercel's script sends
          no cookies and builds no profile, but /review/12 would still put a row
          of this reader's own library into a dashboard — and a thousand distinct
          paths that say nothing. beforeSend collapses the two id routes to their
          pattern; a null return would drop the event entirely. It sits outside
          the router deliberately: it listens to history itself, so it needs no
          route context and keeps working on the pages App renders without one. */}
      <Analytics
        beforeSend={(e) => ({
          ...e,
          url: e.url
            .replace(/\/review\/[^/?#]+/, '/review/:id')
            .replace(/\/collage\/[^/?#]+/, '/collage/:month'),
        })}
      />
    </ErrorBoundary>
  </StrictMode>
)

/* The Drive triggers go on for everyone; they do nothing at all until somebody
   has connected an account. The one thing they do while disconnected is note
   that a write happened with nowhere to send it, which is what lets a later
   connection know the two libraries have genuinely diverged. */
startAutoSync()

/* Importing ./pwa is itself load-bearing: the beforeinstallprompt listener
   goes on at module scope, and that event fires once, early. Register the
   worker from here too, so Settings has a registration to check. */
initServiceWorker()

/* Drop the launch screen once there is something behind it. It waits on the
   web fonts so the first thing seen isn't the page in a fallback face, but
   only up to a beat — on a slow connection the app is more use than the
   right serif, and the splash must never be what someone stares at.

   The floor matters more than the ceiling. On a warm start the fonts are
   cached and document.fonts.ready settles in ~10ms, so the screen was torn
   down a frame after it painted — present in the DOM, never present to the
   eye, which reads as "there is no launch screen at all". HOLD is measured
   from navigation rather than from here, so the bundle's own parse time
   counts toward it and a slow start doesn't wait twice.

   1.8s, not 900ms: at 900 the screen was technically visible but read as a
   flash — long enough to measure, too short to look at. This is the number
   that has to be tuned by eye rather than by clock, and 1.8s is where the
   mark and the name land as a deliberate opening rather than a flicker. The
   420ms fade sits on top of that. */
const HOLD = 1800
const FONT_WAIT = 1200

const splash = document.getElementById('splash')
if (splash) {
  const done = () => {
    splash.classList.add('is-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
    /* transitionend doesn't fire if the element is hidden or the transition is
       optimised away — never leave a full-screen overlay pinned over the app */
    setTimeout(() => splash.remove(), 600)
  }
  const held = new Promise((r) => setTimeout(r, Math.max(0, HOLD - performance.now())))
  const fonts = Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, FONT_WAIT)),
  ])
  Promise.all([held, fonts]).then(() => requestAnimationFrame(done))
}

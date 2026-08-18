import { Link, useLocation } from 'react-router-dom'

/* The shell, per Flyleaf's nav (mechanics only): a floating capsule bar of
   icon-only tabs where the ACTIVE tab grows into an icon + label pill, and
   the one real action — add a book, write its review — stands beside the
   bar as its own round button. Icons are hand-drawn strokes on a 24 grid,
   1.8 weight, round caps; parts that must knock out (the slider thumbs)
   fill with --tab-bg, which the CSS flips when the tab is the filled one. */

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g {...strokeProps}>
        <path d="M4.5 10.5 L 12 4.5 L 19.5 10.5" />
        <path d="M6.5 9.5 L 6.5 18.5 C 6.5 19 7 19.5 7.5 19.5 L 16.5 19.5 C 17 19.5 17.5 19 17.5 18.5 L 17.5 9.5" />
        <path d="M10 19.5 L 10 14.5 C 10 14 10.5 13.5 11 13.5 L 13 13.5 C 13.5 13.5 14 14 14 14.5 L 14 19.5" />
      </g>
    </svg>
  )
}

function ShelfIcon() {
  /* spines on a board — the lean is what separates a shelf from a bar chart */
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g {...strokeProps}>
        <rect x="3" y="5" width="4.4" height="12.4" rx="1.2" />
        <rect x="9.8" y="6.3" width="4.4" height="11.1" rx="1.2" />
        <rect x="16.6" y="5" width="4.4" height="12.4" rx="1.2" transform="rotate(8 18.8 17.4)" />
        <path d="M2.2 20 L 21.8 20" />
      </g>
    </svg>
  )
}

function CollageIcon() {
  /* pasted plates at four sizes — the month page in miniature */
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g {...strokeProps}>
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13.5" y="4" width="6.5" height="10" rx="1" />
        <rect x="4" y="13.5" width="7" height="6.5" rx="1" />
        <rect x="13.5" y="16.5" width="6.5" height="3.5" rx="1" />
      </g>
    </svg>
  )
}

function SettingsIcon() {
  /* two slider rails; the thumbs knock out to whatever the pill is */
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g {...strokeProps}>
        <path d="M4.5 8 L 19.5 8" />
        <circle cx="9.5" cy="8" r="2" fill="var(--tab-bg, var(--card-w))" />
        <path d="M4.5 16 L 19.5 16" />
        <circle cx="14.5" cy="16" r="2" fill="var(--tab-bg, var(--card-w))" />
      </g>
    </svg>
  )
}

const TABS = [
  { to: '/', label: 'Home', end: true, Icon: HomeIcon },
  { to: '/shelf', label: 'Shelf', end: false, Icon: ShelfIcon },
  { to: '/collage', label: 'Collage', end: false, Icon: CollageIcon },
  { to: '/settings', label: 'Settings', end: false, Icon: SettingsIcon },
] as const

export function Nav() {
  const { pathname } = useLocation()
  /* review pages belong to the shelf's world — keep its tab lit there */
  const active = (to: string, end: boolean) =>
    end ? pathname === to : pathname.startsWith(to) || (to === '/shelf' && pathname.startsWith('/review'))

  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tab-pill">
        {TABS.map(({ to, label, end, Icon }) => {
          const on = active(to, end)
          return (
            <Link key={to} to={to} aria-current={on ? 'page' : undefined} aria-label={label}>
              <Icon />
              <span className="tab-lbl">{label}</span>
            </Link>
          )
        })}
      </div>
      <Link className="tab-add" to="/add" aria-label="Add a book and write its review">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </nav>
  )
}

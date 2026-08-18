/* Shared drawn objects — the rosette mark, stars, the gem clip, tape, staple,
   and the seeded plate line-art. Ported from the prototypes; the clip is the
   fifth take: a thin, small, near-vertical silver wire matching the reference —
   no chunky loops, no heavy gradient, barely-there shadow. */

export const MARK =
  'M256 57.6 A74.67 59.73 -90 1 1 256 206.93 A74.67 59.73 -90 1 1 256 57.6 Z M444.69 194.69 A74.67 59.73 -18 1 1 302.66 240.85 A74.67 59.73 -18 1 1 444.69 194.69 Z M372.61 416.51 A74.67 59.73 54 1 1 284.84 295.68 A74.67 59.73 54 1 1 372.61 416.51 Z M139.39 416.51 A74.67 59.73 126 1 1 227.16 295.68 A74.67 59.73 126 1 1 139.39 416.51 Z M67.31 194.69 A74.67 59.73 198 1 1 209.34 240.85 A74.67 59.73 198 1 1 67.31 194.69 Z M217.6 256 A38.4 38.4 0 1 1 294.4 256 A38.4 38.4 0 1 1 217.6 256 Z'

export function mark(size: number, cls?: string): string {
  return `<svg class="${cls || ''}" width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true"><path d="${MARK}" fill="currentColor"/></svg>`
}

export function patch(size: number): string {
  return `<span class="patch-wrap" aria-hidden="true"><span class="patch">${mark(size)}</span></span>`
}

export const STAR =
  'M12 2.4l2.95 5.98 6.6.96-4.77 4.65 1.12 6.57L12 17.47l-5.9 3.1 1.12-6.57L2.45 9.34l6.6-.96z'

let uid = 0
export function nextUid(): number {
  return ++uid
}

/* Geometric fill, never opacity: the fill is a clipPath cut at fill×24, and
   every cell carries a drawn outline so the empty part of a quarter or half
   star stays a visible shape on any ground. */
export function starSvg(fill: number, size: number, fillCol?: string, lineCol?: string): string {
  const id = 'clip' + ++uid
  const w = (Math.max(0, Math.min(1, fill)) * 24).toFixed(3)
  const f = fillCol || 'var(--star)'
  const l = lineCol || 'var(--star-line)'
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    ${fill > 0 ? `<clipPath id="${id}"><rect x="0" y="0" width="${w}" height="24"/></clipPath>
    <path d="${STAR}" fill="${f}" clip-path="url(#${id})"/>` : ''}
    <path d="${STAR}" fill="none" stroke="${l}" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`
}

export function starRowStatic(r: number, size: number, fillCol?: string, lineCol?: string): string {
  let out = ''
  for (let i = 0; i < 5; i++) out += starSvg(Math.max(0, Math.min(1, r - i)), size, fillCol, lineCol)
  return `<div class="stars" role="img" aria-label="${+r.toFixed(2)} out of 5">${out}</div>`
}

/* ── The gem clip — thin wire, small, plain light silver, near vertical.
      Rendered at 15×38 (of a 36×90 box) so the wire reads at under half a
      pixel-millimetre: delicate, like the reference, not a drawn cartoon.
      Straddles the top edge: the sheet edge lands around svg-y 30 → the
      default top of -13px leaves ~25px of clip on the card. ── */
export function pclip(x: number, y?: number | null, rot?: number): string {
  const gid = 'pg' + ++uid
  return `<svg class="pclip" style="left:${x}px;top:${y != null ? y : -13}px;transform:rotate(${rot || 0}deg)"
    width="15" height="38" viewBox="0 0 36 90" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#B3B8BE"/>
        <stop offset=".5" stop-color="#E3E6E9"/>
        <stop offset="1" stop-color="#BCC1C7"/>
      </linearGradient>
    </defs>
    <path d="M12.5 24 v40 a5.5 5.5 0 0 0 11 0 V15 a8.5 8.5 0 0 0 -17 0 v48 a11 11 0 0 0 22 0 V27"
      fill="none" stroke="url(#${gid})" stroke-width="2.6" stroke-linecap="round"
      style="filter:drop-shadow(0 .5px .5px rgba(27,25,23,.2))"/>
  </svg>`
}

export function staple(): string {
  const gid = 'st' + ++uid
  return `<svg class="s5-staple" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#D9D9D6"/><stop offset="1" stop-color="#8B8B87"/>
    </linearGradient></defs>
    <path d="M2 9 V3 A2 2 0 0 1 4 1 H22 A2 2 0 0 1 24 3 V9"
      fill="none" stroke="url(#${gid})" stroke-width="2.4"/>
  </svg>`
}

/* seeded plate line-art (demo data only — real plates are uploaded photos) */
export const ART: Record<string, string> = {
  spread: `<rect width="124" height="124" fill="#E8E2D6"/>
    <rect x="10" y="22" width="49" height="80" fill="#FBF9F5"/>
    <rect x="65" y="22" width="49" height="80" fill="#F2EDE3"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="16" y="${30 + i * 8}" width="37" height="2" fill="#C9C0AE"/><rect x="71" y="${30 + i * 8}" width="37" height="2" fill="#C9C0AE"/>`).join('')}`,
  shelf: `<rect width="124" height="124" fill="#DCD5C7"/>
    ${[['#C2410C', 18, 34], ['#DCA94C', 12, 52], ['#8F958C', 20, 44], ['#1B1917', 10, 66], ['#C2410C', 15, 40], ['#DCA94C', 22, 58]]
      .map((b, i) => `<rect x="${10 + i * 18}" y="${104 - (b[2] as number)}" width="${b[1]}" height="${b[2]}" fill="${b[0]}"/>`).join('')}
    <rect x="6" y="104" width="112" height="4" fill="#1B1917" opacity=".5"/>`,
  window: `<rect width="124" height="124" fill="#8F958C"/>
    <path d="M32 108V52a30 30 0 0 1 60 0v56z" fill="#F4F2ED"/>
    <path d="M62 24v84M32 66h60" stroke="#8F958C" stroke-width="4"/>
    <circle cx="86" cy="34" r="9" fill="#DCA94C"/>`,
}

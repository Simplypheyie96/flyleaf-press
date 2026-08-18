import { MARK } from '../cards/assets'

/* The rosette, for chrome. Same path the cards print from, but it inherits
   colour here — chrome is ink on paper, never terracotta. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" style={{ display: 'block' }}>
      <path d={MARK} fill="currentColor" />
    </svg>
  )
}

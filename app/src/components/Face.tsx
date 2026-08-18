/* The reader's face, beside the reader's name — the avatar system carried
   over from Flyleaf (mechanics only; the mount is Press chrome).

   DiceBear's `adventurer` set, drawn LOCALLY from the npm packages rather
   than fetched from api.dicebear.com: this app opens offline, and nothing
   about the reader leaves the device. What is stored is one short seed
   string in settings — same seed, same face, forever.

   Licence: the adventurer style is CC BY 4.0 by Lisa Wischofsky. The
   attribution lives on the Settings page; do not ship this without it. */

import { useMemo } from 'react'
import { Avatar as Rendered, Style } from '@dicebear/core'
import definition from '@dicebear/styles/adventurer.json'

/* Validating the definition costs a beat; pay it once, lazily. */
let sheet: Style<typeof definition> | undefined
function styleSheet() {
  sheet ??= new Style(definition)
  return sheet
}

/* Twelve faces, DRAWN NOT ROLLED: each specified part by part so the chooser
   has real range — four skin tones, short hair and long, a shaved head, a
   braid, glasses, freckles, silver hair as well as black. The name is a label
   for a slot, never a claim about the person in the picture. */
type Look = Record<string, unknown>

const LOOKS: Record<string, { note: string; look: Look }> = {
  Aneka: {
    note: 'black hair with a blunt fringe',
    look: { hairVariant: 'long07', hairColor: '#0e0e0e', skinColor: '#f2d3b1', eyesVariant: 'variant02', eyebrowsVariant: 'variant12', mouthVariant: 'variant02' },
  },
  Milo: {
    note: 'short dark hair',
    look: { hairVariant: 'short01', hairColor: '#0e0e0e', skinColor: '#763900', eyesVariant: 'variant24', eyebrowsVariant: 'variant10', mouthVariant: 'variant01' },
  },
  Sadie: {
    note: 'auburn waves and freckles',
    look: { hairVariant: 'long17', hairColor: '#562306', skinColor: '#ecad80', eyesVariant: 'variant02', eyebrowsVariant: 'variant09', mouthVariant: 'variant19', detailsVariant: 'freckles', detailsProbability: 100 },
  },
  Jude: {
    note: 'blond hair and round glasses',
    look: { hairVariant: 'short08', hairColor: '#b9a05f', skinColor: '#763900', eyesVariant: 'variant03', eyebrowsVariant: 'variant05', mouthVariant: 'variant27', glassesVariant: 'variant02', glassesProbability: 100 },
  },
  Nala: {
    note: 'dark hair in a bun',
    look: { hairVariant: 'long13', hairColor: '#0e0e0e', skinColor: '#763900', eyesVariant: 'variant26', eyebrowsVariant: 'variant12', mouthVariant: 'variant29' },
  },
  Kian: {
    note: 'short curls',
    look: { hairVariant: 'short03', hairColor: '#0e0e0e', skinColor: '#9e5622', eyesVariant: 'variant25', eyebrowsVariant: 'variant15', mouthVariant: 'variant01' },
  },
  Ivy: {
    note: 'a pale blue bob',
    look: { hairVariant: 'long21', hairColor: '#85c2c6', skinColor: '#f2d3b1', eyesVariant: 'variant26', eyebrowsVariant: 'variant09', mouthVariant: 'variant27' },
  },
  Odin: {
    note: 'a shaved head',
    look: { hairVariant: 'short19', hairColor: '#0e0e0e', skinColor: '#9e5622', eyesVariant: 'variant24', eyebrowsVariant: 'variant10', mouthVariant: 'variant01' },
  },
  Wren: {
    note: 'ginger hair and freckles',
    look: { hairVariant: 'short05', hairColor: '#cb6820', skinColor: '#f2d3b1', eyesVariant: 'variant25', eyebrowsVariant: 'variant09', mouthVariant: 'variant30', detailsVariant: 'freckles', detailsProbability: 100 },
  },
  Zuri: {
    note: 'plum buns and a small earring',
    look: { hairVariant: 'long23', hairColor: '#592454', skinColor: '#9e5622', eyesVariant: 'variant19', eyebrowsVariant: 'variant10', mouthVariant: 'variant28', earringsVariant: 'variant02', earringsProbability: 100 },
  },
  Bramble: {
    note: 'a top knot and closed eyes',
    look: { hairVariant: 'short12', hairColor: '#0e0e0e', skinColor: '#ecad80', eyesVariant: 'variant20', eyebrowsVariant: 'variant10', mouthVariant: 'variant29' },
  },
  Juniper: {
    note: 'a silver braid and glasses',
    look: { hairVariant: 'long16', hairColor: '#afafaf', skinColor: '#ecad80', eyesVariant: 'variant02', eyebrowsVariant: 'variant15', mouthVariant: 'variant02', glassesVariant: 'variant04', glassesProbability: 100 },
  },
}

export const FACES = Object.keys(LOOKS)

/* Off unless a face asks for them — a face specified down to the eyebrow
   should not roll dice for jewellery on a package update. */
const BARE = { glassesProbability: 0, earringsProbability: 0, detailsProbability: 0 }

const cache = new Map<string, string>()

function faceUri(seed: string): string {
  const hit = cache.get(seed)
  if (hit) return hit
  const uri = new Rendered(styleSheet(), {
    seed,
    ...BARE,
    ...LOOKS[seed]?.look,
    scale: 1.1,
    translateY: 5,
  }).toDataUri()
  cache.set(seed, uri)
  return uri
}

/** One face on its paper disc. Decorative — the name sits right beside it. */
export function Face({ seed, size = 40 }: { seed: string; size?: number }) {
  const uri = useMemo(() => faceUri(seed), [seed])
  return (
    <span className="face" style={{ width: size, height: size }}>
      <img src={uri} alt="" width={size} height={size} draggable={false} />
    </span>
  )
}

/* A radio group, not twelve buttons. Pressing the chosen face again puts it
   back to none — the face is optional, and Home reads fine without one. */
export function FacePicker({
  value,
  onPick,
  label,
}: {
  value: string
  onPick: (seed: string) => void
  label: string
}) {
  return (
    <div className="face-picker" role="radiogroup" aria-label={label}>
      {FACES.map((seed, i) => {
        const on = value === seed
        return (
          <button
            key={seed}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Face ${i + 1} of ${FACES.length}: ${LOOKS[seed].note}`}
            onClick={() => onPick(on ? '' : seed)}
          >
            <Face seed={seed} size={52} />
          </button>
        )
      })}
    </div>
  )
}

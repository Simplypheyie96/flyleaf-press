#!/usr/bin/env python3
"""Draw the three missing glyphs INTO Handwritten Notes, in its own hand.

    uv run --with fonttools --with brotli python scripts/patch-handwritten-notes.py

Handwritten Notes is the owner's own face and it shipped with 179 glyphs and
three holes that review prose falls into constantly: em dash (U+2014), en dash
(U+2013) and ellipsis (U+2026). A missing glyph is drawn by the next family in
the CSS stack, so a review written in this hand had Kalam's dashes in the middle
of its sentences — right to the pixel, and still another person's handwriting.

The method is the one the Xteink font pipeline uses for the same problem
(`--fallback-regular`, which bakes glyphs the primary face lacks into the output
because an e-ink .cpfont has no font stack to fall through to). What is baked in
here is not another face's shapes, though — it is THIS face's own:

  · the dashes are the font's own HYPHEN, stretched along x only, so the stroke
    keeps its thickness, its slope and its wobble and simply runs longer;
  · the ellipsis is a composite of three of the font's own PERIODS.

The proportions are the average of what Kalam and Shantell Sans — the two hands
that ship beside this one — do relative to their own hyphen and period, rather
than a fraction of the em: this face is about 18% narrower than Kalam overall,
so an em-relative dash would have been too long for its own letters.

    hyphen  adv 323, ink 218 wide   ->  emdash adv 660, ink 500
                                        endash adv 450, ink 320
    period  adv 183, ink  78 wide   ->  ellipsis: 3 periods, 183 apart

Idempotent: run it on an already-patched file and it says so and stops. It reads
and writes app/src/fonts/handwritten-notes-400-normal.woff2 in place.
"""

from __future__ import annotations
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.misc.transform import Transform

FONT = Path(__file__).resolve().parent.parent / 'src' / 'fonts' / 'handwritten-notes-400-normal.woff2'

# what each new glyph is built from, and the box its ink has to land in
DASHES = {
    #  name      from      advance  ink width
    'emdash':  ('hyphen',  660,     500),
    'endash':  ('hyphen',  450,     320),
}
ELLIPSIS_STEP_FROM = 'period'   # the dots are spaced one period-advance apart
CODEPOINTS = {'emdash': 0x2014, 'endash': 0x2013, 'ellipsis': 0x2026}


def ink_bounds(font, name):
    pen = BoundsPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    return pen.bounds


def stretched(font, src_name, adv, ink_w):
    """The source glyph scaled along x alone, its ink centred in `adv`."""
    x0, _, x1, _ = ink_bounds(font, src_name)
    sx = ink_w / (x1 - x0)
    left = (adv - ink_w) / 2
    # scale about the origin, then slide the ink's left edge onto `left`
    t = Transform().translate(left - x0 * sx, 0).scale(sx, 1)
    rec = RecordingPen()
    font.getGlyphSet()[src_name].draw(rec)
    pen = TTGlyphPen(None)
    rec.replay(TransformPen(pen, t))
    return pen.glyph()


def main() -> int:
    font = TTFont(FONT)
    cmap = font.getBestCmap()

    already = [n for n, cp in CODEPOINTS.items() if cp in cmap]
    if already:
        print(f'{FONT.name}: already carries {", ".join(already)} — nothing to do.')
        return 0

    for src in ('hyphen', 'period'):
        if src not in font.getGlyphOrder():
            print(f'{FONT.name}: no `{src}` to build from.', file=sys.stderr)
            return 1

    glyf, hmtx = font['glyf'], font['hmtx']

    for name, (src, adv, ink_w) in DASHES.items():
        glyf[name] = stretched(font, src, adv, ink_w)
        hmtx[name] = (adv, int(round((adv - ink_w) / 2)))

    # the ellipsis is three of the font's own periods, one advance apart
    step = hmtx[ELLIPSIS_STEP_FROM][0]
    px0, _, px1, _ = ink_bounds(font, ELLIPSIS_STEP_FROM)
    pen = TTGlyphPen({ELLIPSIS_STEP_FROM: font.getGlyphSet()[ELLIPSIS_STEP_FROM]})
    for i in range(3):
        pen.addComponent(ELLIPSIS_STEP_FROM, Transform().translate(i * step, 0))
    glyf['ellipsis'] = pen.glyph()
    # centred the way the period is: the same bearing left and right
    hmtx['ellipsis'] = (int(round(px1 + 2 * step + px0)), int(round(px0)))

    # glyf appended the three to ITS OWN copy of the order as they were assigned,
    # and it asserts that copy is the same length as its glyph dict before it will
    # compile — so the font's order is taken from glyf's rather than built beside
    # it. maxp recalcs numGlyphs and the component limits off glyf on its own.
    order = list(glyf.glyphOrder)
    font.setGlyphOrder(order)

    for sub in font['cmap'].tables:
        if sub.isUnicode():
            for name, cp in CODEPOINTS.items():
                sub.cmap[cp] = name

    # General Punctuation, which is where all three live
    font['OS/2'].ulUnicodeRange1 |= 1 << 31

    font.flavor = 'woff2'
    font.save(FONT)
    print(f'{FONT.name}: added {", ".join(CODEPOINTS)} — {len(order)} glyphs, {FONT.stat().st_size} bytes.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

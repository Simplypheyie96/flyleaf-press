/* A PNG writer that never allocates a canvas the size of the image.

   The reason this exists: a review is one image however long it is, and a
   canvas has two ceilings a browser enforces by silently handing back
   something smaller — about 16.7 million pixels of area (WebKit's; the file
   has to survive being made on a phone) and 16384 on a side. Past those the
   only lever the old code had was the pixel ratio, so a long review came out
   soft. That is backwards: the ceiling is on the *canvas*, not on the PNG
   format, which addresses 2^31 in each direction.

   So the picture is rasterized in horizontal bands, each band its own canvas
   well inside both limits, and the bands are fed here as they are made. A PNG
   is a zlib stream of scanlines top to bottom, which means it can be written
   in one pass without the whole image ever being resident as pixels: each
   band's rows go into the deflater and the band is dropped.

   Deflate comes from CompressionStream, which is the browser's own zlib —
   Chrome 80, Safari 16.4. `encodePng` reports whether it is there so the
   caller can keep the single-canvas path as a fallback rather than failing. */

export const CAN_STREAM_PNG = typeof CompressionStream !== 'undefined'

const CRC_TABLE = /* @__PURE__ */ (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** length · type · data · crc(type+data), which is every chunk in the format */
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(12 + data.length))
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** A band of the finished image: full width, any height, in document order. */
export interface Band {
  /** RGBA, as ImageData gives it — 4 bytes per pixel, row-major */
  data: Uint8ClampedArray
  width: number
  height: number
}

/* Colour type 2 is RGB with no alpha. The export always paints an opaque
   ground first, so the alpha channel is a constant 255 — a quarter of the
   bytes, carrying nothing, and deflate has to be shown that before it can
   discard it. Dropping the channel outright is both smaller and faster.

   Filter 2 (Up) predicts each byte from the one above it, which on a printed
   card is mostly flat paper and therefore mostly zeroes. Filter 0 would work
   and is a line shorter; it costs roughly a third more file on a long
   review, which is exactly the review that can least afford it. */
const BYTES = 3
const FILTER_UP = 2

export async function encodePng(
  width: number,
  height: number,
  bands: AsyncIterable<Band>
): Promise<Blob> {
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()

  /* Drained concurrently with the writes. The compressed stream is small —
     megabytes against the tens of megabytes of raw pixels going in — so it
     is safe to hold, and it has to be held: an IDAT chunk needs its own
     length and CRC, neither of which is known until the stream ends. */
  const parts: Uint8Array[] = []
  let idatLen = 0
  const drain = (async () => {
    const reader = cs.readable.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      idatLen += value.length
    }
  })()

  const stride = 1 + width * BYTES
  /* the previous row, unfiltered — Up predicts from the raw byte above, not
     from the filtered one, and reconstructing against the wrong one is the
     classic way to write a file that decodes to noise. It is carried across
     band boundaries too, so a seam is an ordinary row rather than the only
     full-cost row in the file. */
  let prev = new Uint8Array(width * BYTES)
  let cur = new Uint8Array(width * BYTES)
  let rows = 0

  for await (const band of bands) {
    const raw = band.data
    const h = Math.min(band.height, height - rows)
    if (h <= 0) break
    const buf = new Uint8Array(stride * h)
    for (let y = 0; y < h; y++) {
      let q = y * band.width * 4
      for (let i = 0; i < width * BYTES; i += BYTES) {
        cur[i] = raw[q]
        cur[i + 1] = raw[q + 1]
        cur[i + 2] = raw[q + 2]
        q += 4
      }
      const o = y * stride
      buf[o] = FILTER_UP
      for (let i = 0; i < width * BYTES; i++) buf[o + 1 + i] = (cur[i] - prev[i]) & 0xff
      const swap = prev
      prev = cur
      cur = swap
    }
    await writer.write(buf)
    rows += h
  }
  await writer.close()
  await drain

  const idat = new Uint8Array(idatLen)
  let at = 0
  for (const p of parts) { idat.set(p, at); at += p.length }

  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, width)
  dv.setUint32(4, height)
  ihdr[8] = 8            // bit depth
  ihdr[9] = 2            // colour type: truecolour, no alpha
  ihdr[10] = 0           // compression: deflate
  ihdr[11] = 0           // filter method: adaptive, per scanline
  ihdr[12] = 0           // interlace: none

  return new Blob(
    [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', idat),
      chunk('IEND', new Uint8Array(0)),
    ],
    { type: 'image/png' }
  )
}

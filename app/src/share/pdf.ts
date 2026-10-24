/* The smallest PDF that holds pictures: one JPEG per page, each page sized to
   its image at 72 dpi-equivalent of the 720px leaf. Only the store apps use
   it — a webview has no print dialog, so "Save as PDF" there has to be a file
   made here and handed to the share sheet. The web keeps window.print(). */

const enc = new TextEncoder()

async function jpeg(png: Blob): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const bmp = await createImageBitmap(png)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const g = c.getContext('2d')!
  /* JPEG has no alpha: paper under the card, not black */
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0)
  const b = await new Promise<Blob>((ok, no) =>
    c.toBlob((b) => (b ? ok(b) : no(new Error('canvas would not encode'))), 'image/jpeg', 0.9))
  return { bytes: new Uint8Array(await b.arrayBuffer()), w: bmp.width, h: bmp.height }
}

export async function pngsToPdf(pngs: Blob[]): Promise<Blob> {
  const imgs = []
  for (const p of pngs) imgs.push(await jpeg(p))
  /* objects: 1 catalog, 2 pages, then per page: page, content, image */
  const parts: (string | Uint8Array)[] = []
  const offsets: number[] = []
  let len = 0
  const push = (x: string | Uint8Array) => {
    parts.push(x)
    len += typeof x === 'string' ? enc.encode(x).length : x.length
  }
  const obj = (n: number, body: string | (string | Uint8Array)[]) => {
    offsets[n] = len
    push(`${n} 0 obj\n`)
    for (const b of Array.isArray(body) ? body : [body]) push(b)
    push('\nendobj\n')
  }
  push('%PDF-1.4\n')
  const kids = imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${imgs.length} >>`)
  imgs.forEach((im, i) => {
    const n = 3 + i * 3
    /* the leaf is drawn at 2x; half that in points keeps a 720px leaf A4-ish */
    const w = (im.w / 2).toFixed(2)
    const h = (im.h / 2).toFixed(2)
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im Do Q`
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    obj(n + 1, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
    obj(n + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`,
      im.bytes,
      '\nendstream',
    ])
  })
  const xref = len
  const count = 3 + imgs.length * 3
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  push(`${table}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}

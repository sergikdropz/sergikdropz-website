/**
 * Read and rewrite the simple text PDFs Department Mail attaches.
 * The desk edits the words, then stores a new PDF on the draft.
 */

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const TOP = 742
const BOTTOM = 72
const FOOTER_RE = /^SERGIK Studio paperwork\s+\d+\s*\/\s*\d+$/

function ascii(value: string): string {
  return value
    .replace(/\u2018|\u2019|\u2032/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014|\u00B7/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
}

function pdfLiteral(value: string): string {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function unescapePdfLiteral(value: string): string {
  return value.replace(/\\([\\()])/g, '$1')
}

export function extractPdfText(bytes: Uint8Array): string {
  const source = new TextDecoder('latin1').decode(bytes)
  const lines: string[] = []
  const pattern = /\((?:\\.|[^\\)])*\)\s*Tj/g
  for (const match of source.matchAll(pattern)) {
    const raw = match[0].slice(1, match[0].lastIndexOf(')'))
    const text = unescapePdfLiteral(raw)
    if (FOOTER_RE.test(text.trim())) continue
    lines.push(text)
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function wrapLine(text: string): string[] {
  const maxChars = 92
  const source = ascii(text).replace(/\t/g, '  ')
  if (!source.trim()) return ['']
  const out: string[] = []
  let rest = source
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars)
    if (cut < 24) cut = maxChars
    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  out.push(rest)
  return out
}

function pageStream(lines: string[], pageNumber: number, pageCount: number): string {
  const commands = ['BT', `1 0 0 1 ${MARGIN} ${TOP} Tm`, '/F1 11 Tf']
  lines.forEach((line, index) => {
    if (index > 0) commands.push('0 -14 Td')
    commands.push(`(${pdfLiteral(line)}) Tj`)
  })
  commands.push('ET')
  commands.push('BT')
  commands.push('/F1 8 Tf')
  commands.push(`1 0 0 1 ${MARGIN} 40 Tm`)
  commands.push(`(${pdfLiteral(`SERGIK Studio paperwork   ${pageNumber} / ${pageCount}`)}) Tj`)
  commands.push('ET')
  return commands.join('\n')
}

function pdfDocument(objectBodies: string[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')]
  const offsets = [0]
  let cursor = chunks[0].length
  objectBodies.forEach((body, index) => {
    offsets.push(cursor)
    const piece = encoder.encode(`${index + 1} 0 obj\n${body}\nendobj\n`)
    chunks.push(piece)
    cursor += piece.length
  })
  let xref = `xref\n0 ${objectBodies.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`
  chunks.push(encoder.encode(xref))
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export function buildTextPdf(text: string): Uint8Array {
  const lines = (text.trim() ? text : ' ').split(/\r?\n/).flatMap((line) => wrapLine(line))
  const capacity = Math.floor((TOP - BOTTOM) / 14)
  const pages: string[][] = []
  for (let index = 0; index < lines.length; index += capacity) pages.push(lines.slice(index, index + capacity))
  if (!pages.length) pages.push([' '])
  const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const kids: string[] = []
  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2
    const streamId = pageId + 1
    kids.push(`${pageId} 0 R`)
    const stream = pageStream(pageLines, index + 1, pages.length)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${streamId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`)
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`
  return pdfDocument(objects)
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

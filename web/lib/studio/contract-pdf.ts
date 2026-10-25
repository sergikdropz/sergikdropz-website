import { composeMailBody, parseMailMessage } from '@/lib/email/promo-assets'
import type { RightsPacketKind } from '@/lib/studio/rights-packets'
import { studioReleaseHref } from '@/lib/studio/studio-ia'
import { siteOrigin } from '@/lib/shares/types'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const TOP = 742
const BOTTOM = 72

const KIND_LABEL: Record<RightsPacketKind, string> = {
  split_sheet: 'Split sheet',
  producer_agreement: 'Producer agreement',
  collab_agreement: 'Collaboration agreement',
}

const RELEASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/

type DrawLine = { text: string; size: number; bold: boolean; leading: number }

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function contractKindLabel(kind: RightsPacketKind): string {
  return KIND_LABEL[kind]
}

export function contractPdfFilename(label: string, releaseTitle: string): string {
  const slug = `${clean(label)} ${clean(releaseTitle)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${slug || 'contract'}.pdf`
}

function safeReleaseId(releaseId: string): string | null {
  const id = clean(releaseId)
  return RELEASE_ID_RE.test(id) ? id : null
}

export function contractPdfHref(releaseId: string, kind: RightsPacketKind): string | null {
  const id = safeReleaseId(releaseId)
  if (!id) return null
  return `/api/studio/releases/${id}/contracts/pdf?kind=${kind}`
}

export function contractStudioUrl(releaseId: string): string | null {
  const id = safeReleaseId(releaseId)
  if (!id) return null
  return `${siteOrigin().replace(/\/$/, '')}${studioReleaseHref(id, 'rights')}`
}

export function contractKindFromSubject(subject: string): RightsPacketKind | null {
  const text = clean(subject).replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
  if (/^split sheet\b/i.test(text)) return 'split_sheet'
  if (/^producer agreement\b/i.test(text)) return 'producer_agreement'
  if (/^(collaboration|collab) agreement\b/i.test(text)) return 'collab_agreement'
  return null
}

export function releaseTitleFromContractSubject(subject: string): string {
  const text = clean(subject).replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
  const parts = text.split(/\s+[—–-]\s+/)
  if (parts.length < 2) return ''
  return parts.slice(1).join(' - ').replace(/\s+for signing$/i, '').trim()
}

function deskLink(url: string | null, label: string, prose: string): string {
  if (!url) return prose
  return composeMailBody(prose, [{ kind: 'link', url, label }])
}

export const CONTRACT_DRAFT_REVIEW =
  'Review this draft in Department Mail before it goes out. Sending emails the attached PDF and starts DocuSign for the same file.'

/** Collaborator email, held as a Department Mail draft until someone sends it. */
export function contractComposeBody(input: {
  packetLabel: string
  releaseTitle: string
  albumArtist?: string | null
  partyNames: string
  pdfFilename: string
  packetText: string
  studioUrl: string | null
}): string {
  const title = clean(input.releaseTitle) || 'this release'
  const artist = clean(input.albumArtist) || 'SERGIK'
  const who = clean(input.partyNames) || 'there'
  const label = clean(input.packetLabel) || 'contract'
  const file = clean(input.pdfFilename) || 'the contract PDF'
  const prose = [
    CONTRACT_DRAFT_REVIEW,
    '',
    `Hi ${who} — please review the ${label.toLowerCase()} for ${title} (${artist}).`,
    `Download the attached PDF (${file}).`,
    'DocuSign is included: use the DocuSign email sent to this address to sign that same PDF.',
    '',
    clean(input.packetText),
    '',
    'First-party SERGIK Studio paperwork — not a DistroKid add-on. If you were not expecting this, ignore the message.',
  ].join('\n')
  return deskLink(input.studioUrl, 'Open contract in Studio', prose).slice(0, 20000)
}

export function contractReleaseIdFromDraft(body: string): string | null {
  const { blocks } = parseMailMessage(body)
  for (const block of blocks) {
    if (block.kind !== 'link') continue
    const match = block.url.match(/\/studio\/releases\/([A-Za-z0-9][A-Za-z0-9_-]{0,120})/)
    if (match?.[1] && RELEASE_ID_RE.test(match[1])) return match[1]
  }
  return null
}

/** Drop the review note and the Studio link before the message leaves the building. */
export function contractBodyForSending(body: string): string {
  const { prose, blocks } = parseMailMessage(body)
  const kept = blocks.filter((block) => block.kind !== 'link' || !/\/studio\/releases\//.test(block.url))
  const cleaned = prose.startsWith(CONTRACT_DRAFT_REVIEW)
    ? prose.slice(CONTRACT_DRAFT_REVIEW.length).trim()
    : prose
  return composeMailBody(cleaned, kept).slice(0, 20000)
}

export function contractOutboundDeskBody(input: {
  packetLabel: string
  releaseTitle: string
  recipients: string[]
  packetText: string
  studioUrl: string | null
  docusignIncluded?: boolean
}): string {
  const who = input.recipients.filter(Boolean).join(', ') || 'the collaborator'
  const prose = [
    `${input.packetLabel} for ${input.releaseTitle || 'this release'} was emailed to ${who}.`,
    'The PDF attached here is the download copy that went out for signing.',
    input.docusignIncluded
      ? 'DocuSign was included with this send. Signers also get a DocuSign email for the same PDF.'
      : 'DocuSign was not included. Replies come back to the Release Studio inbox.',
    '',
    clean(input.packetText),
  ].join('\n')
  return deskLink(input.studioUrl, 'Open contract in Studio', prose).slice(0, 20000)
}

export function contractInboundDeskBody(input: {
  fromName: string
  fromEmail: string
  replyText: string
  studioUrl: string | null
}): string {
  const who = clean(input.fromName) || clean(input.fromEmail) || 'Collaborator'
  const prose = [
    `Reply from ${who}${input.fromEmail ? ` <${input.fromEmail}>` : ''} on the contract thread.`,
    '',
    clean(input.replyText) || 'This reply arrived without a text body.',
  ].join('\n')
  return deskLink(input.studioUrl, 'Open contract in Studio', prose).slice(0, 20000)
}

function pdfText(value: string): string {
  const ascii = value
    .replace(/\u2018|\u2019|\u2032/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014|\u00B7/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrapLine(text: string, size: number): string[] {
  const maxChars = Math.max(24, Math.floor((PAGE_W - MARGIN * 2) / (size * 0.52)))
  const source = text.replace(/\t/g, '  ')
  if (!source.trim()) return ['']
  const out: string[] = []
  let rest = source
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars)
    if (cut < 8) cut = maxChars
    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  out.push(rest)
  return out
}

function bodyLines(text: string): DrawLine[] {
  const lines: DrawLine[] = []
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const wrapped = wrapLine(raw, 10)
    wrapped.forEach((line, index) => {
      lines.push({
        text: line || ' ',
        size: 10,
        bold: false,
        leading: index === 0 && !raw.trim() ? 8 : 13,
      })
    })
  }
  return lines
}

function headerLines(input: { title: string; releaseTitle: string; albumArtist?: string | null }): DrawLine[] {
  const artist = clean(input.albumArtist)
  return [
    { text: 'SERGIK Studio - Rights', size: 9, bold: false, leading: 0 },
    { text: clean(input.title) || 'Contract', size: 16, bold: true, leading: 22 },
    {
      text: [clean(input.releaseTitle) || 'Untitled release', artist].filter(Boolean).join(' - '),
      size: 10,
      bold: false,
      leading: 16,
    },
    { text: ' ', size: 10, bold: false, leading: 16 },
  ]
}

function paginate(header: DrawLine[], body: DrawLine[]): DrawLine[][] {
  const pages: DrawLine[][] = []
  let page: DrawLine[] = []
  let y = TOP
  const push = (line: DrawLine) => {
    const drop = page.length === 0 ? 0 : line.leading
    if (page.length > 0 && y - drop < BOTTOM) {
      pages.push(page)
      page = [...header]
      y = TOP
      for (const head of header) y -= head.leading || 14
    }
    page.push(line)
    y -= drop || 14
  }
  for (const line of header) push(line)
  for (const line of body) push(line)
  if (page.length) pages.push(page)
  return pages.length ? pages : [[...header]]
}

function pageStream(lines: DrawLine[], pageNumber: number, pageCount: number): string {
  const commands = ['BT', `1 0 0 1 ${MARGIN} ${TOP} Tm`]
  lines.forEach((line, index) => {
    const font = line.bold ? 'F2' : 'F1'
    if (index > 0) commands.push(`0 -${line.leading || 13} Td`)
    commands.push(`/${font} ${line.size} Tf`)
    commands.push(`(${pdfText(line.text)}) Tj`)
  })
  commands.push('ET')
  commands.push('BT')
  commands.push('/F1 8 Tf')
  commands.push(`1 0 0 1 ${MARGIN} 40 Tm`)
  commands.push(`(${pdfText(`SERGIK Studio paperwork   ${pageNumber} / ${pageCount}`)}) Tj`)
  commands.push('ET')
  return commands.join('\n')
}

function pdfDocument(objectBodies: string[]): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'ascii')]
  const offsets = [0]
  let cursor = chunks[0].length
  objectBodies.forEach((body, index) => {
    offsets.push(cursor)
    const piece = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, 'ascii')
    chunks.push(piece)
    cursor += piece.length
  })
  let xref = `xref\n0 ${objectBodies.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`
  chunks.push(Buffer.from(xref, 'ascii'))
  return Buffer.concat(chunks)
}

export function buildContractPdf(input: {
  title: string
  releaseTitle: string
  albumArtist?: string | null
  body: string
}): Buffer {
  const header = headerLines(input)
  const pages = paginate(header, bodyLines(clean(input.body) || ' '))
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]
  const kids: string[] = []
  pages.forEach((lines, index) => {
    const pageId = 5 + index * 2
    const streamId = pageId + 1
    kids.push(`${pageId} 0 R`)
    const stream = pageStream(lines, index + 1, pages.length)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${streamId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
    )
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`)
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`
  return pdfDocument(objects)
}

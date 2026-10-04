import { escapeHtml } from '@/lib/studio/release-collab'

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function collabProjectSubjectPrefix(releaseTitle: string): string {
  const title = clean(releaseTitle) || 'Release'
  return `[SERGIK · ${title}]`
}

/** Gmail-friendly subject with stable project prefix for threading. */
export function collabHubEmailSubject(releaseTitle: string, customSubject: string): string {
  const sub = clean(customSubject) || 'Collaboration update'
  if (/^\[SERGIK\s·/i.test(sub)) return sub
  return `${collabProjectSubjectPrefix(releaseTitle)} ${sub}`
}

export function collabHubEmailHtml(opts: {
  recipientName: string
  releaseTitle: string
  authorName: string
  body: string
  extraHtml?: string
}): string {
  const preview = escapeHtml(opts.body).replace(/\n/g, '<br/>')
  const extra = opts.extraHtml ? `<div style="margin-top:20px">${opts.extraHtml}</div>` : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e4e4e7">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#a78bfa">SERGIK Release Studio</p>
    <p style="margin:0 0 16px;font-size:15px">Hi ${escapeHtml(opts.recipientName || 'there')},</p>
    <div style="font-size:15px;line-height:1.6;color:#d4d4d8">${preview}</div>
    ${extra}
    <p style="margin-top:28px;font-size:12px;color:#71717a">Reply in Gmail — your message returns to the SERGIK collab hub for this project.</p>
  </div>
</body></html>`
}

export function collabPromoExtraHtml(lines: Array<{ label: string; url: string }>): string {
  if (!lines.length) return ''
  const items = lines
    .map(
      (row) =>
        `<p style="margin:8px 0"><strong>${escapeHtml(row.label)}</strong><br/><a href="${escapeHtml(row.url)}" style="color:#a78bfa">${escapeHtml(row.url)}</a></p>`,
    )
    .join('')
  return `<p style="font-size:13px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.12em">Links</p>${items}`
}

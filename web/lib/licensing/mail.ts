import { LICENSING_LICENSOR } from '@/lib/licensing/identity'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function licensingInquiryMail(input: { publicId: string; name: string; confirmUrl: string }) {
  const safeName = escapeHtml(input.name)
  const safeId = escapeHtml(input.publicId)
  const safeUrl = escapeHtml(input.confirmUrl)
  const text = [
    `Hello ${input.name},`,
    '',
    `We received licensing inquiry ${input.publicId}.`,
    'Submitting this inquiry does not give you permission to use the music.',
    `Confirm your email: ${input.confirmUrl}`,
    '',
    LICENSING_LICENSOR.tradeName,
  ].join('\n')
  const html = `<p>Hello ${safeName},</p><p>We received licensing inquiry <strong>${safeId}</strong>.</p><p>Submitting this inquiry does not give you permission to use the music.</p><p><a href="${safeUrl}">Confirm your email</a></p>`
  return { subject: `SERGIK licensing inquiry ${input.publicId}`, text, html }
}

export function licensingQuoteMail(input: { publicId: string; deskUrl: string; feeLabel: string; estimate?: boolean }) {
  const link = /^https?:\/\//i.test(input.deskUrl)
    ? `<p><a href="${escapeHtml(input.deskUrl)}">Review the quote</a></p>`
    : `<p>${escapeHtml(input.deskUrl)}</p>`
  const estimateLine = input.estimate
    ? 'This amount is a custom-production estimate, not a license to use an existing recording.'
    : ''
  const text = [
    `A quote is ready for ${input.publicId}.`,
    `Fee: ${input.feeLabel}`,
    estimateLine,
    'This quote is not permission to use the music.',
    input.deskUrl,
  ]
    .filter(Boolean)
    .join('\n')
  const estimateHtml = estimateLine ? `<p>${escapeHtml(estimateLine)}</p>` : ''
  const html = `<p>A quote is ready for <strong>${escapeHtml(input.publicId)}</strong>.</p><p>Fee: ${escapeHtml(input.feeLabel)}</p>${estimateHtml}<p>This quote is not permission to use the music.</p>${link}`
  return { subject: `Quote ready for ${input.publicId}`, text, html }
}

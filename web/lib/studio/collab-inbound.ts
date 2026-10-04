/** Per-release Reply-To / inbound routing for Release Collab (Resend Inbound). */

const LOCAL_PREFIX = 'r.'

export function collabInboundDomain(): string {
  return (
    process.env.RELEASE_COLLAB_INBOUND_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_RELEASE_COLLAB_INBOUND_DOMAIN?.trim() ||
    'collab.sergikdropz.com'
  )
}

export function collabInboundLocalPart(releaseId: string): string {
  const id = String(releaseId || '').trim()
  return `${LOCAL_PREFIX}${Buffer.from(id, 'utf8').toString('base64url')}`
}

export function collabReplyToAddress(releaseId: string): string {
  return `${collabInboundLocalPart(releaseId)}@${collabInboundDomain()}`
}

export function parseReleaseIdFromInboundAddress(raw: string): string | null {
  const text = String(raw || '').trim()
  const lt = text.indexOf('<')
  const gt = text.indexOf('>')
  const bare =
    lt >= 0 && gt > lt
      ? text.slice(lt + 1, gt).trim()
      : text.replace(/^mailto:/i, '').trim()
  const at = bare.lastIndexOf('@')
  if (at < 1) return null
  const local = bare.slice(0, at)
  const domain = bare.slice(at + 1).toLowerCase()
  const fromDomain = (process.env.RELEASE_COLLAB_FROM_EMAIL || 'release.studio@sergikdropz.com')
    .split('@')[1]
    ?.toLowerCase()

  let encoded: string | null = null
  if (domain === collabInboundDomain().toLowerCase() && local.startsWith(LOCAL_PREFIX)) {
    encoded = local.slice(LOCAL_PREFIX.length)
  } else if (fromDomain && domain === fromDomain && local.includes('+')) {
    const plus = local.indexOf('+')
    encoded = local.slice(plus + 1)
    if (!encoded) return null
  } else {
    return null
  }
  if (!encoded || encoded.length > 200) return null
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const releaseId = Buffer.from(encoded, 'base64url').toString('utf8').trim()
    return releaseId || null
  } catch {
    return null
  }
}

export function parseReleaseIdFromInboundRecipients(recipients: unknown): string | null {
  const list = Array.isArray(recipients)
    ? recipients
    : recipients
      ? [recipients]
      : []
  for (const item of list) {
    const id = parseReleaseIdFromInboundAddress(String(item))
    if (id) return id
  }
  return null
}

export function stripInboundReplyBody(text: string): string {
  let body = String(text || '').trim()
  if (!body) return ''
  const markers = [
    /^On .+ wrote:\s*$/m,
    /^-{2,}\s*Original Message\s*-{2,}/im,
    /^From:\s.+$/im,
    /^_{3,}$/m,
  ]
  for (const re of markers) {
    const match = body.match(re)
    if (match && match.index != null && match.index > 0) {
      body = body.slice(0, match.index).trim()
    }
  }
  return body.slice(0, 20_000)
}

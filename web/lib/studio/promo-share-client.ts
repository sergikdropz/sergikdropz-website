'use client'

export type CopiedPromoLink = {
  url: string
  path: string
  copied: boolean
  plan: unknown
  summary: unknown
}

/** Mint or reuse the collaborator promo URL and copy it. */
export async function copySocialPromoCollaboratorLink(input: {
  releaseId?: string
  folderId?: string
}): Promise<CopiedPromoLink> {
  const res = await fetch('/api/studio/social-promo/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      releaseId: input.releaseId || undefined,
      folderId: input.folderId || undefined,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : 'Could not create the collaborator link',
    )
  }
  const path = typeof data.path === 'string' ? data.path : ''
  if (!path) throw new Error('Could not create the collaborator link')
  const url = `${window.location.origin}${path}`
  let copied = false
  try {
    await navigator.clipboard.writeText(url)
    copied = true
  } catch {
    copied = false
  }
  return { url, path, copied, plan: data.plan, summary: data.summary }
}

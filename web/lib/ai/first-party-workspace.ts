/**
 * Release Studio and admin live in the signed-in page beside the chat.
 * The side Chromium profile has no admin cookie, so those URLs become Admin Login.
 */

const FIRST_PARTY_HOSTS = new Set([
  'sergikdropz.com',
  'www.sergikdropz.com',
  'sergik.com',
  'www.sergik.com',
  'localhost',
  '127.0.0.1',
])

const STUDIO_STEPS = ['catalog', 'metadata', 'rights', 'copy', 'delivery', 'launch'] as const

export type StudioPageStep = (typeof STUDIO_STEPS)[number]

export type FirstPartyWorkspace = {
  href: string
  releaseId: string | null
  step: StudioPageStep | null
  message: string
}

function asStudioStep(value: string | null): StudioPageStep | null {
  if (!value) return null
  return (STUDIO_STEPS as readonly string[]).includes(value) ? (value as StudioPageStep) : null
}

export function firstPartyWorkspaceFromUrl(raw: string | null | undefined): FirstPartyWorkspace | null {
  if (!raw?.trim()) return null
  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (!FIRST_PARTY_HOSTS.has(host)) return null
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const isAdmin = path === '/admin' || path.startsWith('/admin/')
  const isStudio = path === '/studio' || path.startsWith('/studio/')
  if (!isAdmin && !isStudio) return null

  const releaseMatch = path.match(/\/studio\/releases\/([^/]+)/)
  const releaseId = releaseMatch ? decodeURIComponent(releaseMatch[1]) : null
  const step = asStudioStep(url.searchParams.get('step'))
  const where = step ? ` Open step ${step}.` : ''
  const message = releaseId
    ? `Use the Release Studio page already open beside the chat for ${releaseId}.${where} The side browser is not signed in. Do not open admin or studio there. Read and write this release with the studio tools.`
    : 'Use the signed-in admin page already open beside the chat. The side browser has no admin session and only shows Admin Login. Do not open /admin or /studio in Chromium.'

  return { href: url.toString(), releaseId, step, message }
}

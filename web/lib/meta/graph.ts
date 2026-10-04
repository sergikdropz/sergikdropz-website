const GRAPH_VERSION = 'v21.0'
const GRAPH_ORIGIN = `https://graph.facebook.com/${GRAPH_VERSION}`

export const META_PUBLISH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
] as const

export class MetaGraphError extends Error {
  status: number
  code?: number

  constructor(message: string, status = 400, code?: number) {
    super(message)
    this.name = 'MetaGraphError'
    this.status = status
    this.code = code
  }
}

type GraphErrorBody = {
  error?: { message?: string; code?: number; type?: string }
}

function errorFrom(status: number, body: GraphErrorBody): MetaGraphError {
  const message = body.error?.message || `Meta Graph request failed (${status})`
  return new MetaGraphError(message, status, body.error?.code)
}

export function metaAppCredentials(): { id: string; secret: string } | null {
  const id = (
    process.env.META_APP_ID ||
    process.env.FACEBOOK_APP_ID ||
    process.env.INSTAGRAM_APP_ID ||
    ''
  ).trim()
  const secret = (
    process.env.META_APP_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    process.env.INSTAGRAM_APP_SECRET ||
    ''
  ).trim()
  if (!id || !secret) return null
  return { id, secret }
}

export async function graphGet<T>(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${GRAPH_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value)
  url.searchParams.set('access_token', token)
  const response = await fetch(url, { cache: 'no-store' })
  const body = (await response.json().catch(() => ({}))) as T & GraphErrorBody
  if (!response.ok) throw errorFrom(response.status, body)
  return body
}

export async function graphPost<T>(
  path: string,
  token: string,
  params: Record<string, string>
): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token })
  const response = await fetch(`${GRAPH_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  const json = (await response.json().catch(() => ({}))) as T & GraphErrorBody
  if (!response.ok) throw errorFrom(response.status, json)
  return json
}

export function metaOAuthDialogUrl(redirectUri: string, state: string): string | null {
  const app = metaAppCredentials()
  if (!app) return null
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`)
  url.searchParams.set('client_id', app.id)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', META_PUBLISH_SCOPES.join(','))
  return url.toString()
}

export async function exchangeMetaCode(code: string, redirectUri: string): Promise<string> {
  const app = metaAppCredentials()
  if (!app) throw new MetaGraphError('META_APP_ID and META_APP_SECRET are required to connect', 503)
  const url = new URL(`${GRAPH_ORIGIN}/oauth/access_token`)
  url.searchParams.set('client_id', app.id)
  url.searchParams.set('client_secret', app.secret)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('code', code)
  const response = await fetch(url, { cache: 'no-store' })
  const json = (await response.json().catch(() => ({}))) as GraphErrorBody & { access_token?: string }
  if (!response.ok || !json.access_token) throw errorFrom(response.status, json)
  return json.access_token
}

export async function exchangeLongLivedUserToken(shortToken: string): Promise<{
  access_token: string
  expires_in: number | null
}> {
  const app = metaAppCredentials()
  if (!app) return { access_token: shortToken, expires_in: null }
  const url = new URL(`${GRAPH_ORIGIN}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', app.id)
  url.searchParams.set('client_secret', app.secret)
  url.searchParams.set('fb_exchange_token', shortToken)
  const response = await fetch(url, { cache: 'no-store' })
  const json = (await response.json().catch(() => ({}))) as GraphErrorBody & {
    access_token?: string
    expires_in?: number
  }
  if (!response.ok || !json.access_token) throw errorFrom(response.status, json)
  return {
    access_token: json.access_token,
    expires_in: typeof json.expires_in === 'number' ? json.expires_in : null,
  }
}

export type MetaDebugToken = {
  is_valid: boolean
  scopes: string[]
  expires_at: number | null
}

export async function debugMetaToken(token: string): Promise<MetaDebugToken | null> {
  const app = metaAppCredentials()
  if (!app) return null
  const url = new URL(`${GRAPH_ORIGIN}/debug_token`)
  url.searchParams.set('input_token', token)
  url.searchParams.set('access_token', `${app.id}|${app.secret}`)
  const response = await fetch(url, { cache: 'no-store' })
  const json = (await response.json().catch(() => ({}))) as GraphErrorBody & {
    data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number }
  }
  if (!response.ok) throw errorFrom(response.status, json)
  return {
    is_valid: Boolean(json.data?.is_valid),
    scopes: Array.isArray(json.data?.scopes) ? json.data.scopes : [],
    expires_at: typeof json.data?.expires_at === 'number' ? json.data.expires_at : null,
  }
}

export type MetaPageAccount = {
  id: string
  name: string | null
  access_token: string
  ig_user_id: string | null
  ig_username: string | null
}

export async function listMetaPages(userToken: string): Promise<MetaPageAccount[]> {
  const json = await graphGet<{
    data?: Array<{
      id?: string
      name?: string
      access_token?: string
      instagram_business_account?: { id?: string; username?: string }
    }>
  }>(
    '/me/accounts',
    userToken,
    { fields: 'id,name,access_token,instagram_business_account{id,username}' }
  )
  const rows = Array.isArray(json.data) ? json.data : []
  return rows
    .filter((row) => row.id && row.access_token)
    .map((row) => ({
      id: String(row.id),
      name: row.name || null,
      access_token: String(row.access_token),
      ig_user_id: row.instagram_business_account?.id || null,
      ig_username: row.instagram_business_account?.username || null,
    }))
}

export function pickPublishPage(pages: MetaPageAccount[]): MetaPageAccount | null {
  const preferredIg = (process.env.INSTAGRAM_USER_ID || '').trim()
  if (preferredIg) {
    const match = pages.find((page) => page.ig_user_id === preferredIg)
    if (match) return match
  }
  return pages.find((page) => page.ig_user_id) || pages[0] || null
}

function clipCaption(caption: string): string {
  const text = caption.trim()
  if (text.length <= 2200) return text
  return `${text.slice(0, 2190).trimEnd()}…`
}

async function waitForInstagramContainer(containerId: string, token: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const status = await graphGet<{ status_code?: string }>(`/${containerId}`, token, {
      fields: 'status_code',
    })
    const code = status.status_code
    if (!code || code === 'FINISHED' || code === 'PUBLISHED') return
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new MetaGraphError(`Instagram media container ${code}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
}

export async function publishInstagramImage(input: {
  igUserId: string
  pageAccessToken: string
  imageUrl: string
  caption: string
  story: boolean
}): Promise<{ id: string; permalink: string | null }> {
  const params: Record<string, string> = {
    image_url: input.imageUrl,
  }
  if (input.story) {
    params.media_type = 'STORIES'
  } else {
    params.caption = clipCaption(input.caption)
  }
  const container = await graphPost<{ id?: string }>(`/${input.igUserId}/media`, input.pageAccessToken, params)
  const creationId = container.id
  if (!creationId) throw new MetaGraphError('Instagram did not return a media container')
  await waitForInstagramContainer(creationId, input.pageAccessToken)
  const published = await graphPost<{ id?: string }>(
    `/${input.igUserId}/media_publish`,
    input.pageAccessToken,
    { creation_id: creationId }
  )
  const id = published.id
  if (!id) throw new MetaGraphError('Instagram did not return a published media id')
  let permalink: string | null = null
  try {
    const media = await graphGet<{ permalink?: string }>(`/${id}`, input.pageAccessToken, {
      fields: 'permalink',
    })
    permalink = media.permalink || null
  } catch {
    permalink = null
  }
  return { id, permalink }
}

export async function publishFacebookPhoto(input: {
  pageId: string
  pageAccessToken: string
  imageUrl: string
  caption: string
  scheduledUnix?: number | null
}): Promise<{ id: string; permalink: string | null }> {
  const params: Record<string, string> = {
    url: input.imageUrl,
    caption: clipCaption(input.caption),
  }
  if (input.scheduledUnix) {
    params.published = 'false'
    params.scheduled_publish_time = String(input.scheduledUnix)
  }
  const created = await graphPost<{ id?: string; post_id?: string }>(
    `/${input.pageId}/photos`,
    input.pageAccessToken,
    params
  )
  const id = created.post_id || created.id
  if (!id) throw new MetaGraphError('Facebook did not return a post id')
  const permalink = created.post_id ? `https://www.facebook.com/${created.post_id}` : null
  return { id, permalink }
}

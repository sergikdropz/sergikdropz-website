import { createSupabaseServerClient } from '@/lib/supabase'
import { META_PUBLISHER_CONNECTION_KEY } from '@/lib/site-settings-keys'
import {
  debugMetaToken,
  exchangeLongLivedUserToken,
  listMetaPages,
  metaAppCredentials,
  META_PUBLISH_SCOPES,
  pickPublishPage,
  type MetaPageAccount,
} from '@/lib/meta/graph'
import { openMetaToken, sealMetaToken } from '@/lib/meta/token-seal'

export { META_PUBLISHER_CONNECTION_KEY } from '@/lib/site-settings-keys'
export const META_OAUTH_STATE_COOKIE = 'meta_publisher_oauth'

type StoredConnection = {
  ig_user_id: string | null
  ig_username: string | null
  page_id: string
  page_name: string | null
  page_access_token_sealed: string
  user_access_token_sealed: string
  scopes: string[]
  connected_at: string
  expires_at: number | null
}

export type MetaPublishCredentials = {
  pageId: string
  pageName: string | null
  pageAccessToken: string
  igUserId: string | null
  igUsername: string | null
  scopes: string[]
  source: 'oauth' | 'env'
}

export type MetaConnectionStatus = {
  app_configured: boolean
  connected: boolean
  source: 'oauth' | 'env' | 'none'
  ig_username: string | null
  ig_user_id: string | null
  page_name: string | null
  page_id: string | null
  can_publish_instagram: boolean
  can_publish_facebook: boolean
  scopes_missing: string[]
  can_link_env: boolean
  oauth_redirect_path: '/api/studio/meta/callback'
  hint: string | null
  /** Official Messaging API cannot broadcast to followers. Always false. */
  can_message_followers: false
}

function missingScopes(scopes: string[]): string[] {
  const have = new Set(scopes)
  return META_PUBLISH_SCOPES.filter((scope) => !have.has(scope))
}

function statusFromCredentials(
  credentials: MetaPublishCredentials | null,
  extras: { canLinkEnv: boolean; hint: string | null }
): MetaConnectionStatus {
  const scopes = credentials?.scopes || []
  const unverified = Boolean(credentials) && scopes.length === 0
  const missing = credentials && scopes.length > 0 ? missingScopes(scopes) : []
  const canInstagram =
    Boolean(credentials?.igUserId && credentials.pageAccessToken) &&
    (unverified || !missing.includes('instagram_content_publish'))
  const canFacebook =
    Boolean(credentials?.pageId && credentials.pageAccessToken) &&
    (unverified || !missing.includes('pages_manage_posts'))
  return {
    app_configured: Boolean(metaAppCredentials()),
    connected: Boolean(credentials),
    source: credentials?.source || 'none',
    ig_username: credentials?.igUsername || null,
    ig_user_id: credentials?.igUserId || null,
    page_name: credentials?.pageName || null,
    page_id: credentials?.pageId || null,
    can_publish_instagram: canInstagram,
    can_publish_facebook: canFacebook,
    scopes_missing: missing,
    can_link_env: extras.canLinkEnv,
    oauth_redirect_path: '/api/studio/meta/callback',
    hint: extras.hint,
    can_message_followers: false,
  }
}

async function readStored(): Promise<StoredConnection | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', META_PUBLISHER_CONNECTION_KEY)
    .maybeSingle()
  if (error || !data?.value || typeof data.value !== 'object') return null
  const value = data.value as Partial<StoredConnection>
  if (!value.page_id || !value.page_access_token_sealed) return null
  return {
    ig_user_id: value.ig_user_id || null,
    ig_username: value.ig_username || null,
    page_id: value.page_id,
    page_name: value.page_name || null,
    page_access_token_sealed: value.page_access_token_sealed,
    user_access_token_sealed: value.user_access_token_sealed || '',
    scopes: Array.isArray(value.scopes) ? value.scopes.filter((scope) => typeof scope === 'string') : [],
    connected_at: value.connected_at || '',
    expires_at: typeof value.expires_at === 'number' ? value.expires_at : null,
  }
}

function credentialsFromStored(stored: StoredConnection): MetaPublishCredentials | null {
  const pageAccessToken = openMetaToken(stored.page_access_token_sealed)
  if (!pageAccessToken) return null
  return {
    pageId: stored.page_id,
    pageName: stored.page_name,
    pageAccessToken,
    igUserId: stored.ig_user_id,
    igUsername: stored.ig_username,
    scopes: stored.scopes,
    source: 'oauth',
  }
}

export async function loadMetaPublishCredentials(): Promise<MetaPublishCredentials | null> {
  const stored = await readStored()
  if (!stored) return null
  return credentialsFromStored(stored)
}

export async function metaConnectionStatus(): Promise<MetaConnectionStatus> {
  const stored = await readStored()
  const credentials = stored ? credentialsFromStored(stored) : null
  const envToken = Boolean((process.env.INSTAGRAM_ACCESS_TOKEN || '').trim())
  if (!credentials) {
    return statusFromCredentials(null, {
      canLinkEnv: envToken,
      hint: envToken
        ? 'A feed token is saved. Link it if it can manage the Page, or connect Meta for publish permissions.'
        : 'Connect the Instagram professional account and its Facebook Page to publish this schedule.',
    })
  }
  const missing = credentials.scopes.length ? missingScopes(credentials.scopes) : []
  return statusFromCredentials(credentials, {
    canLinkEnv: false,
    hint: missing.length
      ? `Reconnect Meta and allow: ${missing.join(', ')}.`
      : credentials.scopes.length
        ? `Publishing as @${credentials.igUsername || 'Instagram'}${
            credentials.pageName ? ` and ${credentials.pageName}` : ''
          }.`
        : `Connected${credentials.pageName ? ` to ${credentials.pageName}` : ''}. Meta confirms publish permissions on the first post.`,
  })
}

async function saveConnection(input: {
  page: MetaPageAccount
  userToken: string
  scopes: string[]
  expiresAt: number | null
}) {
  const supabase = createSupabaseServerClient()
  const value: StoredConnection = {
    ig_user_id: input.page.ig_user_id,
    ig_username: input.page.ig_username,
    page_id: input.page.id,
    page_name: input.page.name,
    page_access_token_sealed: sealMetaToken(input.page.access_token),
    user_access_token_sealed: sealMetaToken(input.userToken),
    scopes: input.scopes,
    connected_at: new Date().toISOString(),
    expires_at: input.expiresAt,
  }
  const { error } = await supabase.from('settings').upsert(
    { key: META_PUBLISHER_CONNECTION_KEY, value },
    { onConflict: 'key' }
  )
  if (error) throw new Error(error.message)
}

export async function connectMetaFromUserToken(userToken: string): Promise<MetaConnectionStatus> {
  const longLived = await exchangeLongLivedUserToken(userToken)
  const debug = await debugMetaToken(longLived.access_token).catch(() => null)
  const pages = await listMetaPages(longLived.access_token)
  const page = pickPublishPage(pages)
  if (!page) {
    throw new Error('No Facebook Page was returned. The token needs pages_show_list on a Page you manage.')
  }
  const scopes = debug?.scopes || []
  const expiresAt =
    debug?.expires_at ||
    (longLived.expires_in ? Math.floor(Date.now() / 1000) + longLived.expires_in : null)
  await saveConnection({
    page,
    userToken: longLived.access_token,
    scopes,
    expiresAt,
  })
  return metaConnectionStatus()
}

export async function disconnectMetaPublisher(): Promise<void> {
  const supabase = createSupabaseServerClient()
  await supabase.from('settings').delete().eq('key', META_PUBLISHER_CONNECTION_KEY)
}

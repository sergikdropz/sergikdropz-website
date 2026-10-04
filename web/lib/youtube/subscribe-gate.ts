import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { youtubeSubscribePopupCloseHtml } from '@/lib/youtube/subscribe-gate-public'
import {
  cookieSecureFromRequest,
  fanVaultUnlockCookieDomain,
  hostnameFromRequest,
} from '@/lib/fan-vault-unlock-cookie'

export const YT_SUB_GATE_COOKIE = 'yt_watch_unlock'
export const YT_SUB_GATE_STATE_COOKIE = 'yt_sub_gate_state'
export const YT_SUB_GATE_POPUP_COOKIE = 'yt_sub_gate_popup'
export const YT_SUB_INTENT_COOKIE = 'yt_sub_intent'
export const YT_SUB_GATE_CHANNEL_HANDLE = 'sergikdropz'
/** Read-only check. The watch button does not send fans through this scope or create subscriptions. */
export const YT_SUB_GATE_SCOPE = 'https://www.googleapis.com/auth/youtube'

const UNLOCK_MAX_AGE_SEC = 60 * 60 * 24 * 30
const STATE_MAX_AGE_SEC = 60 * 10

let cachedChannelId: string | null = null

function gateSecret(): string {
  const dedicated = process.env.YT_SUB_GATE_SECRET
  if (dedicated && dedicated.length >= 16) return dedicated
  const shared = process.env.FAN_VAULT_UNLOCK_SECRET
  if (shared && shared.length >= 16) return shared
  if (process.env.NODE_ENV !== 'production') {
    return 'dev-yt-sub-gate-secret-min-16'
  }
  throw new Error('YT_SUB_GATE_SECRET must be set (min 16 chars) in production')
}

function sign(body: string): string {
  return createHmac('sha256', gateSecret()).update(body).digest('base64url')
}

function signaturesMatch(sig: string, body: string): boolean {
  const expected = sign(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function youtubeOAuthConfigured(): boolean {
  return Boolean(youtubeOAuthClient())
}

export function youtubeOAuthClientId(): string | null {
  const id = (
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.YOUTUBE_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ''
  ).trim()
  return id || null
}

export function youtubeOAuthClient(): { id: string; secret: string } | null {
  const id = youtubeOAuthClientId()
  const secret = (process.env.YOUTUBE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim()
  if (!id || !secret) return null
  return { id, secret }
}

export type GoogleAccountProfile = { email: string; name: string | null }

/** Verified Google account email and display name from a GIS access token. */
export async function profileFromGoogleAccessToken(accessToken: string): Promise<GoogleAccountProfile | null> {
  const token = accessToken.trim()
  if (!token || token.length > 4096) return null
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  if (data?.email_verified === false) return null
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : ''
  if (!email.includes('@') || email.length > 320) return null
  const rawName = typeof data?.name === 'string' ? data.name.trim().slice(0, 120) : ''
  return { email, name: rawName || null }
}

export async function emailFromGoogleAccessToken(accessToken: string): Promise<string | null> {
  const profile = await profileFromGoogleAccessToken(accessToken)
  return profile?.email ?? null
}

export function sealYtSubGate(now = Date.now()): { token: string; maxAgeSec: number } {
  const exp = Math.floor(now / 1000) + UNLOCK_MAX_AGE_SEC
  const body = `ok.${exp}`
  return { token: `${body}.${sign(body)}`, maxAgeSec: UNLOCK_MAX_AGE_SEC }
}

export function readYtSubGate(token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false
  const lastDot = token.lastIndexOf('.')
  if (lastDot <= 0) return false
  const body = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  if (!signaturesMatch(sig, body)) return false
  const exp = Number(body.slice(body.lastIndexOf('.') + 1))
  if (!Number.isFinite(exp) || exp * 1000 <= now) return false
  return body.startsWith('ok.')
}

export function newYtSubGateState(): string {
  return randomBytes(24).toString('base64url')
}

/** Short-lived proof that this browser opened the subscribe window for one email. */
export function sealYtSubIntent(email: string, now = Date.now()): { token: string; maxAgeSec: number } {
  const exp = Math.floor(now / 1000) + STATE_MAX_AGE_SEC
  const body = `intent.${email}.${exp}`
  return { token: `${body}.${sign(body)}`, maxAgeSec: STATE_MAX_AGE_SEC }
}

export function readYtSubIntent(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null
  const lastDot = token.lastIndexOf('.')
  if (lastDot <= 0) return null
  const body = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  if (!body.startsWith('intent.') || !signaturesMatch(sig, body)) return null
  const rest = body.slice('intent.'.length)
  const expDot = rest.lastIndexOf('.')
  if (expDot <= 0) return null
  const email = rest.slice(0, expDot)
  const exp = Number(rest.slice(expDot + 1))
  if (!email.includes('@') || email.length > 320) return null
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null
  return email
}

export function ytSubGateCookieOptions(request: NextRequest, maxAgeSec: number) {
  const host = hostnameFromRequest(request)
  const domain = fanVaultUnlockCookieDomain(host)
  const secure =
    cookieSecureFromRequest(request) ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL === '1')
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    maxAge: maxAgeSec,
    path: '/',
    ...(domain ? { domain } : {}),
  }
}

export function clearYtSubGateStateCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(YT_SUB_GATE_STATE_COOKIE, '', {
    ...ytSubGateCookieOptions(request, 0),
    maxAge: 0,
  })
}

export function clearYtWatchUnlock(response: NextResponse, request: NextRequest) {
  const expired = { ...ytSubGateCookieOptions(request, 0), maxAge: 0 }
  response.cookies.set(YT_SUB_GATE_COOKIE, '', expired)
  response.cookies.set('yt_sub_gate', '', expired)
  clearYtSubGateStateCookie(response, request)
  response.cookies.set(YT_SUB_GATE_POPUP_COOKIE, '', expired)
}

/** Floating Google window: set the unlock cookie, then tell that window to close. */
export function youtubeSubscribePopupResult(request: NextRequest, flag: string, unlock = false): NextResponse {
  const response = new NextResponse(youtubeSubscribePopupCloseHtml(flag), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
  const expired = { ...ytSubGateCookieOptions(request, 0), maxAge: 0 }
  response.cookies.set(YT_SUB_GATE_STATE_COOKIE, '', expired)
  response.cookies.set(YT_SUB_GATE_POPUP_COOKIE, '', expired)
  if (unlock) {
    const { token, maxAgeSec } = sealYtSubGate()
    response.cookies.set(YT_SUB_GATE_COOKIE, token, ytSubGateCookieOptions(request, maxAgeSec))
  }
  return response
}

export function channelHandle(): string {
  const raw = (process.env.YOUTUBE_CHANNEL_ID || `@${YT_SUB_GATE_CHANNEL_HANDLE}`).trim()
  return raw.replace(/^@/, '') || YT_SUB_GATE_CHANNEL_HANDLE
}

export async function resolveSergikChannelId(accessToken?: string): Promise<string | null> {
  const configured = (process.env.YOUTUBE_CHANNEL_ID || '').trim()
  if (configured && !configured.startsWith('@')) return configured
  if (cachedChannelId) return cachedChannelId

  const handle = channelHandle()
  const headers: Record<string, string> = {}
  const params = new URLSearchParams({ part: 'id', forHandle: handle })
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  else if (process.env.YOUTUBE_API_KEY) params.set('key', process.env.YOUTUBE_API_KEY)
  else return null

  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, { headers })
  if (!response.ok) return null
  const data = await response.json()
  const id = data?.items?.[0]?.id
  if (typeof id === 'string' && id) {
    cachedChannelId = id
    return id
  }
  return null
}

export async function viewerSubscribesToChannel(accessToken: string, channelId: string): Promise<boolean> {
  const params = new URLSearchParams({
    part: 'id',
    mine: 'true',
    forChannelId: channelId,
  })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return false
  const data = await response.json()
  return Array.isArray(data?.items) && data.items.length > 0
}

export type SubscribeGateAccessResult =
  | { ok: true; channelId: string }
  | { ok: false; reason: 'channel' | 'unsubscribed' | 'error' }

/** Resolve @sergikdropz and report whether the viewer is already subscribed. Never creates a subscription. */
export async function confirmViewerSubscribedToSergik(accessToken: string): Promise<SubscribeGateAccessResult> {
  const token = accessToken.trim()
  if (!token) return { ok: false, reason: 'error' }
  try {
    const channelId = await resolveSergikChannelId(token)
    if (!channelId) return { ok: false, reason: 'channel' }

    const subscribed = await viewerSubscribesToChannel(token, channelId)
    if (!subscribed) return { ok: false, reason: 'unsubscribed' }
    return { ok: true, channelId }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export type SergikChannelPublicStats = {
  channelId: string | null
  subscriberCount: number | null
  hiddenSubscriberCount: boolean
}

/** Public channel stats for @sergikdropz (API key). Used to show trust + admin verification. */
export async function fetchSergikChannelPublicStats(): Promise<SergikChannelPublicStats> {
  const empty: SergikChannelPublicStats = {
    channelId: null,
    subscriberCount: null,
    hiddenSubscriberCount: false,
  }
  const channelId = await resolveSergikChannelId()
  if (!channelId) return empty

  const params = new URLSearchParams({ part: 'statistics', id: channelId })
  if (process.env.YOUTUBE_API_KEY) params.set('key', process.env.YOUTUBE_API_KEY)
  else return { ...empty, channelId }

  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`)
  if (!response.ok) return { ...empty, channelId }
  const data = await response.json().catch(() => null)
  const stats = data?.items?.[0]?.statistics
  const raw = stats?.subscriberCount
  const subscriberCount =
    typeof raw === 'string' && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null
  return {
    channelId,
    subscriberCount: Number.isFinite(subscriberCount) ? subscriberCount : null,
    hiddenSubscriberCount: stats?.hiddenSubscriberCount === true,
  }
}

export const YT_SUB_GATE_STATE_MAX_AGE_SEC = STATE_MAX_AGE_SEC

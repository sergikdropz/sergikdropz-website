import crypto from 'crypto'
import type { RightsPacketKind } from '@/lib/studio/rights-packets'
import { siteOrigin } from '@/lib/shares/types'
import {
  buildEnvelopeDefinition,
  parseDocuSignEnvelopes,
  readEnvelopeFacts,
  upsertEnvelopeRecord,
  type DocuSignEnvelopeRecord,
  type DocuSignRecipient,
} from '@/lib/studio/docusign-records'

export type DocuSignConfig = {
  integrationKey: string
  userId: string
  accountId: string
  privateKey: string
  oauthHost: string
  sergikEmail: string | null
  sergikName: string
  connectHmac: string | null
  redirectUri: string
}

export class DocuSignError extends Error {
  status: number
  consentUrl?: string

  constructor(message: string, status = 502, consentUrl?: string) {
    super(message)
    this.name = 'DocuSignError'
    this.status = status
    this.consentUrl = consentUrl
  }
}

type TokenCache = {
  token: string
  expiresAt: number
  baseUri: string
  accountId: string
}

let tokenCache: TokenCache | null = null

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function normalizePrivateKey(raw: string): string {
  let key = raw.trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1)
  }
  key = key.replace(/\\n/g, '\n').trim()
  if (!key.includes('BEGIN')) {
    const body = key.replace(/\s+/g, '')
    const lines = body.match(/.{1,64}/g)?.join('\n') || body
    key = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`
  }
  return key
}

export function readDocuSignConfig(env: NodeJS.ProcessEnv = process.env): DocuSignConfig | null {
  const integrationKey = clean(env.DOCUSIGN_INTEGRATION_KEY)
  const userId = clean(env.DOCUSIGN_USER_ID)
  const accountId = clean(env.DOCUSIGN_ACCOUNT_ID)
  const privateKey = clean(env.DOCUSIGN_RSA_PRIVATE_KEY)
  if (!integrationKey || !userId || !accountId || !privateKey) return null

  const explicitHost = clean(env.DOCUSIGN_OAUTH_HOST)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  const mode = clean(env.DOCUSIGN_ENV).toLowerCase()
  const oauthHost =
    explicitHost ||
    (mode === 'production' || mode === 'prod' ? 'account.docusign.com' : 'account-d.docusign.com')
  const origin = siteOrigin().replace(/\/$/, '')
  return {
    integrationKey,
    userId,
    accountId,
    privateKey: normalizePrivateKey(privateKey),
    oauthHost,
    sergikEmail: clean(env.DOCUSIGN_SERGIK_EMAIL).toLowerCase() || null,
    sergikName: clean(env.DOCUSIGN_SERGIK_NAME) || 'SERGIK',
    connectHmac: clean(env.DOCUSIGN_CONNECT_HMAC) || null,
    redirectUri: clean(env.DOCUSIGN_REDIRECT_URI) || origin,
  }
}

export function docuSignConsentUrl(config: DocuSignConfig): string {
  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'signature impersonation',
    client_id: config.integrationKey,
    redirect_uri: config.redirectUri,
  })
  return `https://${config.oauthHost}/oauth/auth?${params.toString()}`
}

export function docuSignWebhookUrl(): string | null {
  const origin = siteOrigin().replace(/\/$/, '')
  if (!origin.startsWith('https://')) return null
  return `${origin}/api/webhooks/docusign`
}

export function signDocuSignJwt(config: DocuSignConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: config.integrationKey,
      sub: config.userId,
      aud: config.oauthHost,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
      scope: 'signature impersonation',
    }),
  ).toString('base64url')
  const data = `${header}.${payload}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(data)
  signer.end()
  return `${data}.${signer.sign(config.privateKey).toString('base64url')}`
}

export function verifyDocuSignHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  const left = Buffer.from(digest)
  const right = Buffer.from(signature.trim())
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return { message: text.slice(0, 300) }
  }
}

function failFromPayload(res: Response, payload: Record<string, unknown>, config: DocuSignConfig): never {
  const code = clean(payload.error || payload.errorCode).toLowerCase()
  if (code.includes('consent')) {
    throw new DocuSignError(
      'DocuSign needs a one-time consent from the SERGIK account. Open the consent link, accept, then send again.',
      409,
      docuSignConsentUrl(config),
    )
  }
  const message =
    clean(payload.message || payload.error_description || payload.error) ||
    `DocuSign request failed (${res.status})`
  const status = res.status >= 400 && res.status < 500 ? res.status : 502
  throw new DocuSignError(message, status)
}

async function accessToken(config: DocuSignConfig): Promise<TokenCache> {
  const now = Date.now()
  if (
    tokenCache &&
    tokenCache.accountId === config.accountId &&
    tokenCache.expiresAt > now + 60_000
  ) {
    return tokenCache
  }

  let assertion = ''
  try {
    assertion = signDocuSignJwt(config)
  } catch {
    throw new DocuSignError('DOCUSIGN_RSA_PRIVATE_KEY is not a valid RSA private key.', 500)
  }

  const tokenRes = await fetch(`https://${config.oauthHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const tokenBody = await readJson(tokenRes)
  if (!tokenRes.ok) failFromPayload(tokenRes, tokenBody, config)
  const token = clean(tokenBody.access_token)
  if (!token) throw new DocuSignError('DocuSign did not return an access token.', 502)

  const infoRes = await fetch(`https://${config.oauthHost}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const info = await readJson(infoRes)
  if (!infoRes.ok) failFromPayload(infoRes, info, config)
  const accounts = Array.isArray(info.accounts) ? info.accounts : []
  const account = accounts.find((row) => {
    if (!row || typeof row !== 'object') return false
    return clean((row as { account_id?: unknown }).account_id) === config.accountId
  }) as { base_uri?: unknown } | undefined
  const baseUri = clean(account?.base_uri).replace(/\/$/, '')
  if (!baseUri) {
    throw new DocuSignError('DOCUSIGN_ACCOUNT_ID is not on this DocuSign user.', 500)
  }
  const expiresIn = Number(tokenBody.expires_in) || 3600
  tokenCache = {
    token,
    expiresAt: now + expiresIn * 1000,
    baseUri,
    accountId: config.accountId,
  }
  return tokenCache
}

export async function createContractEnvelope(input: {
  config: DocuSignConfig
  pdf: Buffer
  filename: string
  subject: string
  blurb: string
  releaseId: string
  kind: RightsPacketKind
  recipients: DocuSignRecipient[]
}): Promise<{ envelopeId: string; status: string }> {
  if (!input.recipients.length) {
    throw new DocuSignError('Add at least one signer email before sending to DocuSign.', 400)
  }
  const auth = await accessToken(input.config)
  const definition = buildEnvelopeDefinition({
    pdfBase64: input.pdf.toString('base64'),
    filename: input.filename,
    subject: input.subject,
    blurb: input.blurb,
    releaseId: input.releaseId,
    kind: input.kind,
    recipients: input.recipients,
    webhookUrl: docuSignWebhookUrl(),
  })
  const res = await fetch(
    `${auth.baseUri}/restapi/v2.1/accounts/${encodeURIComponent(input.config.accountId)}/envelopes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(definition),
    },
  )
  const body = await readJson(res)
  if (!res.ok) failFromPayload(res, body, input.config)
  const envelopeId = clean(body.envelopeId)
  if (!envelopeId) throw new DocuSignError('DocuSign did not return an envelope id.', 502)
  return { envelopeId, status: clean(body.status).toLowerCase() || 'sent' }
}

export async function fetchContractEnvelope(
  config: DocuSignConfig,
  envelopeId: string,
): Promise<{ envelopeId: string; status: string; releaseId: string | null; kind: string | null }> {
  const auth = await accessToken(config)
  const res = await fetch(
    `${auth.baseUri}/restapi/v2.1/accounts/${encodeURIComponent(config.accountId)}/envelopes/${encodeURIComponent(envelopeId)}?include=custom_fields`,
    { headers: { Authorization: `Bearer ${auth.token}` } },
  )
  const body = await readJson(res)
  if (!res.ok) failFromPayload(res, body, config)
  const facts = readEnvelopeFacts(body)
  return {
    envelopeId: facts.envelopeId || envelopeId,
    status: facts.status || 'sent',
    releaseId: facts.releaseId,
    kind: facts.kind,
  }
}

/** Structural slice of the Supabase client; callers cast the real client to keep tsc shallow. */
export type ChecklistWriter = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: { docusign_envelopes?: unknown } | null; error: { message?: string } | null }>
      }
    }
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => PromiseLike<{ error: { message?: string } | null }>
  }
}

export async function persistEnvelopeUpdate(
  supabase: ChecklistWriter,
  input: {
    releaseId: string
    record: DocuSignEnvelopeRecord
    statusPatch?: Record<string, unknown> | null
  },
): Promise<DocuSignEnvelopeRecord[]> {
  const loaded = await supabase
    .from('release_copyright_checklists')
    .select('docusign_envelopes')
    .eq('release_id', input.releaseId)
    .maybeSingle()
  const existing = loaded.error ? [] : parseDocuSignEnvelopes(loaded.data?.docusign_envelopes)
  const previous = existing.find((row) => row.envelopeId === input.record.envelopeId)
  const record: DocuSignEnvelopeRecord = {
    ...input.record,
    recipients: input.record.recipients.length ? input.record.recipients : previous?.recipients || [],
    sentAt: previous?.sentAt || input.record.sentAt,
  }
  const envelopes = upsertEnvelopeRecord(existing, record)
  const patch: Record<string, unknown> = {
    release_id: input.releaseId,
    docusign_envelopes: envelopes,
    ...(input.statusPatch || {}),
    updated_at: new Date().toISOString(),
  }
  let write = await supabase
    .from('release_copyright_checklists')
    .upsert(patch, { onConflict: 'release_id' })
  if (write.error && /docusign_envelopes/i.test(write.error.message || '')) {
    const rest = { ...patch }
    delete rest.docusign_envelopes
    write = await supabase.from('release_copyright_checklists').upsert(rest, { onConflict: 'release_id' })
  }
  if (write.error) console.error('docusign envelope save:', write.error.message)
  return envelopes
}

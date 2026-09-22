import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash } from 'crypto'
import { createReadStream, statSync } from 'fs'
import { PassThrough } from 'stream'

export type R2MediaConfig = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

const DEFAULT_PRESIGN_SEC = 3600

export function getR2MediaConfig(): R2MediaConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

let cachedClient: S3Client | null = null
let cachedKey = ''

function clientFor(cfg: R2MediaConfig): S3Client {
  const key = `${cfg.accountId}:${cfg.accessKeyId}:${cfg.bucket}`
  if (cachedClient && cachedKey === key) return cachedClient
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  cachedKey = key
  return cachedClient
}

/** Public CDN base (custom R2 domain). Skips tunnels and same-origin proxies. */
export function getPublicMediaCdnBase(): string | null {
  const base = (
    process.env.NEXT_PUBLIC_MEDIA_CDN_URL ||
    process.env.R2_PUBLIC_BASE_URL ||
    ''
  ).replace(/\/+$/, '')
  if (!base) return null
  if (/sergikdropz\.com\/api|ngrok|trycloudflare|127\.0\.0\.1|localhost/i.test(base)) {
    return null
  }
  return base
}

/** Vault relative path → R2 object key (`audio/...`). */
export function r2ObjectKey(relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, '').replace(/^audio\//i, '')
  return `audio/${cleaned}`
}

/** Direct browser URL when bucket is on a public custom domain. */
export function publicR2MediaUrl(relativePath: string): string | null {
  const base = getPublicMediaCdnBase()
  if (!base) return null
  const Key = r2ObjectKey(relativePath)
  const segments = Key.replace(/^audio\//i, '').split('/').map(encodeURIComponent).join('/')
  return `${base}/audio/${segments}`
}

/** Short-lived signed URL for private R2 buckets (browser streams from Cloudflare, not Vercel). */
export async function presignR2ObjectUrl(
  relativePath: string,
  expiresIn = DEFAULT_PRESIGN_SEC,
): Promise<string | null> {
  const cfg = getR2MediaConfig()
  if (!cfg) return null
  const client = clientFor(cfg)
  const Key = r2ObjectKey(relativePath)
  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: cfg.bucket, Key }),
      { expiresIn },
    )
  } catch (err) {
    console.warn('[presignR2ObjectUrl] unavailable, falling back to proxy:', err)
    return null
  }
}

export async function r2ObjectExists(relativePath: string): Promise<boolean> {
  const cfg = getR2MediaConfig()
  if (!cfg) return false
  const Key = r2ObjectKey(relativePath)
  try {
    await clientFor(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key }))
    return true
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404) return false
    return false
  }
}

/**
 * List object keys under an `audio/<prefix>/` path.
 * Returns vault-relative paths (no leading `audio/`).
 */
export async function listR2Prefix(
  relativePrefix: string,
  opts?: { maxKeys?: number },
): Promise<string[]> {
  const cfg = getR2MediaConfig()
  if (!cfg) return []
  const prefix = r2ObjectKey(relativePrefix).replace(/\/?$/, '/')
  const out: string[] = []
  let ContinuationToken: string | undefined
  const maxKeys = opts?.maxKeys ?? 1000
  do {
    const res = await clientFor(cfg).send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix,
        ContinuationToken,
        MaxKeys: Math.min(1000, maxKeys - out.length),
      }),
    )
    for (const obj of res.Contents || []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue
      const relative = obj.Key.replace(/^audio\//i, '')
      out.push(relative)
      if (out.length >= maxKeys) return out
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (ContinuationToken)
  return out
}

function contentTypeForPath(relativePath: string, fallback?: string | null): string {
  const ext = relativePath.split('.').pop()?.toLowerCase() || ''
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'flac') return 'audio/flac'
  if (ext === 'm4a') return 'audio/mp4'
  if (ext === 'aac') return 'audio/aac'
  if (ext === 'ogg' || ext === 'oga') return 'audio/ogg'
  return fallback || 'application/octet-stream'
}

/** Same-origin media proxy URL for a vault-relative path (R2-backed). */
export function vaultMediaProxyUrl(relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, '').replace(/^audio\//i, '')
  return `/api/audio/media/${cleaned.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Upload bytes to Cloudflare R2 under `audio/<relativePath>` (same layout as the Music Vault).
 * Overwrites existing objects.
 */
export async function putR2Object(
  relativePath: string,
  body: Buffer | Uint8Array,
  opts?: { contentType?: string | null; cacheControl?: string | null },
): Promise<{ key: string; bytes: number }> {
  const cfg = getR2MediaConfig()
  if (!cfg) {
    throw new Error('Cloudflare R2 is not configured (R2_ACCOUNT_ID / KEY / SECRET / BUCKET)')
  }
  const Key = r2ObjectKey(relativePath)
  const contentType = opts?.contentType || contentTypeForPath(relativePath)
  const cacheControl =
    opts?.cacheControl ??
    (contentType.startsWith('audio/') ? 'public, max-age=31536000, immutable' : undefined)
  await clientFor(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key,
      Body: body,
      ContentType: contentType,
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
    }),
  )
  return { key: Key, bytes: body.byteLength }
}

/**
 * Stream a local file into R2 (avoids loading large WAV masters into memory).
 * Returns SHA-256 of the bytes as they stream.
 */
export async function putR2ObjectFromFile(
  relativePath: string,
  absPath: string,
  opts?: { contentType?: string | null; cacheControl?: string | null },
): Promise<{ key: string; bytes: number; sha256: string }> {
  const cfg = getR2MediaConfig()
  if (!cfg) {
    throw new Error('Cloudflare R2 is not configured (R2_ACCOUNT_ID / KEY / SECRET / BUCKET)')
  }
  const Key = r2ObjectKey(relativePath)
  const contentType = opts?.contentType || contentTypeForPath(relativePath)
  const cacheControl =
    opts?.cacheControl ??
    (contentType.startsWith('audio/') ? 'public, max-age=31536000, immutable' : undefined)
  const st = statSync(absPath)
  const hash = createHash('sha256')
  const fileStream = createReadStream(absPath)
  const body = new PassThrough()
  fileStream.on('data', (chunk: Buffer | string) => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    hash.update(buf)
  })
  fileStream.on('error', (err) => body.destroy(err))
  fileStream.pipe(body)

  await clientFor(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key,
      Body: body,
      ContentLength: st.size,
      ContentType: contentType,
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
    }),
  )
  return { key: Key, bytes: st.size, sha256: hash.digest('hex') }
}

export async function fetchR2Object(
  relativePath: string,
  options: { method: 'GET' | 'HEAD'; range?: string | null },
) {
  const cfg = getR2MediaConfig()
  if (!cfg) return null

  const Key = r2ObjectKey(relativePath)
  const client = clientFor(cfg)

  if (options.method === 'HEAD') {
    const head = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key }))
    return {
      status: 200,
      headers: {
        'content-type': head.ContentType || 'application/octet-stream',
        'content-length': head.ContentLength != null ? String(head.ContentLength) : undefined,
        etag: head.ETag || undefined,
        'last-modified': head.LastModified?.toUTCString(),
        'accept-ranges': 'bytes',
      },
      body: null as ReadableStream | null,
    }
  }

  const get = await client.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key,
      ...(options.range ? { Range: options.range } : {}),
    }),
  )

  const webBody = get.Body ? (get.Body as any).transformToWebStream?.() ?? get.Body : null
  return {
    status: options.range ? 206 : 200,
    headers: {
      'content-type': get.ContentType || 'application/octet-stream',
      'content-length': get.ContentLength != null ? String(get.ContentLength) : undefined,
      'content-range': get.ContentRange || undefined,
      etag: get.ETag || undefined,
      'last-modified': get.LastModified?.toUTCString(),
      'accept-ranges': 'bytes',
    },
    body: webBody as ReadableStream | null,
  }
}

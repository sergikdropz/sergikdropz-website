import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'

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

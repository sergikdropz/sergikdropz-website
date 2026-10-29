import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { ensureR2Cors, getR2Client, getR2MediaConfig } from '@/lib/audio/r2Media'

/**
 * Merch artwork lives in the shared Cloudflare R2 bucket under the `merch/`
 * prefix (audio uses `audio/`). Objects are served over the bucket's public
 * r2.dev URL when configured, otherwise through the same-origin proxy route at
 * `/api/merch/art/:id` (which streams from R2).
 */
const PREFIX = 'merch/'
const ART_ID = /^[0-9a-f-]{36}\.(png|jpg)$/i
const DEFAULT_PUT_EXPIRES = 600 // 10 min to upload

export function isR2ArtConfigured(): boolean {
  return getR2MediaConfig() != null
}

function artKey(id: string): string {
  return `${PREFIX}${id.replace(/^merch\//i, '')}`
}

function contentTypeForId(id: string): string {
  return id.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png'
}

/** Public r2.dev (or custom-domain) base for images, e.g. https://pub-xxxx.r2.dev */
export function r2ArtPublicBase(): string | null {
  const base = (
    process.env.NEXT_PUBLIC_R2_IMAGE_BASE ||
    process.env.R2_IMAGE_PUBLIC_BASE ||
    ''
  ).replace(/\/+$/, '')
  if (!base) return null
  if (/localhost|127\.0\.0\.1|ngrok|trycloudflare/i.test(base)) return null
  return base
}

/** Direct public URL for an art object when a public base is configured. */
export function r2ArtPublicUrl(id: string): string | null {
  const base = r2ArtPublicBase()
  if (!base) return null
  return `${base}/${PREFIX}${encodeURIComponent(id)}`
}

/** Upload art bytes to R2. Returns the stable public URL (r2.dev or proxy). */
export async function putR2Art(
  id: string,
  bytes: Buffer | Uint8Array,
  contentType: string,
): Promise<{ id: string; url: string }> {
  const cfg = getR2MediaConfig()
  if (!cfg) throw new Error('Cloudflare R2 is not configured')
  await getR2Client(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: artKey(id),
      Body: bytes,
      ContentType: contentType || contentTypeForId(id),
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return { id, url: r2ArtPublicUrl(id) || `/api/merch/art/${id}` }
}

/** Presigned PUT so the browser uploads straight to R2 (skips Vercel's body limit). */
export async function presignR2ArtPut(
  id: string,
  contentType: string,
  expiresIn = DEFAULT_PUT_EXPIRES,
): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  const cfg = getR2MediaConfig()
  if (!cfg) return null
  try {
    await ensureR2Cors(cfg)
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    const uploadUrl = await getSignedUrl(
      getR2Client(cfg),
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: artKey(id),
        ContentType: contentType || contentTypeForId(id),
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { expiresIn },
    )
    return { uploadUrl, publicUrl: r2ArtPublicUrl(id) || `/api/merch/art/${id}` }
  } catch (err) {
    console.warn('[r2-art] presign PUT unavailable:', err)
    return null
  }
}

export async function r2ArtExists(id: string): Promise<boolean> {
  const cfg = getR2MediaConfig()
  if (!cfg) return false
  try {
    await getR2Client(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: artKey(id) }))
    return true
  } catch {
    return false
  }
}

/** Read an art object from R2 for the same-origin proxy route. */
export async function fetchR2Art(
  id: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const cfg = getR2MediaConfig()
  if (!cfg) return null
  try {
    const res = await getR2Client(cfg).send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: artKey(id) }),
    )
    const bytes = Buffer.from(await (res.Body as any).transformToByteArray())
    return { bytes, contentType: res.ContentType || contentTypeForId(id) }
  } catch {
    return null
  }
}

export async function deleteR2Art(id: string): Promise<boolean> {
  const cfg = getR2MediaConfig()
  if (!cfg) return false
  try {
    await getR2Client(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: artKey(id) }))
    return true
  } catch (err) {
    console.warn('[r2-art] delete failed:', err)
    return false
  }
}

export type R2ArtItem = { id: string; url: string; createdAt: string }

/** List merch art objects stored in R2 (newest first). */
export async function listR2Art(limit = 100): Promise<R2ArtItem[]> {
  const cfg = getR2MediaConfig()
  if (!cfg) return []
  const out: R2ArtItem[] = []
  let ContinuationToken: string | undefined
  try {
    do {
      const res = await getR2Client(cfg).send(
        new ListObjectsV2Command({
          Bucket: cfg.bucket,
          Prefix: PREFIX,
          ContinuationToken,
        }),
      )
      for (const obj of res.Contents || []) {
        if (!obj.Key) continue
        const id = obj.Key.slice(PREFIX.length)
        if (!ART_ID.test(id)) continue
        const createdAt = (obj.LastModified || new Date(0)).toISOString()
        out.push({
          id,
          url: r2ArtPublicUrl(id) || `/api/merch/art/${id}`,
          createdAt,
        })
      }
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (ContinuationToken && out.length < limit)
  } catch (err) {
    console.warn('[r2-art] list failed:', err)
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
}

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
const PART_PREFIX = 'merch/_parts/'
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

/** First bytes of an art object, enough to read a JPEG size header. */
export async function fetchR2ArtPrefix(
  id: string,
  length = 65536,
): Promise<Buffer | null> {
  const cfg = getR2MediaConfig()
  if (!cfg) return null
  try {
    const res = await getR2Client(cfg).send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: artKey(id),
        Range: `bytes=0-${Math.max(0, length - 1)}`,
      }),
    )
    return Buffer.from(await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray())
  } catch {
    return null
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

function partKey(uploadId: string, index: number): string {
  return `${PART_PREFIX}${uploadId}/${index}`
}

export async function putR2Key(key: string, bytes: Buffer, contentType: string): Promise<void> {
  const cfg = getR2MediaConfig()
  if (!cfg) throw new Error('Cloudflare R2 is not configured')
  await getR2Client(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  )
}

export async function readR2Key(key: string): Promise<Buffer | null> {
  const cfg = getR2MediaConfig()
  if (!cfg) return null
  try {
    const res = await getR2Client(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
    return Buffer.from(await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray())
  } catch {
    return null
  }
}

async function deleteR2Key(key: string): Promise<void> {
  const cfg = getR2MediaConfig()
  if (!cfg) return
  try {
    await getR2Client(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
  } catch {
    /* leftover part is hidden from the art library */
  }
}

/** Store one piece of a large art upload. The browser cannot PUT to R2 without bucket CORS. */
export async function storeMerchArtPart(
  uploadId: string,
  index: number,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  await putR2Key(partKey(uploadId, index), bytes, contentType)
}

/** Join stored pieces into one art object and remove the pieces. */
export async function assembleMerchArtParts(
  uploadId: string,
  total: number,
  id: string,
  contentType: string,
): Promise<{ id: string; url: string }> {
  const parts: Buffer[] = []
  for (let index = 0; index < total; index += 1) {
    const part = await readR2Key(partKey(uploadId, index))
    if (!part) throw new Error('Upload is missing a piece. Try again.')
    parts.push(part)
  }
  const stored = await putR2Art(id, Buffer.concat(parts), contentType)
  await Promise.all(parts.map((_, index) => deleteR2Key(partKey(uploadId, index))))
  return stored
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

const PRINTFUL_INDEX_KEY = 'merch/_meta/printful-generated.json'

/** Art ids saved from Printful mockup tasks. Hidden from the art library listing. */
export async function readPrintfulGeneratedArtIds(): Promise<string[]> {
  const raw = await readR2Key(PRINTFUL_INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as { ids?: unknown }
    if (!Array.isArray(parsed.ids)) return []
    return parsed.ids
      .filter((id): id is string => typeof id === 'string' && ART_ID.test(id))
      .map((id) => id.toLowerCase())
  } catch {
    return []
  }
}

/** Remember mockup files so they stay out of My uploads after a newer photo replaces them. */
export async function rememberPrintfulGeneratedArtIds(ids: string[]): Promise<void> {
  const next = new Set(await readPrintfulGeneratedArtIds())
  for (const id of ids) {
    const clean = id.toLowerCase()
    if (ART_ID.test(clean)) next.add(clean)
  }
  if (next.size === 0) return
  await putR2Key(
    PRINTFUL_INDEX_KEY,
    Buffer.from(JSON.stringify({ ids: [...next] })),
    'application/json',
  )
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

import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { createHash, randomUUID } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase'
import { merchArtIdsFromUrls, withArtVersion } from '@/lib/merch/art-url'
import { listDesigns } from '@/lib/merch/design-store'
import { isLegacyPrintfulMockupJpeg } from '@/lib/merch/printful-mockup-jpeg'
import {
  deleteR2Art,
  fetchR2Art,
  fetchR2ArtPrefix,
  isR2ArtConfigured,
  listR2Art,
  putR2Art,
  putR2Key,
  r2ArtExists,
  r2ArtPublicUrl,
  readPrintfulGeneratedArtIds,
  readR2Key,
  rememberPrintfulGeneratedArtIds,
} from '@/lib/merch/r2-art'

const BUCKET = 'gallery-images'

function artDir() {
  return join(process.cwd(), 'data', 'merch-art')
}

export function artFilePath(id: string) {
  return join(artDir(), id)
}

type ArtLibraryIndex = { hashes: Record<string, string>; printIds: string[] }

const LIBRARY_INDEX_KEY = 'merch/_meta/art-library.json'

function libraryIndexPath() {
  return join(artDir(), '_library.json')
}

function emptyLibraryIndex(): ArtLibraryIndex {
  return { hashes: {}, printIds: [] }
}

function parseLibraryIndex(raw: string): ArtLibraryIndex {
  try {
    const parsed = JSON.parse(raw) as { hashes?: unknown; printIds?: unknown }
    const hashes: Record<string, string> = {}
    if (parsed.hashes && typeof parsed.hashes === 'object') {
      for (const [hash, id] of Object.entries(parsed.hashes)) {
        if (typeof id === 'string' && isMerchArtId(id)) hashes[hash] = id.toLowerCase()
      }
    }
    const printIds = Array.isArray(parsed.printIds)
      ? parsed.printIds.filter((id): id is string => typeof id === 'string' && isMerchArtId(id)).map((id) => id.toLowerCase())
      : []
    return { hashes, printIds }
  } catch {
    return emptyLibraryIndex()
  }
}

async function readLibraryIndex(): Promise<ArtLibraryIndex> {
  if (isR2ArtConfigured()) {
    const raw = await readR2Key(LIBRARY_INDEX_KEY)
    if (raw) return parseLibraryIndex(raw.toString('utf8'))
  }
  try {
    return parseLibraryIndex(await readFile(libraryIndexPath(), 'utf8'))
  } catch {
    return emptyLibraryIndex()
  }
}

async function writeLibraryIndex(index: ArtLibraryIndex): Promise<void> {
  const body = Buffer.from(JSON.stringify(index))
  if (isR2ArtConfigured()) {
    try {
      await putR2Key(LIBRARY_INDEX_KEY, body, 'application/json')
      return
    } catch (error) {
      console.error('merch art library index:', error)
    }
  }
  await mkdir(artDir(), { recursive: true })
  await writeFile(libraryIndexPath(), body)
}

function artUrlForId(id: string): string {
  return r2ArtPublicUrl(id) || `/api/merch/art/${id}`
}

async function artObjectExists(id: string): Promise<boolean> {
  if (isR2ArtConfigured() && (await r2ArtExists(id))) return true
  try {
    await stat(artFilePath(id))
    return true
  } catch {
    return false
  }
}

function rememberBytes(index: ArtLibraryIndex, id: string, bytes: Buffer, origin?: 'user' | 'printful' | 'print') {
  const hash = createHash('sha256').update(bytes).digest('hex')
  const key = id.toLowerCase()
  for (const [existingHash, existingId] of Object.entries(index.hashes)) {
    if (existingId === key) delete index.hashes[existingHash]
  }
  if (!index.hashes[hash]) index.hashes[hash] = key
  if (origin === 'print' && !index.printIds.includes(key)) index.printIds.push(key)
}

function forgetArtFromIndex(index: ArtLibraryIndex, id: string) {
  const key = id.toLowerCase()
  for (const [hash, existingId] of Object.entries(index.hashes)) {
    if (existingId === key) delete index.hashes[hash]
  }
  index.printIds = index.printIds.filter((item) => item !== key)
}

export async function storeMerchArt(
  bytes: Buffer,
  contentType: string,
  options?: { origin?: 'user' | 'printful' | 'print' },
): Promise<{ id: string; url: string }> {
  const hash = createHash('sha256').update(bytes).digest('hex')
  const index = await readLibraryIndex()
  const existingId = index.hashes[hash]
  if (existingId && (await artObjectExists(existingId))) {
    return { id: existingId, url: artUrlForId(existingId) }
  }
  if (existingId) forgetArtFromIndex(index, existingId)

  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
  const id = `${randomUUID()}.${ext}`
  let stored: { id: string; url: string } | null = null

  // Primary backend: Cloudflare R2.
  if (isR2ArtConfigured()) {
    try {
      stored = await putR2Art(id, bytes, contentType)
    } catch (error) {
      console.error('merch art R2 upload:', error)
    }
  }

  // Fallback: Supabase Storage (legacy).
  if (!stored) {
    try {
      const supabase = createSupabaseServerClient()
      const path = `merch-designs/${id}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType,
        upsert: true,
      })
      if (!error) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
        if (data.publicUrl) stored = { id, url: data.publicUrl }
      }
    } catch (error) {
      console.error('merch art storage upload:', error)
    }
  }

  if (!stored) {
    await mkdir(artDir(), { recursive: true })
    await writeFile(artFilePath(id), bytes)
    stored = { id, url: `/api/merch/art/${id}` }
  }

  if (options?.origin === 'printful') {
    try {
      await rememberPrintfulGeneratedArtIds([stored.id])
    } catch (error) {
      console.error('merch printful art index:', error)
    }
  }
  try {
    rememberBytes(index, stored.id, bytes, options?.origin)
    await writeLibraryIndex(index)
  } catch (error) {
    console.error('merch art library index:', error)
  }
  return stored
}

/** Overwrites one library file. The id and public path stay the same. */
export async function replaceMerchArt(
  id: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ id: string; url: string }> {
  if (!isMerchArtId(id)) throw new Error('Save edit can only replace a library file')

  // Primary backend: Cloudflare R2 (same id → same object key, so URLs are stable).
  if (isR2ArtConfigured()) {
    try {
      const stored = await putR2Art(id, bytes, contentType)
      await noteReplacedArtBytes(id, bytes)
      return { id, url: withArtVersion(stored.url, Date.now()) }
    } catch (error) {
      console.error('merch art R2 replace:', error)
    }
  }

  try {
    const supabase = createSupabaseServerClient()
    const path = `merch-designs/${id}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    })
    if (!error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      if (data.publicUrl) {
        try {
          await mkdir(artDir(), { recursive: true })
          await writeFile(artFilePath(id), bytes)
        } catch {
          /* local copy is optional */
        }
        await noteReplacedArtBytes(id, bytes)
        return { id, url: data.publicUrl }
      }
    } else {
      console.error('merch art storage replace:', error.message)
    }
  } catch (error) {
    console.error('merch art storage replace:', error)
  }

  try {
    await mkdir(artDir(), { recursive: true })
    await writeFile(artFilePath(id), bytes)
    await noteReplacedArtBytes(id, bytes)
    return { id, url: `/api/merch/art/${id}` }
  } catch (error) {
    console.error('merch art local replace:', error)
    throw new Error('Could not replace that artwork')
  }
}

async function noteReplacedArtBytes(id: string, bytes: Buffer) {
  try {
    const index = await readLibraryIndex()
    rememberBytes(index, id, bytes)
    await writeLibraryIndex(index)
  } catch (error) {
    console.error('merch art library index:', error)
  }
}

const UPLOAD_ID = /^[0-9a-f-]{36}\.(png|jpg)$/i

export function isMerchArtId(id: string): boolean {
  return UPLOAD_ID.test(id)
}

/** Hide a stored print file from My uploads. The bytes are already in storage. */
export async function rememberPrintArtId(id: string): Promise<void> {
  if (!isMerchArtId(id)) return
  const index = await readLibraryIndex()
  const key = id.toLowerCase()
  if (index.printIds.includes(key)) return
  index.printIds.push(key)
  await writeLibraryIndex(index)
}

export type MerchArtOrigin = 'user' | 'printful'

export type MerchArtUpload = {
  id: string
  url: string
  label: string
  createdAt: string
  /** Printful mockup photos are stored as art, but they are not the user's uploads. */
  origin: MerchArtOrigin
}

async function libraryArtSets(): Promise<{ printful: Set<string>; assets: Set<string> }> {
  const printful = new Set<string>()
  const assets = new Set<string>()
  try {
    for (const id of await readPrintfulGeneratedArtIds()) printful.add(id.toLowerCase())
  } catch (error) {
    console.error('merch printful art index:', error)
  }
  try {
    const designs = await listDesigns()
    for (const design of designs) {
      for (const id of merchArtIdsFromUrls(design.mockupUrls || [])) printful.add(id)
      for (const urls of Object.values(design.mockupUrlsByColor || {})) {
        for (const id of merchArtIdsFromUrls(urls)) printful.add(id)
      }
      for (const urls of Object.values(design.mockupPendingByColor || {})) {
        for (const id of merchArtIdsFromUrls(urls)) printful.add(id)
      }
      for (const placement of design.placements || []) {
        for (const id of merchArtIdsFromUrls([placement.assetUrl])) assets.add(id)
      }
    }
  } catch (error) {
    console.error('merch printful art from designs:', error)
  }
  return { printful, assets }
}

async function readArtPrefix(id: string): Promise<Buffer | null> {
  if (isR2ArtConfigured()) {
    const fromR2 = await fetchR2ArtPrefix(id)
    if (fromR2) return fromR2
  }
  try {
    const bytes = await readFile(artFilePath(id))
    return bytes.subarray(0, 65536)
  } catch {
    return null
  }
}

/**
 * Mockup photos are newer and more numerous than source art. Keep the user's
 * files even when a short list would otherwise be filled by those photos.
 */
export function prioritizeUserUploads(items: MerchArtUpload[], limit = 48): MerchArtUpload[] {
  const ranked = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const users = ranked.filter((item) => item.origin !== 'printful').slice(0, limit)
  const generated = ranked.filter((item) => item.origin === 'printful').slice(0, limit)
  return [...users, ...generated]
}

export async function listMerchArtUploads(limit = 48): Promise<MerchArtUpload[]> {
  const { printful: printfulIds, assets: assetIds } = await libraryArtSets()
  const originFor = (id: string): MerchArtOrigin => (printfulIds.has(id.toLowerCase()) ? 'printful' : 'user')
  const byId = new Map<string, MerchArtUpload>()

  // Primary backend: Cloudflare R2.
  try {
    const items = await listR2Art(1000)
    for (const item of items) {
      byId.set(item.id, {
        id: item.id,
        url: withArtVersion(item.url, item.createdAt),
        label: item.id.slice(0, 8),
        createdAt: item.createdAt,
        origin: originFor(item.id),
      })
    }
  } catch (error) {
    console.error('merch art R2 list:', error)
  }

  // Legacy backend: only consult Supabase when R2 is unavailable (post-migration
  // R2 is the source of truth; this avoids duplicate/stale entries).
  if (!isR2ArtConfigured()) {
    try {
      const supabase = createSupabaseServerClient()
      const { data, error } = await supabase.storage.from(BUCKET).list('merch-designs', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      })
      if (!error && data) {
        for (const item of data) {
          if (!item.name || !UPLOAD_ID.test(item.name)) continue
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(`merch-designs/${item.name}`)
          if (!pub.publicUrl) continue
          const createdAt = item.updated_at || item.created_at || new Date(0).toISOString()
          byId.set(item.name, {
            id: item.name,
            url: withArtVersion(pub.publicUrl, createdAt),
            label: item.name.slice(0, 8),
            createdAt,
            origin: originFor(item.name),
          })
        }
      }
    } catch (error) {
      console.error('merch art storage list:', error)
    }
  }

  try {
    const dir = artDir()
    await mkdir(dir, { recursive: true })
    const names = await readdir(dir)
    for (const name of names) {
      if (!UPLOAD_ID.test(name)) continue
      const fileStat = await stat(join(dir, name))
      const existing = byId.get(name)
      const createdAt = fileStat.mtime.toISOString()
      if (existing && existing.createdAt >= createdAt) continue
      byId.set(name, {
        id: name,
        url: withArtVersion(`/api/merch/art/${name}`, createdAt),
        label: name.slice(0, 8),
        createdAt,
        origin: originFor(name),
      })
    }
  } catch {
    /* local art dir is optional */
  }

  const discovered: string[] = []
  for (const item of byId.values()) {
    const id = item.id.toLowerCase()
    if (item.origin === 'printful' || assetIds.has(id) || !id.endsWith('.jpg')) continue
    const prefix = await readArtPrefix(item.id)
    if (!prefix || !isLegacyPrintfulMockupJpeg(prefix, item.id)) continue
    item.origin = 'printful'
    discovered.push(id)
  }
  if (discovered.length > 0) {
    rememberPrintfulGeneratedArtIds(discovered).catch((error) => {
      console.error('merch printful art index:', error)
    })
  }

  let printIds = new Set<string>()
  try {
    printIds = new Set((await readLibraryIndex()).printIds)
  } catch (error) {
    console.error('merch art library index:', error)
  }

  return prioritizeUserUploads(
    [...byId.values()].filter((item) => !printIds.has(item.id.toLowerCase())),
    limit,
  )
}

export async function deleteMerchArt(id: string): Promise<boolean> {
  if (!isMerchArtId(id)) return false
  let removed = false
  if (isR2ArtConfigured()) {
    try {
      if (await deleteR2Art(id)) removed = true
    } catch (error) {
      console.error('merch art R2 delete:', error)
    }
  }
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.storage.from(BUCKET).remove([`merch-designs/${id}`])
    if (!error) removed = true
    else console.error('merch art storage delete:', error.message)
  } catch (error) {
    console.error('merch art storage delete:', error)
  }
  try {
    await unlink(artFilePath(id))
    removed = true
  } catch {
    /* local copy is optional */
  }
  if (removed) {
    try {
      const index = await readLibraryIndex()
      forgetArtFromIndex(index, id)
      await writeLibraryIndex(index)
    } catch (error) {
      console.error('merch art library index:', error)
    }
  }
  return removed
}

export async function readLocalMerchArt(id: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!/^[0-9a-f-]{36}\.(png|jpg)$/i.test(id)) return null
  try {
    const bytes = await readFile(artFilePath(id))
    return {
      bytes,
      contentType: id.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    }
  } catch {
    return null
  }
}

/**
 * Read an art object for the same-origin proxy route: Cloudflare R2 first, then
 * the local fallback directory. Used to serve `/api/merch/art/:id`.
 */
export async function readMerchArt(id: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!/^[0-9a-f-]{36}\.(png|jpg)$/i.test(id)) return null
  if (isR2ArtConfigured()) {
    const fromR2 = await fetchR2Art(id)
    if (fromR2) return fromR2
  }
  return readLocalMerchArt(id)
}

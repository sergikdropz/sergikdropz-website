import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase'
import { withArtVersion } from '@/lib/merch/art-url'

const BUCKET = 'gallery-images'

function artDir() {
  return join(process.cwd(), 'data', 'merch-art')
}

export function artFilePath(id: string) {
  return join(artDir(), id)
}

export async function storeMerchArt(
  bytes: Buffer,
  contentType: string
): Promise<{ id: string; url: string }> {
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
  const id = `${randomUUID()}.${ext}`

  try {
    const supabase = createSupabaseServerClient()
    const path = `merch-designs/${id}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    })
    if (!error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      if (data.publicUrl) return { id, url: data.publicUrl }
    }
  } catch (error) {
    console.error('merch art storage upload:', error)
  }

  await mkdir(artDir(), { recursive: true })
  await writeFile(artFilePath(id), bytes)
  return { id, url: `/api/merch/art/${id}` }
}

/** Overwrites one library file. The id and public path stay the same. */
export async function replaceMerchArt(
  id: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ id: string; url: string }> {
  if (!isMerchArtId(id)) throw new Error('Save edit can only replace a library file')

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
    return { id, url: `/api/merch/art/${id}` }
  } catch (error) {
    console.error('merch art local replace:', error)
    throw new Error('Could not replace that artwork')
  }
}

const UPLOAD_ID = /^[0-9a-f-]{36}\.(png|jpg)$/i

export function isMerchArtId(id: string): boolean {
  return UPLOAD_ID.test(id)
}

export type MerchArtUpload = {
  id: string
  url: string
  label: string
  createdAt: string
}

export async function listMerchArtUploads(limit = 48): Promise<MerchArtUpload[]> {
  const byId = new Map<string, MerchArtUpload>()

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
        })
      }
    }
  } catch (error) {
    console.error('merch art storage list:', error)
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
      })
    }
  } catch {
    /* local art dir is optional */
  }

  return [...byId.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export async function deleteMerchArt(id: string): Promise<boolean> {
  if (!isMerchArtId(id)) return false
  let removed = false
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

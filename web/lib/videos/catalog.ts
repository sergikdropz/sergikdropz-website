import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { VIDEOS_CATALOG_KEY } from '@/lib/site-settings-keys'
import { normalizeCatalog } from '@/lib/videos/catalog-model'
import { DEFAULT_YOUTUBE_CHANNEL, type VideoCatalog } from '@/lib/videos/types'

export type CatalogSource = 'settings' | 'json'

export function resolveVideosJsonPath(): string {
  const candidates = [
    join(process.cwd(), 'data', 'videos.json'),
    join(process.cwd(), 'web', 'data', 'videos.json'),
  ]
  return candidates.find((path) => existsSync(path)) || candidates[0]
}

async function loadCatalogFromJson(): Promise<VideoCatalog> {
  const content = await readFile(resolveVideosJsonPath(), 'utf-8')
  return normalizeCatalog(JSON.parse(content))
}

async function loadCatalogFromSettings(): Promise<VideoCatalog | null> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', VIDEOS_CATALOG_KEY)
      .maybeSingle()

    if (error || data?.value == null) return null
    const catalog = normalizeCatalog(data.value)
    return catalog.videos.length > 0 ? catalog : null
  } catch {
    return null
  }
}

export async function loadVideoCatalog(): Promise<{ catalog: VideoCatalog; source: CatalogSource }> {
  const fromSettings = await loadCatalogFromSettings()
  if (fromSettings) return { catalog: fromSettings, source: 'settings' }

  try {
    return { catalog: await loadCatalogFromJson(), source: 'json' }
  } catch {
    return { catalog: { videos: [], youtube_channel: DEFAULT_YOUTUBE_CHANNEL }, source: 'json' }
  }
}

async function saveCatalogToJson(catalog: VideoCatalog): Promise<boolean> {
  try {
    await writeFile(resolveVideosJsonPath(), `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8')
    return true
  } catch {
    return false
  }
}

async function saveCatalogToSettings(catalog: VideoCatalog, updatedBy?: string): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('settings').upsert(
      {
        key: VIDEOS_CATALOG_KEY,
        value: catalog,
        description: 'YouTube catalog shown on the public /videos page',
        updated_by: updatedBy || null,
      },
      { onConflict: 'key' },
    )
    return !error
  } catch {
    return false
  }
}

export async function saveVideoCatalog(
  catalog: VideoCatalog,
  updatedBy?: string,
): Promise<{ saved: boolean; file: boolean; settings: boolean }> {
  const normalized = normalizeCatalog(catalog)
  const [file, settings] = await Promise.all([
    saveCatalogToJson(normalized),
    saveCatalogToSettings(normalized, updatedBy),
  ])
  return { saved: file || settings, file, settings }
}

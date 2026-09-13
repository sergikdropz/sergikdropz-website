import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { supabaseIsReachable } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'

type MosaicTile = { id: string; src: string; alt: string }

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)$/i

/**
 * GET /api/music-library/mosaic-covers
 * Public cover pool for the site background mosaic (ingested folder art + public releases).
 */
export async function GET() {
  const tiles: MosaicTile[] = []
  const seen = new Set<string>()

  const push = (id: string, raw: string | null | undefined, alt: string, bust?: number) => {
    if (!raw) return
    const base = resolveImageUrl(raw).split('?')[0]
    if (!base || seen.has(base)) return
    seen.add(base)
    tiles.push({
      id,
      src: bust ? `${base}?v=${bust}` : base,
      alt,
    })
  }

  // 1) Files written by artwork upload API (always on disk for local/home)
  try {
    const dir = join(process.cwd(), 'public', 'images', 'audio', 'artwork')
    const files = await readdir(dir)
    for (const file of files) {
      if (!IMAGE_EXT.test(file)) continue
      const full = join(dir, file)
      let mtime = Date.now()
      try {
        mtime = (await stat(full)).mtimeMs
      } catch {
        /* ignore */
      }
      const id = file.replace(/\.[^.]+$/, '')
      push(`fs-${id}`, `/images/audio/artwork/${file}`, 'Album cover art', Math.floor(mtime))
    }
  } catch {
    /* directory may not exist yet */
  }

  // 2) DB folder covers (public, non-archived) — names for better alt text
  if (await supabaseIsReachable()) {
    try {
      const supabase = createSupabaseServerClient()
      const { data } = await supabase
        .from('music_library_folders')
        .select('id, name, artwork_url, type, hidden, is_archived')
        .not('artwork_url', 'is', null)
        .or('is_archived.is.null,is_archived.eq.false')
        .in('type', ['ep', 'album', 'single', 'remix', 'folder'])
        .limit(200)

      for (const row of data || []) {
        if (row.hidden) continue
        push(`folder-${row.id}`, row.artwork_url, `${row.name || 'Album'} cover art`)
      }
    } catch (err) {
      console.error('[mosaic-covers] folder query failed', err)
    }
  }

  return NextResponse.json(
    { tiles, count: tiles.length },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=120',
      },
    },
  )
}

import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { normalizeReleaseKey } from '@/lib/ep-cover-art'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { supabaseIsReachable } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'

type MosaicTile = { id: string; src: string; alt: string; rank: number }

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)$/i

/**
 * GET /api/music-library/mosaic-covers
 * Public cover pool for the site background mosaic (ingested folder art + public releases).
 * One tile per path and per release label; DB folder rows beat filesystem scans.
 */
export async function GET() {
  const candidates: MosaicTile[] = []

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
      const stem = file.replace(/\.[^.]+$/, '')
      const folderMatch = stem.match(/^folder-(.+)$/i)
      const id = folderMatch ? `fs-folder-${folderMatch[1]}` : `fs-${stem}`
      const base = resolveImageUrl(`/images/audio/artwork/${file}`).split('?')[0]
      if (!base) continue
      candidates.push({
        id,
        src: `${base}?v=${Math.floor(mtime)}`,
        alt: 'Album cover art',
        rank: 1,
      })
    }
  } catch {
    /* directory may not exist yet */
  }

  // 2) DB folder covers (public, non-archived) — names for better alt text; higher rank
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
        const base = resolveImageUrl(String(row.artwork_url || '')).split('?')[0]
        if (!base) continue
        candidates.push({
          id: `folder-${row.id}`,
          src: base,
          alt: `${row.name || 'Album'} cover art`,
          rank: 3,
        })
      }
    } catch (err) {
      console.error('[mosaic-covers] folder query failed', err)
    }
  }

  const byPath = new Map<string, MosaicTile>()
  const byRelease = new Map<string, MosaicTile>()

  for (const tile of candidates) {
    const base = tile.src.split('?')[0]
    const releaseKey = normalizeReleaseKey(tile.alt) || `src:${base}`

    const prevPath = byPath.get(base)
    if (!prevPath || tile.rank > prevPath.rank) byPath.set(base, tile)

    const prevRelease = byRelease.get(releaseKey)
    if (!prevRelease || tile.rank > prevRelease.rank) byRelease.set(releaseKey, tile)
  }

  // Union of winners: prefer release-keyed winners, then any remaining unique paths
  const tiles: Array<{ id: string; src: string; alt: string }> = []
  const seenPath = new Set<string>()
  const seenId = new Set<string>()

  for (const tile of byRelease.values()) {
    const base = tile.src.split('?')[0]
    if (seenPath.has(base) || seenId.has(tile.id)) continue
    seenPath.add(base)
    seenId.add(tile.id)
    tiles.push({ id: tile.id, src: tile.src, alt: tile.alt })
  }
  for (const tile of byPath.values()) {
    const base = tile.src.split('?')[0]
    if (seenPath.has(base) || seenId.has(tile.id)) continue
    seenPath.add(base)
    seenId.add(tile.id)
    tiles.push({ id: tile.id, src: tile.src, alt: tile.alt })
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

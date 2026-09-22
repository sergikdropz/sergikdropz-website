#!/usr/bin/env node
/**
 * Scan local SERGIK export WAVs and ingest distribution masters into
 * Cloudflare R2 under audio/dsp-masters/{release}/{ISRC}-{title}.wav
 *
 * Creates the Music Vault "DSP Masters" folder and links distribution_tracks.wav_url.
 * Does NOT run Sonic DNA — reuses existing DB DNA and only duration-checks the match.
 *
 * Usage:
 *   cd web && npx tsx scripts/ingest-dsp-masters.ts              # dry-run
 *   cd web && npx tsx scripts/ingest-dsp-masters.ts --apply
 *   cd web && npx tsx scripts/ingest-dsp-masters.ts --apply --force
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { closeSync, openSync, readSync } from 'fs'
import {
  buildDspMasterMatches,
  defaultDspMasterScanRoots,
  scanDspMasterSources,
} from '../lib/studio/dsp-masters'
import {
  approxWavDurationSeconds,
  durationsAgree,
  ingestDspMaster,
} from '../lib/studio/dsp-masters-ingest-server'

config({ path: '.env.local' })

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit?.slice(prefix.length)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const force = process.argv.includes('--force')
  const exportsRoot = argValue('exports')
  const distrokidDownloads = argValue('distrokid')
  const albumMasters = argValue('album-masters')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const roots = defaultDspMasterScanRoots({
    exportsRoot,
    distrokidDownloads,
    albumReleaseMasters: albumMasters,
  })
  console.log(`Scanning WAV sources:\n  ${roots.join('\n  ')}`)
  console.log('Mode: upload + link only (reuse DB Sonic DNA; duration-verify match)\n')
  const sources = scanDspMasterSources(roots)
  console.log(`Indexed ${sources.length} WAV file(s)\n`)

  const { data: releases, error: releaseErr } = await supabase
    .from('distribution_releases')
    .select('id, title, album_artist')
    .order('title')
  if (releaseErr) {
    console.error('Failed to load releases:', releaseErr.message)
    process.exit(1)
  }

  const { data: tracks, error: trackErr } = await supabase
    .from('distribution_tracks')
    .select('id, title, isrc_full, wav_url, release_id, music_library_track_id, duration')
    .order('title')
  if (trackErr) {
    console.error('Failed to load tracks:', trackErr.message)
    process.exit(1)
  }

  const vaultIds = [
    ...new Set(
      (tracks || [])
        .map((t) => t.music_library_track_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ]
  const vaultDuration = new Map<string, number>()
  if (vaultIds.length) {
    const { data: vaultRows } = await supabase
      .from('music_library_tracks')
      .select('id, duration')
      .in('id', vaultIds)
    for (const row of vaultRows || []) {
      if (typeof row.duration === 'number' && row.duration > 0) {
        vaultDuration.set(String(row.id), row.duration)
      }
    }
  }

  const releaseById = new Map((releases || []).map((r) => [r.id, r]))
  const work = (tracks || []).map((t) => {
    const release = releaseById.get(t.release_id as string)
    const vaultId =
      typeof t.music_library_track_id === 'string' ? t.music_library_track_id : null
    const knownDuration =
      typeof t.duration === 'number' && t.duration > 0
        ? t.duration
        : vaultId
          ? vaultDuration.get(vaultId) ?? null
          : null
    return {
      distributionTrackId: String(t.id),
      musicLibraryTrackId: vaultId,
      releaseTitle: String(release?.title || 'Unknown Release'),
      trackTitle: String(t.title || 'Untitled'),
      isrc: typeof t.isrc_full === 'string' ? t.isrc_full : null,
      artist: typeof release?.album_artist === 'string' ? release.album_artist : 'Sergik',
      currentWav: typeof t.wav_url === 'string' ? t.wav_url : null,
      knownDuration,
    }
  })

  const matches = buildDspMasterMatches(
    sources,
    work.map((w) => ({
      releaseTitle: w.releaseTitle,
      trackTitle: w.trackTitle,
      isrc: w.isrc,
    })),
  )

  let matched = 0
  let missing = 0
  let alreadyDsp = 0
  let verifyFail = 0

  console.log(
    `${'status'.padEnd(10)} ${'release'.padEnd(22)} ${'track'.padEnd(28)} ${'isrc'.padEnd(14)} verify → source`,
  )
  console.log('-'.repeat(120))

  for (let i = 0; i < matches.length; i++) {
    const row = matches[i]
    const meta = work[i]
    const onDsp = meta.currentWav && /\/dsp-masters\//i.test(meta.currentWav)
    if (onDsp) alreadyDsp++

    if (!row.hit || !row.relativeR2Path) {
      missing++
      console.log(
        `${'MISSING'.padEnd(10)} ${row.releaseTitle.slice(0, 22).padEnd(22)} ${row.trackTitle.slice(0, 28).padEnd(28)} ${(row.isrc || '—').padEnd(14)} —`,
      )
      continue
    }

    matched++
    let verifyLabel = 'n/a'
    try {
      const fd = openSync(row.hit.absPath, 'r')
      const head = Buffer.alloc(64 * 1024)
      readSync(fd, head, 0, head.length, 0)
      closeSync(fd)
      const wavDur = approxWavDurationSeconds(head)
      const ok = durationsAgree(wavDur, meta.knownDuration)
      if (meta.knownDuration != null && wavDur != null) {
        verifyLabel = ok
          ? `ok ${wavDur}s≈${meta.knownDuration}s`
          : `MISMATCH wav=${wavDur}s db=${meta.knownDuration}s`
        if (!ok) verifyFail++
      } else if (wavDur != null) {
        verifyLabel = `wav ${wavDur}s`
      }
    } catch {
      verifyLabel = 'unreadable'
    }

    const src = row.hit.fileName
    const mb = (row.hit.sizeBytes / (1024 * 1024)).toFixed(0)
    console.log(
      `${(onDsp && !force ? 'ON-DSP' : 'MATCH').padEnd(10)} ${row.releaseTitle.slice(0, 22).padEnd(22)} ${row.trackTitle.slice(0, 28).padEnd(28)} ${(row.isrc || '—').padEnd(14)} ${verifyLabel} | ${src} (${mb}MB)`,
    )

    if (!apply) continue
    if (onDsp && !force) continue

    const result = await ingestDspMaster(supabase, {
      hit: row.hit,
      releaseTitle: row.releaseTitle,
      trackTitle: row.trackTitle,
      isrc: row.isrc,
      artist: meta.artist,
      distributionTrackId: meta.distributionTrackId,
      musicLibraryTrackId: meta.musicLibraryTrackId,
      knownDurationSec: meta.knownDuration,
      skipIfAlreadyOnDspMasters: !force,
      verifyDuration: true,
    })
    console.log(
      `  → ${result.status}${result.message ? ` (${result.message})` : ''} vault=${result.music_library_track_id || '—'}`,
    )
  }

  console.log('\nSummary')
  console.log(`  studio tracks : ${work.length}`)
  console.log(`  matched WAV   : ${matched}`)
  console.log(`  missing       : ${missing}`)
  console.log(`  already dsp   : ${alreadyDsp}`)
  console.log(`  verify fail   : ${verifyFail}`)
  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to upload to R2 and link tracks.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

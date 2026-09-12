/**
 * Force every active library track beat-grid phase to 0 ms systemically:
 * music_library_tracks + audio_files DNA + sonic_dna_cache.
 *
 * Usage (from web/):
 *   node --env-file=.env.local scripts/reset-all-beat-grids-to-zero.mjs
 *   DRY_RUN=true node --env-file=.env.local scripts/reset-all-beat-grids-to-zero.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true'
const PAGE = Math.max(20, Number(process.env.PAGE_SIZE || 40) || 40)
const FORCE = String(process.env.FORCE || 'true').toLowerCase() !== 'false'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function stampZeroGridDna(sonicDna) {
  let base = {}
  try {
    if (sonicDna && typeof sonicDna === 'object' && !Array.isArray(sonicDna)) {
      base = JSON.parse(JSON.stringify(sonicDna))
    }
  } catch {
    base = {}
  }
  const measured =
    base.measured && typeof base.measured === 'object' && !Array.isArray(base.measured)
      ? { ...base.measured }
      : {}
  measured.gridOffsetSec = 0
  measured.gridManual = true
  base.measured = measured
  base.gridManual = true
  return base
}

async function fetchLibraryPage(from) {
  const to = from + PAGE - 1
  const { data, error } = await supabase
    .from('music_library_tracks')
    .select('id, audio_file_id, beat_grid_offset, sonic_dna')
    .or('is_archived.is.null,is_archived.eq.false')
    .order('id', { ascending: true })
    .range(from, to)
  if (error) throw new Error(error.message)
  return data || []
}

async function updateWithRetry(table, payload, matchColumn, matchValue, attempts = 3) {
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.from(table).update(payload).eq(matchColumn, matchValue)
    if (!error) return null
    lastError = error
    await new Promise((r) => setTimeout(r, 200 * (i + 1)))
  }
  return lastError
}

async function main() {
  console.log(
    DRY_RUN
      ? '[DRY RUN] counting/planning only'
      : `[APPLY] writing beat grids to 0 ms (FORCE=${FORCE})`,
  )

  let from = 0
  let scanned = 0
  let libraryUpdated = 0
  let librarySkipped = 0
  let audioUpdated = 0
  let cacheUpdated = 0
  let cacheUpserted = 0
  const touchedAudio = new Set()
  const errors = []

  for (;;) {
    const rows = await fetchLibraryPage(from)
    if (!rows.length) break
    scanned += rows.length

    for (const row of rows) {
      const alreadyZero =
        typeof row.beat_grid_offset === 'number' && Math.abs(row.beat_grid_offset) < 1e-9
      const alreadyManual =
        row.sonic_dna &&
        typeof row.sonic_dna === 'object' &&
        (row.sonic_dna.gridManual === true ||
          (row.sonic_dna.measured && row.sonic_dna.measured.gridManual === true))
      const dnaPhase =
        row.sonic_dna &&
        typeof row.sonic_dna === 'object' &&
        row.sonic_dna.measured &&
        typeof row.sonic_dna.measured.gridOffsetSec === 'number'
          ? row.sonic_dna.measured.gridOffsetSec
          : null
      const dnaAlreadyZero =
        dnaPhase != null && Number.isFinite(dnaPhase) && Math.abs(dnaPhase) < 1e-9

      if (!FORCE && alreadyZero && alreadyManual && dnaAlreadyZero) {
        librarySkipped += 1
        continue
      }

      const dna = stampZeroGridDna(row.sonic_dna)
      if (DRY_RUN) {
        libraryUpdated += 1
        if (row.audio_file_id) touchedAudio.add(row.audio_file_id)
        continue
      }

      const now = new Date().toISOString()
      const libErr = await updateWithRetry(
        'music_library_tracks',
        { beat_grid_offset: 0, sonic_dna: dna, updated_at: now },
        'id',
        row.id,
      )
      if (libErr) {
        errors.push(`library ${row.id}: ${libErr.message}`)
        continue
      }
      libraryUpdated += 1

      const cachePayload = { sonic_dna: dna, updated_at: now }
      const { error: cacheErr } = await supabase
        .from('sonic_dna_cache')
        .update(cachePayload)
        .eq('track_id', row.id)
      if (cacheErr) {
        const { error: upsertErr } = await supabase.from('sonic_dna_cache').upsert(
          {
            track_id: row.id,
            audio_file_id: row.audio_file_id || null,
            sonic_dna: dna,
            updated_at: now,
          },
          { onConflict: 'track_id' },
        )
        if (upsertErr) errors.push(`cache ${row.id}: ${upsertErr.message}`)
        else cacheUpserted += 1
      } else {
        cacheUpdated += 1
      }

      if (row.audio_file_id && !touchedAudio.has(row.audio_file_id)) {
        touchedAudio.add(row.audio_file_id)
        const { data: audio, error: audioReadErr } = await supabase
          .from('audio_files')
          .select('id, sonic_dna')
          .eq('id', row.audio_file_id)
          .maybeSingle()
        if (audioReadErr) {
          errors.push(`audio-read ${row.audio_file_id}: ${audioReadErr.message}`)
        } else if (audio?.id) {
          const audioDna = stampZeroGridDna(audio.sonic_dna)
          const audioErr = await updateWithRetry(
            'audio_files',
            { sonic_dna: audioDna, updated_at: now },
            'id',
            audio.id,
          )
          if (audioErr) errors.push(`audio ${audio.id}: ${audioErr.message}`)
          else audioUpdated += 1
        }
      }
    }

    console.log(
      `… scanned ${scanned} (updated ${libraryUpdated}, skipped ${librarySkipped}, errors ${errors.length})`,
    )
    if (rows.length < PAGE) break
    from += PAGE
  }

  // Verify
  let nonzero = null
  let manualCount = null
  if (!DRY_RUN) {
    const { data: verifyRows, error: verifyErr } = await supabase
      .from('music_library_tracks')
      .select('beat_grid_offset, sonic_dna')
      .or('is_archived.is.null,is_archived.eq.false')
      .limit(1000)
    if (!verifyErr && verifyRows) {
      nonzero = verifyRows.filter(
        (r) => !(typeof r.beat_grid_offset === 'number' && Math.abs(r.beat_grid_offset) < 1e-9),
      ).length
      manualCount = verifyRows.filter((r) => r.sonic_dna?.gridManual === true).length
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        force: FORCE,
        scanned,
        libraryUpdated,
        librarySkipped,
        audioUpdated: DRY_RUN ? touchedAudio.size : audioUpdated,
        cacheUpdated,
        cacheUpserted,
        verifyNonzero: nonzero,
        verifyGridManual: manualCount,
        errors: errors.slice(0, 30),
        errorCount: errors.length,
      },
      null,
      2,
    ),
  )

  if (!DRY_RUN && nonzero != null && nonzero > 0) {
    process.exitCode = 2
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

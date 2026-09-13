/**
 * Backfill musical keys (e.g. "E Major") and camelot values from Sonic DNA
 * Targets: audio_files + music_library_tracks
 *
 * Usage:
 *  NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node web/scripts/backfill-keys-from-sonic-dna.mjs
 *
 * Optional:
 *  DRY_RUN=true  (no writes)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const BATCH_SIZE = 250

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const isCamelot = (value) => typeof value === 'string' && /^[0-9]{1,2}[AB]$/i.test(value.trim())

const extractKeyFromDna = (dna) => {
  if (!dna) return null
  const key =
    dna?.harmony?.keySignature ||
    dna?.musical?.keySignature ||
    dna?.comprehensive?.harmony?.keySignature ||
    dna?.technical?.key?.key ||
    dna?.comprehensive?.technical?.key?.key ||
    dna?.key?.key ||
    dna?.analysis?.key ||
    null
  if (!key || key === 'Unknown') return null
  return String(key).trim()
}

const extractCamelotFromDna = (dna) => {
  if (!dna) return null
  const camelot = dna?.harmony?.camelot || dna?.technical?.camelot || null
  if (!camelot || camelot === 'Unknown') return null
  return String(camelot).trim()
}

const fetchDnaFromUrl = async (url) => {
  if (!url) return null
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

const deriveFromSonicDna = async (sonicDna, sonicDnaUrl) => {
  let dna = sonicDna
  if (typeof dna === 'string') dna = safeJsonParse(dna)
  if (!dna && sonicDnaUrl) {
    dna = await fetchDnaFromUrl(sonicDnaUrl)
  }
  if (!dna) return { key: null, camelot: null }
  return {
    key: extractKeyFromDna(dna),
    camelot: extractCamelotFromDna(dna),
  }
}

const shouldUpdateKey = (currentKey, extractedKey) => {
  if (!extractedKey) return false
  if (!currentKey || currentKey === 'Unknown') return true
  if (isCamelot(currentKey)) return true
  return false
}

const updateRow = async (table, id, updates) => {
  if (DRY_RUN) return { data: null, error: null }
  return await supabase.from(table).update(updates).eq('id', id)
}

const processAudioFiles = async () => {
  console.log('🔎 Backfilling audio_files...')
  let offset = 0
  let updated = 0
  let scanned = 0
  const audioKeyMap = new Map()

  while (true) {
    const { data, error } = await supabase
      .from('audio_files')
      .select('id, sonic_dna, sonic_dna_json_url, key_signature, metadata')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      scanned += 1
      const { key, camelot } = await deriveFromSonicDna(row.sonic_dna, row.sonic_dna_json_url)
      audioKeyMap.set(row.id, { key, camelot })
      if (!shouldUpdateKey(row.key_signature, key) && !camelot) continue

      const nextMeta = typeof row.metadata === 'object' && row.metadata ? { ...row.metadata } : {}
      if (key) nextMeta.key_signature = key
      if (camelot) nextMeta.camelot = camelot

      const updates = {
        ...(shouldUpdateKey(row.key_signature, key) ? { key_signature: key } : {}),
        metadata: nextMeta,
      }

      const { error: updateError } = await updateRow('audio_files', row.id, updates)
      if (updateError) {
        console.warn('audio_files update failed:', row.id, updateError.message)
      } else {
        updated += 1
      }
    }

    offset += data.length
  }

  console.log(`✅ audio_files scanned: ${scanned}, updated: ${updated}`)
  return audioKeyMap
}

const processMusicLibraryTracks = async (audioKeyMap) => {
  console.log('🔎 Backfilling music_library_tracks...')
  let offset = 0
  let updated = 0
  let scanned = 0

  while (true) {
    const { data, error } = await supabase
      .from('music_library_tracks')
      .select('id, audio_file_id, sonic_dna, key_signature, metadata')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      scanned += 1
      let derived = { key: null, camelot: null }
      if (row.sonic_dna) {
        derived = await deriveFromSonicDna(row.sonic_dna, null)
      } else if (row.audio_file_id && audioKeyMap.has(row.audio_file_id)) {
        derived = audioKeyMap.get(row.audio_file_id)
      }

      if (!shouldUpdateKey(row.key_signature, derived.key) && !derived.camelot) continue

      const nextMeta = typeof row.metadata === 'object' && row.metadata ? { ...row.metadata } : {}
      if (derived.key) nextMeta.key_signature = derived.key
      if (derived.camelot) nextMeta.camelot = derived.camelot

      const updates = {
        ...(shouldUpdateKey(row.key_signature, derived.key) ? { key_signature: derived.key } : {}),
        metadata: nextMeta,
      }

      const { error: updateError } = await updateRow('music_library_tracks', row.id, updates)
      if (updateError) {
        console.warn('music_library_tracks update failed:', row.id, updateError.message)
      } else {
        updated += 1
      }
    }

    offset += data.length
  }

  console.log(`✅ music_library_tracks scanned: ${scanned}, updated: ${updated}`)
}

const main = async () => {
  console.log(`⚙️  Backfill keys (DRY_RUN=${DRY_RUN})`)
  const audioKeyMap = await processAudioFiles()
  await processMusicLibraryTracks(audioKeyMap)
  console.log('✅ Done')
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err)
  process.exit(1)
})

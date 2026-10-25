/**
 * Audit music_library_tracks.file_url against the linked audio_files row.
 * A stored URL that names a different song is rewritten to the catalog file.
 *
 *   cd web && npx tsx scripts/audit-vault-file-urls.ts
 *   cd web && npx tsx scripts/audit-vault-file-urls.ts --apply
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { classifyVaultFileAlignment, fileStem } from '@/lib/audio/catalog-playback-file'
import { normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'

function loadEnvFile(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'))

type TrackRow = {
  id: string
  title: string | null
  file_url: string | null
  audio_file_id: string | null
  folder_id: string | null
  is_archived: boolean | null
}

type AudioRow = {
  id: string
  file_path: string | null
  file_url: string | null
  file_name: string | null
}

const PAGE = 1000

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env is missing')
  const supabase = createClient(url, key)

  const tracks: TrackRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('music_library_tracks')
      .select('id, title, file_url, audio_file_id, folder_id, is_archived')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    tracks.push(...((data || []) as TrackRow[]))
    if (!data || data.length < PAGE) break
  }

  const audioIds = [...new Set(tracks.map((t) => t.audio_file_id).filter(Boolean))] as string[]
  const audioById = new Map<string, AudioRow>()
  for (let i = 0; i < audioIds.length; i += 200) {
    const slice = audioIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('audio_files')
      .select('id, file_path, file_url, file_name')
      .in('id', slice)
    if (error) throw new Error(error.message)
    for (const row of (data || []) as AudioRow[]) audioById.set(row.id, row)
  }

  const counts = { keep: 0, replace: 0, review: 0, archived: 0 }
  const byReason = new Map<string, number>()
  const replacements: Array<{
    id: string
    title: string
    from: string
    to: string
    catalog: string
  }> = []
  const reviews: Array<{ id: string; title: string; reason: string; file: string; catalog: string }> = []
  const stemOwners = new Map<string, Array<{ id: string; title: string }>>()

  for (const track of tracks) {
    if (track.is_archived) {
      counts.archived++
      continue
    }
    const audio = track.audio_file_id ? audioById.get(track.audio_file_id) : undefined
    const verdict = classifyVaultFileAlignment({
      title: track.title,
      libraryFileUrl: track.file_url,
      audioFilePath: audio?.file_path,
      audioFileUrl: audio?.file_url,
    })
    counts[verdict.action]++
    byReason.set(verdict.reason, (byReason.get(verdict.reason) || 0) + 1)

    const stem = fileStem(track.file_url || '')
    if (stem) {
      const owners = stemOwners.get(stem) || []
      owners.push({ id: track.id, title: track.title || track.id })
      stemOwners.set(stem, owners)
    }

    if (verdict.action === 'replace' && verdict.nextSource) {
      const next = normalizeVaultAudioUrl(verdict.nextSource)
      if (!next || fileStem(next) === fileStem(track.file_url || '')) continue
      replacements.push({
        id: track.id,
        title: track.title || track.id,
        from: fileStem(track.file_url || ''),
        to: fileStem(next),
        catalog: verdict.nextSource,
      })
      if (apply) {
        const { error } = await supabase
          .from('music_library_tracks')
          .update({ file_url: next })
          .eq('id', track.id)
        if (error) throw new Error(`${track.id}: ${error.message}`)
      }
    } else if (verdict.action === 'review') {
      reviews.push({
        id: track.id,
        title: track.title || track.id,
        reason: verdict.reason,
        file: fileStem(track.file_url || ''),
        catalog: fileStem(audio?.file_path || audio?.file_url || ''),
      })
    }
  }

  const shared = [...stemOwners.entries()]
    .filter(([, owners]) => new Set(owners.map((o) => o.title.toLowerCase())).size > 1)
    .map(([stem, owners]) => ({
      stem,
      titles: [...new Set(owners.map((o) => o.title))],
    }))
    .sort((a, b) => b.titles.length - a.titles.length)

  const { data: distRows, error: distErr } = await supabase
    .from('distribution_tracks')
    .select('id, title, wav_url, music_library_track_id, release_id')
  if (distErr) throw new Error(distErr.message)
  const trackById = new Map(tracks.map((t) => [t.id, t]))
  const distributionCopies: Array<{ id: string; title: string; from: string; to: string }> = []
  for (const row of distRows || []) {
    const linked = row.music_library_track_id ? trackById.get(row.music_library_track_id) : undefined
    if (!linked || linked.is_archived) continue
    const audio = linked.audio_file_id ? audioById.get(linked.audio_file_id) : undefined
    const verdict = classifyVaultFileAlignment({
      title: row.title || linked.title,
      libraryFileUrl: row.wav_url,
      audioFilePath: audio?.file_path,
      audioFileUrl: audio?.file_url,
    })
    if (verdict.action !== 'replace' || !verdict.nextSource) continue
    const next = normalizeVaultAudioUrl(verdict.nextSource)
    if (!next || fileStem(next) === fileStem(row.wav_url || '')) continue
    distributionCopies.push({
      id: row.id,
      title: row.title || linked.title || row.id,
      from: fileStem(row.wav_url || ''),
      to: fileStem(next),
    })
    if (apply) {
      const { error } = await supabase.from('distribution_tracks').update({ wav_url: next }).eq('id', row.id)
      if (error) throw new Error(`${row.id}: ${error.message}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        tracks: tracks.length,
        archived: counts.archived,
        live: tracks.length - counts.archived,
        keep: counts.keep,
        replace: replacements.length,
        review: reviews.length,
        reasons: Object.fromEntries(byReason),
        sharedFileUrls: shared.slice(0, 40),
        distributionCopies,
        replacements,
        reviews: reviews.slice(0, 40),
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

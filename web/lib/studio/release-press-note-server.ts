import type { SupabaseClient } from '@supabase/supabase-js'
import { generateChatReply } from '@/lib/admin-ai'
import {
  buildPressNoteBrief,
  buildPressNotePrompt,
  lyricsFromTranscription,
  parsePressNoteReply,
  type PressNoteSibling,
} from '@/lib/studio/release-press-note'
import {
  enrichDistributionTracksWithVaultIdentity,
  writeDistributionTrackIdentity,
} from '@/lib/studio/vault-import-server'
import { displayArtistLine, parseContributors } from '@/lib/studio/track-credits'
import type { StudioTrackIdentity } from '@/lib/studio/vault-import'

const MAX_AUDIO_BYTES = 24 * 1024 * 1024

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function isHttpAudioUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && !value.startsWith('pending://')
}

export async function transcribeTrackAudio(audioUrl: string | null | undefined): Promise<{
  lyrics: string | null
  vocalStatus: 'lyrics' | 'instrumental' | 'unknown'
}> {
  const url = clean(audioUrl)
  if (!isHttpAudioUrl(url)) {
    return { lyrics: null, vocalStatus: 'unknown' }
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { lyrics: null, vocalStatus: 'unknown' }
  }

  try {
    const audioRes = await fetch(url, { redirect: 'follow' })
    if (!audioRes.ok) return { lyrics: null, vocalStatus: 'unknown' }
    const buffer = Buffer.from(await audioRes.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) {
      return { lyrics: null, vocalStatus: 'unknown' }
    }
    const type = audioRes.headers.get('content-type') || 'audio/mpeg'
    const ext = type.includes('wav') ? 'wav' : type.includes('mp4') || type.includes('m4a') ? 'm4a' : 'mp3'
    const blob = new Blob([buffer], { type })
    const upstream = new FormData()
    upstream.append('model', 'whisper-1')
    upstream.append(
      'prompt',
      'Transcribe sung or spoken lyrics only. If the recording is instrumental or unintelligible vocal chops, return INSTRUMENTAL.',
    )
    upstream.append('file', blob, `listen.${ext}`)

    const whisper = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    })
    const body = (await whisper.json().catch(() => ({}))) as { text?: string }
    if (!whisper.ok) return { lyrics: null, vocalStatus: 'unknown' }
    return lyricsFromTranscription(body.text)
  } catch {
    return { lyrics: null, vocalStatus: 'unknown' }
  }
}

export async function writeAiPressNotesForRelease(
  supabase: SupabaseClient,
  releaseId: string,
  opts?: { trackId?: string | null; listen?: boolean },
) {
  const { data: release, error: releaseError } = await supabase
    .from('distribution_releases')
    .select('id, title, label_name')
    .eq('id', releaseId)
    .maybeSingle()
  if (releaseError) throw new Error(releaseError.message)
  if (!release) throw new Error('Release not found')

  const { data: rows, error: trackError } = await supabase
    .from('distribution_tracks')
    .select('*')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })
  if (trackError) throw new Error(trackError.message)

  const tracks = await enrichDistributionTracksWithVaultIdentity(
    supabase,
    (rows || []) as Array<Record<string, unknown>>,
  )
  const targets = opts?.trackId
    ? tracks.filter((track) => track.id === opts.trackId)
    : tracks
  if (!targets.length) throw new Error('No tracks to write')

  const listen = opts?.listen !== false
  const siblings: PressNoteSibling[] = tracks
    .filter((track) => track.id !== opts?.trackId)
    .map((track) => ({
      title: String(track.title || 'Untitled'),
      description: track.identity?.description || null,
    }))

  const results: Array<{
    trackId: string
    title: string
    description: string
    intention: string | null
    vocalStatus: 'lyrics' | 'instrumental' | 'unknown'
  }> = []

  for (const track of targets) {
    const audioUrl =
      (typeof track.wav_url === 'string' && track.wav_url) ||
      (typeof track.file_url === 'string' && track.file_url) ||
      null
    const listenResult = listen
      ? await transcribeTrackAudio(audioUrl)
      : { lyrics: null as string | null, vocalStatus: 'unknown' as const }

    const vaultId = typeof track.music_library_track_id === 'string' ? track.music_library_track_id : ''
    let sonicDna: unknown = null
    if (vaultId) {
      const { data: vault } = await supabase
        .from('music_library_tracks')
        .select('sonic_dna, audio_file_id')
        .eq('id', vaultId)
        .maybeSingle()
      sonicDna = vault?.sonic_dna || null
      if (!sonicDna && vault?.audio_file_id) {
        const { data: audio } = await supabase
          .from('audio_files')
          .select('sonic_dna')
          .eq('id', vault.audio_file_id)
          .maybeSingle()
        sonicDna = audio?.sonic_dna || null
      }
    }

    const brief = buildPressNoteBrief({
      title: String(track.title || 'Untitled'),
      releaseTitle: String(release.title || 'Untitled release'),
      artist: displayArtistLine(
        parseContributors(track.contributors),
        typeof release.label_name === 'string' ? release.label_name : 'SERGIK',
      ),
      identity: track.identity,
      sonicDna,
      lyrics: listenResult.lyrics,
      vocalStatus: listenResult.vocalStatus,
      siblings,
    })

    const generated = await generateChatReply(buildPressNotePrompt(brief), {
      skillId: 'studio_release',
      honestyMode: 'strict',
      pageContextPrompt:
        'Copywriting only. Do not call tools or mention /exec. Return a single JSON object.',
    })
    const note = parsePressNoteReply(generated.reply)
    const identity: StudioTrackIdentity = {
      ...track.identity,
      description: note.description,
      intention: note.intention,
      lyrics_excerpt: listenResult.lyrics,
      press_source: 'ai-listen',
    }
    await writeDistributionTrackIdentity(supabase, String(track.id), identity)

    const written = {
      trackId: String(track.id),
      title: brief.title,
      description: note.description,
      intention: note.intention,
      vocalStatus: listenResult.vocalStatus,
    }
    results.push(written)
    siblings.push({ title: written.title, description: written.description })
  }

  return {
    releaseId,
    releaseTitle: String(release.title || ''),
    count: results.length,
    notes: results,
  }
}

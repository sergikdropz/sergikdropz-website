/**
 * SoundCloud EP upload packet.
 * Audio and artwork come from database file URLs only:
 * distribution_tracks.wav_url, then the linked music_library_tracks.file_url,
 * then audio_files.file_url. Local drive paths are ignored.
 */

export const SOUNDCLOUD_UPLOAD_URL = 'https://soundcloud.com/upload'

export type SoundCloudAudioSource =
  | 'distribution_tracks.wav_url'
  | 'music_library_tracks.file_url'
  | 'audio_files.file_url'

export type SoundCloudPlaylistType = 'ep' | 'album' | 'single' | 'playlist'

export type SoundCloudUploadTrack = {
  track_number: number
  title: string
  artist: string
  featuring: string
  /** File URL stored in the database. Never a local disk path. */
  audio_url: string
  audio_source: SoundCloudAudioSource
  description: string
}

export type SoundCloudUploadPacket = {
  ok: boolean
  blockers: string[]
  warnings: string[]
  artist: string
  title: string
  playlist_type: SoundCloudPlaylistType
  genre: string
  tags: string[]
  description: string
  artwork_url: string
  sharing: 'public'
  tracks: SoundCloudUploadTrack[]
}

export type SoundCloudUploadInput = {
  title?: string | null
  artist?: string | null
  type?: string | null
  genre?: string | null
  subgenre?: string | null
  description?: string | null
  artwork_url?: string | null
  tracks: Array<{
    track_number?: number | null
    title?: string | null
    artist?: string | null
    featuring?: string | null
    audio_url?: string | null
    audio_source?: SoundCloudAudioSource | null
    description?: string | null
  }>
}

const SOUNDCLOUD_GENRES = [
  'Alternative Rock',
  'Ambient',
  'Classical',
  'Country',
  'Dance & EDM',
  'Dancehall',
  'Deep House',
  'Disco',
  'Drum & Bass',
  'Dubstep',
  'Electronic',
  'Folk & Singer-Songwriter',
  'Hip-hop & Rap',
  'House',
  'Indie',
  'Jazz & Blues',
  'Latin',
  'Metal',
  'Piano',
  'Pop',
  'R&B & Soul',
  'Reggae',
  'Reggaeton',
  'Rock',
  'Soundtrack',
  'Techno',
  'Trance',
  'Trap',
  'Triphop',
  'World',
] as const

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/** http(s) or a storage/vault path saved on a row. Not a laptop file path. */
export function isDatabaseMediaReference(value: string | null | undefined): boolean {
  const text = clean(value)
  if (!text || text.length > 2000) return false
  if (/^file:/i.test(text)) return false
  if (/^\/Users\/|^\/home\/|^\/Volumes\/|^[A-Za-z]:[\\/]/.test(text)) return false
  if (/^https?:\/\//i.test(text)) return true
  if (text.startsWith('/api/audio/media/') || text.startsWith('/audio/')) return true
  if (text.startsWith('/') && !text.startsWith('//')) return false
  return /^[\w./%+-]+$/.test(text) && /\.[a-z0-9]{2,5}$/i.test(text.split('?')[0] || '')
}

export function pickDatabaseAudioUrl(row: {
  wavUrl?: string | null
  libraryFileUrl?: string | null
  audioFileUrl?: string | null
}): { url: string; source: SoundCloudAudioSource } | null {
  const wav = clean(row.wavUrl)
  if (isDatabaseMediaReference(wav)) return { url: wav, source: 'distribution_tracks.wav_url' }
  const library = clean(row.libraryFileUrl)
  if (isDatabaseMediaReference(library)) return { url: library, source: 'music_library_tracks.file_url' }
  const audio = clean(row.audioFileUrl)
  if (isDatabaseMediaReference(audio)) return { url: audio, source: 'audio_files.file_url' }
  return null
}

export function mapSoundCloudGenre(genre: string | null | undefined, subgenre: string | null | undefined): string {
  const blob = `${clean(genre)} ${clean(subgenre)}`.toLowerCase()
  if (/deep house|soulful house|funky house/.test(blob)) return 'Deep House'
  if (/\bhouse\b/.test(blob)) return 'House'
  if (/techno/.test(blob)) return 'Techno'
  if (/hip[- ]?hop|\brap\b/.test(blob)) return 'Hip-hop & Rap'
  if (/drum.?n.?bass|\bdnb\b|jungle/.test(blob)) return 'Drum & Bass'
  if (/disco/.test(blob)) return 'Disco'
  if (/trance/.test(blob)) return 'Trance'
  if (/dubstep/.test(blob)) return 'Dubstep'
  if (/\btrap\b/.test(blob)) return 'Trap'
  if (/ambient/.test(blob)) return 'Ambient'
  if (/dance|edm/.test(blob)) return 'Dance & EDM'
  if (/electronic/.test(blob)) return 'Electronic'
  const exact = SOUNDCLOUD_GENRES.find((item) => item.toLowerCase() === clean(genre).toLowerCase())
  return exact || 'Electronic'
}

export function soundCloudPlaylistType(type: string | null | undefined, trackCount: number): SoundCloudPlaylistType {
  const token = clean(type).toLowerCase()
  if (/single/.test(token) || trackCount <= 1) return 'single'
  if (/album|\blp\b/.test(token)) return 'album'
  if (/ep/.test(token) || (trackCount >= 2 && trackCount <= 6)) return 'ep'
  return 'playlist'
}

export function soundCloudDisplayTitle(title: string, featuring: string): string {
  const name = clean(title)
  const feat = clean(featuring)
  if (!name) return ''
  if (!feat || new RegExp(feat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(name)) return name
  return `${name} (feat. ${feat})`
}

export function soundCloudTagLine(tags: string[]): string {
  return tags
    .map((tag) => (/\s/.test(tag) ? `"${tag.replace(/"/g, '')}"` : tag))
    .join(' ')
}

export function mediaFileExtension(url: string): string {
  const path = url.split('?')[0]?.split('#')[0] || ''
  const match = path.match(/\.([a-z0-9]{2,5})$/i)
  const ext = (match?.[1] || 'mp3').toLowerCase()
  if (['mp3', 'wav', 'flac', 'aiff', 'aif', 'm4a', 'aac', 'ogg'].includes(ext)) return ext === 'aif' ? 'aiff' : ext
  return 'mp3'
}

function uniqueTags(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const tag = clean(value).replace(/"/g, '')
    if (tag.length < 2 || tag.length > 30) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 8) break
  }
  return out
}

export function buildSoundCloudUploadPacket(input: SoundCloudUploadInput): SoundCloudUploadPacket {
  const blockers: string[] = []
  const warnings: string[] = []
  const title = clean(input.title)
  const artist = clean(input.artist) || 'SERGIK'
  const genre = mapSoundCloudGenre(input.genre, input.subgenre)
  const artwork = clean(input.artwork_url)
  if (!title) blockers.push('Release title is required.')
  if (!isDatabaseMediaReference(artwork)) {
    warnings.push('No artwork URL on the release row. SoundCloud will keep its default image until you add the database cover.')
  }

  const ordered = input.tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => (Number(a.track.track_number) || a.index + 1) - (Number(b.track.track_number) || b.index + 1))

  if (!ordered.length) blockers.push('This release has no tracks in the database.')

  const tracks: SoundCloudUploadTrack[] = []
  for (const { track, index } of ordered) {
    const trackNumber = Number(track.track_number) || index + 1
    const trackTitle = clean(track.title) || `Track ${trackNumber}`
    const picked = pickDatabaseAudioUrl({ wavUrl: track.audio_url })
    const audioUrl = picked?.url || ''
    const source = track.audio_source || picked?.source || 'distribution_tracks.wav_url'
    if (!audioUrl) {
      blockers.push(`${trackTitle}: no audio file URL in the database (wav_url, library file_url, or audio_files.file_url).`)
    }
    const featuring = clean(track.featuring)
    const display = soundCloudDisplayTitle(trackTitle, featuring)
    tracks.push({
      track_number: trackNumber,
      title: display,
      artist: clean(track.artist) || artist,
      featuring,
      audio_url: audioUrl,
      audio_source: source,
      description: clean(track.description) || `${display} — ${clean(track.artist) || artist}`,
    })
  }

  const playlistType = soundCloudPlaylistType(input.type, tracks.length)
  const descriptionBody = clean(input.description)
  const trackList = tracks.map((track) => `${track.track_number}. ${track.title}`).join('\n')
  const description = (descriptionBody || `${title || 'Untitled'} — ${genre} ${playlistType.toUpperCase()} by ${artist}.`).slice(0, 4000)
  const descriptionWithList =
    descriptionBody && /tracklist|^\s*\d+\.\s/im.test(descriptionBody)
      ? description
      : `${description}\n\n${trackList}`.trim().slice(0, 4000)

  const tags = uniqueTags([
    artist,
    genre,
    clean(input.subgenre),
    playlistType === 'ep' ? 'EP' : playlistType === 'album' ? 'Album' : playlistType === 'single' ? 'Single' : 'Playlist',
    title,
  ])

  return {
    ok: blockers.length === 0 && tracks.some((track) => track.audio_url),
    blockers,
    warnings,
    artist,
    title,
    playlist_type: playlistType,
    genre,
    tags,
    description: descriptionWithList,
    artwork_url: isDatabaseMediaReference(artwork) ? artwork : '',
    sharing: 'public',
    tracks,
  }
}

export function messageWantsSoundCloudUpload(message: string): boolean {
  const text = message.toLowerCase()
  if (!text.includes('soundcloud')) return false
  return /\b(upload|prefill|fill|publish|post)\b/.test(text)
}

export function soundcloudUploadAgentPayload(
  message: string,
  releaseId: string | null | undefined,
): { action: 'soundcloud_prefill'; releaseId?: string } | null {
  if (!messageWantsSoundCloudUpload(message)) return null
  const id = clean(releaseId)
  return id ? { action: 'soundcloud_prefill', releaseId: id } : { action: 'soundcloud_prefill' }
}

export function normalizeSoundCloudPacket(raw: unknown): SoundCloudUploadPacket | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (!Array.isArray(row.tracks) || typeof row.title !== 'string') return null
  const built = buildSoundCloudUploadPacket({
    title: row.title,
    artist: typeof row.artist === 'string' ? row.artist : '',
    type: typeof row.playlist_type === 'string' ? row.playlist_type : '',
    genre: typeof row.genre === 'string' ? row.genre : '',
    description: typeof row.description === 'string' ? row.description : '',
    artwork_url: typeof row.artwork_url === 'string' ? row.artwork_url : '',
    tracks: row.tracks.map((track) => {
      const item = (track && typeof track === 'object' ? track : {}) as Record<string, unknown>
      return {
        track_number: Number(item.track_number) || undefined,
        title: typeof item.title === 'string' ? item.title : '',
        artist: typeof item.artist === 'string' ? item.artist : '',
        featuring: typeof item.featuring === 'string' ? item.featuring : '',
        audio_url: typeof item.audio_url === 'string' ? item.audio_url : '',
        audio_source:
          item.audio_source === 'music_library_tracks.file_url' || item.audio_source === 'audio_files.file_url'
            ? item.audio_source
            : 'distribution_tracks.wav_url',
        description: typeof item.description === 'string' ? item.description : '',
      }
    }),
  })
  return built
}

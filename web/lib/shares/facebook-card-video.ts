import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import ShareOpenGraphImage from '@/app/s/[token]/opengraph-image'
import { createSupabaseServerClient } from '@/lib/supabase'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'
import { facebookCardIsPublished, facebookCardObjectPath, facebookCardPublicUrl } from '@/lib/shares/facebook-card'
import { readVaultAudio } from '@/lib/shares/share-download-bytes'
import { resolveShareByToken } from '@/lib/shares/share-service'

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString()
    })
    child.on('error', () => {
      reject(new Error('ffmpeg is not available on this machine'))
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim().slice(-500) || `ffmpeg exit ${code}`))
    })
  })
}

async function firstTrackAudio(token: string): Promise<{ bytes: Buffer; ext: 'mp3' | 'wav'; title: string }> {
  const payload = await resolveShareByToken(token, {
    includePlaybackUrls: true,
    playbackAllowed: true,
  })
  const track = payload?.tracks[0]
  if (!track) throw new Error('Nothing to play on this share')
  const source = track.file || track.playbackUrl || ''
  const rel =
    extractVaultRelativePath(source, { preferMp3: true }) ||
    extractVaultRelativePath(source, { preferMp3: false })
  if (!rel) throw new Error('The first track has no audio file')
  const bytes = await readVaultAudio(rel)
  if (!bytes?.byteLength) throw new Error('Could not read the first track')
  return { bytes, ext: rel.toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav', title: track.title }
}

/**
 * Still of the listen-page card plus the first track, uploaded where Facebook can play it.
 * Reuses an existing upload for this card version.
 */
export async function buildFacebookCardVideo(token: string): Promise<{ url: string; bytes: number; reused: boolean }> {
  const ready = await facebookCardIsPublished(token)
  if (ready) {
    const url = facebookCardPublicUrl(token) || facebookCardObjectPath(token)
    return { url, bytes: 0, reused: true }
  }

  const audio = await firstTrackAudio(token)
  const image = await ShareOpenGraphImage({ params: Promise.resolve({ token }) })
  const png = Buffer.from(await image.arrayBuffer())
  if (png.byteLength < 32) throw new Error('Could not draw the listen card')

  const dir = await mkdtemp(join(tmpdir(), 'sergik-fb-'))
  try {
    const cardPath = join(dir, 'card.png')
    const audioPath = join(dir, `audio.${audio.ext}`)
    const outPath = join(dir, 'card.mp4')
    await writeFile(cardPath, png)
    await writeFile(audioPath, audio.bytes)
    await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-loop',
      '1',
      '-framerate',
      '2',
      '-i',
      cardPath,
      '-i',
      audioPath,
      '-c:v',
      'libx264',
      '-tune',
      'stillimage',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      '-movflags',
      '+faststart',
      outPath,
    ])
    const mp4 = await readFile(outPath)
    if (mp4.byteLength < 1000) throw new Error('Facebook player video was empty')

    const supabase = createSupabaseServerClient()
    const path = facebookCardObjectPath(token)
    const { error } = await supabase.storage.from('audio-files').upload(path, mp4, {
      contentType: 'video/mp4',
      upsert: true,
      cacheControl: 'public, max-age=86400',
    })
    if (error) throw new Error(error.message || 'Could not publish the Facebook player')
    const url = facebookCardPublicUrl(token)
    if (!url) throw new Error('Supabase URL is not configured')
    return { url, bytes: mp4.byteLength, reused: false }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

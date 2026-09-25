/**
 * Website playback uses a 320 kbps MP3. Distribution keeps the original WAV
 * under dsp-masters/ so Release Studio can deliver a master later.
 */

import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export const STREAM_MP3_BITRATE = '320k'
export const DSP_LIBRARY_WAV_PREFIX = 'dsp-masters/library'

export function isWavFileName(name: string | null | undefined): boolean {
  return /\.wav$/i.test(String(name || '').split('?')[0])
}

/** Distribution should play the WAV master. Streaming file_url stays the MP3. */
export function distributionWavFromVault(vault: {
  file_url?: string | null
  metadata?: unknown
}): string | null {
  const meta =
    vault.metadata && typeof vault.metadata === 'object' && !Array.isArray(vault.metadata)
      ? (vault.metadata as Record<string, unknown>)
      : {}
  const stored = typeof meta.distribution_wav_url === 'string' ? meta.distribution_wav_url.trim() : ''
  if (stored) return stored
  const file = vault.file_url?.trim() || ''
  return file || null
}

export function planImportedAudio(opts: {
  fileName: string
  vaultRelativePath: string
}): {
  isWav: boolean
  streamRelativePath: string
  dspWavRelativePath: string | null
} {
  const rel = opts.vaultRelativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^audio\//i, '')
  const wav = isWavFileName(opts.fileName) || isWavFileName(rel)
  if (!wav) {
    return { isWav: false, streamRelativePath: rel, dspWavRelativePath: null }
  }

  const base = (rel.split('/').pop() || opts.fileName).replace(/\.mp3$/i, '.wav')
  const wavName = isWavFileName(base) ? base : `${base}.wav`
  const streamRelativePath = rel.replace(/\.wav$/i, '.mp3')
  const dspWavRelativePath = /^dsp-masters\//i.test(rel)
    ? rel.replace(/\.mp3$/i, '.wav')
    : `${DSP_LIBRARY_WAV_PREFIX}/${wavName}`

  return { isWav: true, streamRelativePath, dspWavRelativePath }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    ff.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString()
    })
    ff.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new Error('ffmpeg is not installed') : error)
    })
    ff.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `ffmpeg exit ${code}`))
    })
  })
}

/** LAME 320 kbps CBR. Sample rate and tags are kept from the source. */
export async function transcodeAudioToMp3(
  input: Buffer,
  opts?: { bitrate?: string },
): Promise<Buffer> {
  const bitrate = opts?.bitrate || STREAM_MP3_BITRATE
  const dir = await mkdtemp(join(tmpdir(), 'sergik-mp3-'))
  const inPath = join(dir, 'source.bin')
  const outPath = join(dir, 'stream.mp3')
  try {
    await writeFile(inPath, input)
    await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inPath,
      '-codec:a',
      'libmp3lame',
      '-b:a',
      bitrate,
      '-map_metadata',
      '0',
      '-id3v2_version',
      '3',
      outPath,
    ])
    return await readFile(outPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

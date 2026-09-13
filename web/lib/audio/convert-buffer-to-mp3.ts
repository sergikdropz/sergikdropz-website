import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'

export type Mp3BitrateMode = '320' | 'v0'

function sourceExt(fileName: string): string {
  const ext = extname(fileName || '').toLowerCase()
  if (ext && ext.length <= 8) return ext
  return '.wav'
}

function mp3NameFromSource(fileName: string): string {
  const base = (fileName || 'track').replace(/\.[^/.]+$/, '').trim() || 'track'
  return `${base}.mp3`
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })
    child.on('error', (err) => {
      reject(
        new Error(
          err.message.includes('ENOENT')
            ? 'ffmpeg not found. Install ffmpeg to convert oversized audio (e.g. brew install ffmpeg).'
            : err.message,
        ),
      )
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg failed (exit ${code}): ${stderr.trim() || 'unknown error'}`))
    })
  })
}

/**
 * Encode an audio buffer to high-quality MP3 via system ffmpeg (320k CBR by default).
 * Used when playlist drops exceed the direct upload size limit.
 */
export async function convertBufferToHighQualityMp3(
  buffer: Buffer,
  sourceFileName: string,
  opts?: { bitrate?: Mp3BitrateMode },
): Promise<{ buffer: Buffer; fileName: string; mimeType: 'audio/mpeg' }> {
  const bitrate = opts?.bitrate || '320'
  const dir = await mkdtemp(join(tmpdir(), 'sergik-mp3-'))
  const inPath = join(dir, `source${sourceExt(sourceFileName)}`)
  const outName = mp3NameFromSource(sourceFileName)
  const outPath = join(dir, outName)

  try {
    await writeFile(inPath, buffer)
    const args =
      bitrate === 'v0'
        ? ['-y', '-nostdin', '-i', inPath, '-vn', '-codec:a', 'libmp3lame', '-q:a', '0', outPath]
        : ['-y', '-nostdin', '-i', inPath, '-vn', '-codec:a', 'libmp3lame', '-b:a', '320k', outPath]
    await runFfmpeg(args)
    const out = await readFile(outPath)
    if (!out.length) throw new Error('ffmpeg produced an empty MP3')
    return { buffer: out, fileName: outName, mimeType: 'audio/mpeg' }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

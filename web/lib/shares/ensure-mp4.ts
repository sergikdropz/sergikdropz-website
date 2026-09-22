/**
 * Ensure Instagram-ready MPEG-4 (H.264) output.
 * MediaRecorder often yields WebM on Chromium — remux/transcode via ffmpeg.wasm.
 */

export function isMp4Blob(blob: Blob, mimeHint?: string): boolean {
  const type = String(blob.type || mimeHint || '').toLowerCase()
  return type.includes('mp4') || type.includes('mpeg4') || type.includes('m4v')
}

export function withMp4Filename(filename: string): string {
  const base = String(filename || 'story')
    .replace(/\.(webm|mkv|mov|avi)$/i, '')
    .replace(/\.mp4$/i, '')
  return `${base || 'story'}.mp4`
}

export type EnsureMp4Progress = (phase: string, ratio?: number) => void

let ffmpegSingleton: import('@ffmpeg/ffmpeg').FFmpeg | null = null
let ffmpegLoadPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null

async function loadFfmpeg(onProgress?: EnsureMp4Progress): Promise<import('@ffmpeg/ffmpeg').FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    onProgress?.('encoding', 0)
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')
    const ffmpeg = ffmpegSingleton ?? new FFmpeg()
    ffmpegSingleton = ffmpeg

    if (!ffmpeg.loaded) {
      // Single-thread core — no COOP/COEP / SharedArrayBuffer required.
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
    }
    return ffmpeg
  })()

  try {
    return await ffmpegLoadPromise
  } catch (err) {
    ffmpegLoadPromise = null
    throw err
  }
}

/**
 * Return an MP4 blob. Passthrough when already MPEG-4; otherwise transcode WebM → H.264/AAC.
 */
export async function ensureStoryMp4(
  blob: Blob,
  opts: { filename?: string; mimeType?: string; onProgress?: EnsureMp4Progress } = {},
): Promise<{ blob: Blob; mimeType: string; filename: string; converted: boolean }> {
  const filenameIn = opts.filename || 'story.mp4'
  if (isMp4Blob(blob, opts.mimeType)) {
    return {
      blob,
      mimeType: blob.type || 'video/mp4',
      filename: withMp4Filename(filenameIn),
      converted: false,
    }
  }

  if (typeof window === 'undefined') {
    throw new Error('MP4 conversion requires a browser')
  }

  const onProgress = opts.onProgress
  onProgress?.('encoding', 0.05)

  const ffmpeg = await loadFfmpeg(onProgress)
  const { fetchFile } = await import('@ffmpeg/util')

  const onLog = ({ message }: { message: string }) => {
    // ffmpeg progress lines: "time=00:00:03.20"
    const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message)
    if (m) {
      const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
      // 15s story → rough ratio (capped).
      onProgress?.('encoding', Math.min(0.95, 0.1 + sec / 20))
    }
  }
  ffmpeg.on('log', onLog)

  const inName = 'input.webm'
  const outName = 'output.mp4'
  try {
    await ffmpeg.writeFile(inName, await fetchFile(blob))
    onProgress?.('encoding', 0.12)
    const code = await ffmpeg.exec([
      '-i',
      inName,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-y',
      outName,
    ])
    if (code !== 0) {
      throw new Error(`ffmpeg exited with code ${code}`)
    }
    const data = await ffmpeg.readFile(outName)
    const bytes =
      data instanceof Uint8Array
        ? data
        : new TextEncoder().encode(String(data))
    // Copy into a fresh ArrayBuffer-backed view for Blob typing across TS targets.
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const out = new Blob([copy], { type: 'video/mp4' })
    onProgress?.('encoding', 1)
    return {
      blob: out,
      mimeType: 'video/mp4',
      filename: withMp4Filename(filenameIn),
      converted: true,
    }
  } finally {
    ffmpeg.off('log', onLog)
    try {
      await ffmpeg.deleteFile(inName)
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      /* ignore */
    }
  }
}

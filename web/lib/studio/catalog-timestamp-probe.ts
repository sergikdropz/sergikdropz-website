import { existsSync } from 'fs'
import path from 'path'
import { parseBuffer, parseFile } from 'music-metadata'
import { fetchR2Object } from '@/lib/audio/r2Media'
import { vaultRelativePathCandidates } from '@/lib/audio/vault-audio-extensions'
import { approxWavDurationSeconds } from '@/lib/studio/dsp-masters-ingest-server'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'
import { normalizeDurationSec } from '@/lib/studio/catalog-timestamps'

const LOCAL_AUDIO_ROOT = () => path.join(process.cwd(), 'public', 'audio')
const PROBE_BYTES = 2_500_000
const PROBE_TIMEOUT_MS = 12_000

function localAudioPath(relative: string): string | null {
  const root = LOCAL_AUDIO_ROOT()
  const filePath = path.resolve(root, relative)
  if (!filePath.startsWith(root + path.sep) && filePath !== root) return null
  return existsSync(filePath) ? filePath : null
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array> | null | undefined,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!stream) return null
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      const slice = value.byteLength + total > maxBytes ? value.subarray(0, maxBytes - total) : value
      chunks.push(Buffer.from(slice))
      total += slice.byteLength
    }
  } finally {
    try {
      reader.releaseLock()
      await stream.cancel()
    } catch {
      /* ignore */
    }
  }
  return chunks.length ? Buffer.concat(chunks) : null
}

async function durationFromBuffer(buffer: Buffer): Promise<number | null> {
  const wav = approxWavDurationSeconds(buffer)
  if (wav != null) return wav
  try {
    const meta = await parseBuffer(buffer)
    return normalizeDurationSec(meta.format.duration)
  } catch {
    return null
  }
}

/** Read length from the vault audio object when Catalog/Vault/DNA stored 0. */
export async function probeAudioDurationSec(fileUrl?: string | null): Promise<number | null> {
  const relative = extractVaultRelativePath(String(fileUrl || ''), { preferMp3: true })
  if (!relative) return null
  const candidates = vaultRelativePathCandidates(relative)

  for (const candidate of candidates) {
    const local = localAudioPath(candidate)
    if (!local) continue
    try {
      const meta = await parseFile(local, { duration: true })
      const seconds = normalizeDurationSec(meta.format.duration)
      if (seconds != null) return seconds
    } catch {
      /* try next */
    }
  }

  for (const candidate of candidates) {
    try {
      const object = await Promise.race([
        fetchR2Object(candidate, { method: 'GET', range: `bytes=0-${PROBE_BYTES - 1}` }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PROBE_TIMEOUT_MS)),
      ])
      if (!object?.body) continue
      const buffer = await streamToBuffer(object.body as ReadableStream<Uint8Array>, PROBE_BYTES)
      if (!buffer?.length) continue
      const seconds = await durationFromBuffer(buffer)
      if (seconds != null) return seconds
    } catch {
      /* try next extension */
    }
  }

  return null
}

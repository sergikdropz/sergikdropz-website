/**
 * Download audio + artwork from database URLs and attach them on soundcloud.com/upload.
 * Never clicks Save.
 */

import { mkdirSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { downloadArtworkDspReady, downloadWavToPath, type DistroKidUploadPage } from '@/lib/ai/distrokid-asset-upload'
import { mediaFileExtension, type SoundCloudUploadPacket } from '@/lib/ai/soundcloud-upload'

export type SoundCloudAssetUploadResult = {
  filled: string[]
  skipped: string[]
  errors: string[]
}

const FILE_ACTION_TIMEOUT_MS = 8_000
const DOWNLOAD_TIMEOUT_MS = 45_000
const INPUT_APPEAR_MS = 2_500
const TMP_RETAIN_MS = 45 * 60_000

const AUDIO_INPUT_SELECTORS = [
  'input[type="file"][accept*="audio"]',
  'input[type="file"][accept*="mp3"]',
  'input[type="file"][accept*="wav"]',
  'input[type="file"][multiple]',
  'input[type="file"]',
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || fallback
}

type FileLocator = {
  count: () => Promise<number>
  first: () => {
    setInputFiles: (files: string | string[], options?: { timeout?: number; force?: boolean }) => Promise<void>
  }
}

function fileLocator(page: DistroKidUploadPage, selector: string): FileLocator | null {
  const root = page.locator?.(selector) as (ReturnType<NonNullable<DistroKidUploadPage['locator']>> & Partial<FileLocator>) | undefined
  if (!root || typeof root.count !== 'function' || typeof root.first !== 'function') return null
  return root as FileLocator
}

async function firstPresentSelector(page: DistroKidUploadPage, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const loc = fileLocator(page, selector)
    if (!loc) continue
    const count = await loc.count().catch(() => 0)
    if (count > 0) return selector
  }
  return null
}

async function setFilesWhenPresent(
  page: DistroKidUploadPage,
  selectors: string[],
  files: string[],
): Promise<string | null> {
  for (const selector of selectors) {
    const loc = fileLocator(page, selector)
    if (!loc) continue
    const count = await loc.count().catch(() => 0)
    if (!count) continue
    try {
      await loc.first().setInputFiles(files, { timeout: FILE_ACTION_TIMEOUT_MS, force: true })
      return selector
    } catch {
      /* This input exists but rejected the files. Try the next selector. */
    }
  }
  return null
}

async function waitForAudioSelector(page: DistroKidUploadPage): Promise<string | null> {
  const deadline = Date.now() + INPUT_APPEAR_MS
  while (Date.now() < deadline) {
    const hit = await firstPresentSelector(page, AUDIO_INPUT_SELECTORS)
    if (hit) return hit
    await sleep(200)
  }
  return null
}

export type StagedSoundCloudFiles = {
  dir: string
  audioPaths: string[]
  artworkPath: string | null
  filled: string[]
  skipped: string[]
  errors: string[]
}

/** Fetch database audio and artwork before touching the browser, so the page mirror is not frozen. */
export async function stageSoundCloudFiles(packet: SoundCloudUploadPacket): Promise<StagedSoundCloudFiles> {
  const filled: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  const ready = packet.tracks.filter((track) => track.audio_url)
  const dir = path.join(tmpdir(), `sergik-sc-upload-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const downloaded = await Promise.all(
    ready.map(async (track) => {
      const ext = mediaFileExtension(track.audio_url)
      const dest = path.join(dir, `${String(track.track_number).padStart(2, '0')}-${safeFileName(track.title, 'track')}.${ext}`)
      try {
        await Promise.race([
          downloadWavToPath(track.audio_url, dest),
          sleep(DOWNLOAD_TIMEOUT_MS).then(() => {
            throw new Error('timed out downloading the database file')
          }),
        ])
        const stat = await fs.stat(dest)
        if (stat.size < 1000) throw new Error(`download too small (${stat.size} bytes)`)
        return {
          ok: true as const,
          path: dest,
          note: `Track ${track.track_number} file from ${track.audio_source} (${(stat.size / (1024 * 1024)).toFixed(1)}MB)`,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          ok: false as const,
          error: `Track ${track.track_number} download failed: ${message}`,
          skip: `${track.title} — ${track.audio_url}`,
        }
      }
    }),
  )
  const audioPaths: string[] = []
  for (const row of downloaded) {
    if (row.ok) {
      audioPaths.push(row.path)
      filled.push(row.note)
    } else {
      errors.push(row.error)
      skipped.push(row.skip)
    }
  }
  let artworkPath: string | null = null
  if (packet.artwork_url && audioPaths.length) {
    try {
      artworkPath = await Promise.race([
        downloadArtworkDspReady(packet.artwork_url, path.join(dir, safeFileName(packet.title || 'artwork', 'artwork'))),
        sleep(DOWNLOAD_TIMEOUT_MS).then(() => {
          throw new Error('timed out downloading artwork')
        }),
      ])
    } catch (err) {
      skipped.push(`Artwork download failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else if (!packet.artwork_url) {
    skipped.push('Artwork URL missing on the release row')
  }
  setTimeout(() => {
    void fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }, TMP_RETAIN_MS)
  return { dir, audioPaths, artworkPath, filled, skipped, errors }
}

export async function uploadSoundCloudAssets(
  page: DistroKidUploadPage,
  packet: SoundCloudUploadPacket,
  staged?: StagedSoundCloudFiles,
): Promise<SoundCloudAssetUploadResult> {
  const filled: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  const ready = packet.tracks.filter((track) => track.audio_url)
  if (!ready.length) {
    errors.push('No database audio URLs to attach.')
    return { filled, skipped, errors }
  }

  const files = staged ?? (await stageSoundCloudFiles(packet))
  filled.push(...files.filled)
  skipped.push(...files.skipped)
  errors.push(...files.errors)
  const localFiles = files.audioPaths
  if (!localFiles.length) return { filled, skipped, errors }

  try {
    page.setDefaultTimeout?.(FILE_ACTION_TIMEOUT_MS)
    const canCount = Boolean(fileLocator(page, 'input[type="file"]'))
    const readySelector = canCount ? await waitForAudioSelector(page) : null
    let selector = readySelector ? await setFilesWhenPresent(page, [readySelector], localFiles) : null
    if (!selector && !canCount && page.setInputFiles) {
      await page.setInputFiles('input[type="file"]', localFiles)
      selector = 'input[type="file"]'
    }
    if (!selector) {
      errors.push('SoundCloud file input was not on the page. Stay on soundcloud.com/upload while signed in.')
      return { filled, skipped, errors }
    }
    filled.push(`Attached ${localFiles.length} database file(s) to SoundCloud`)

    if (files.artworkPath) {
      const artSet = await setFilesWhenPresent(page, ['input[type="file"][accept*="image"]'], [files.artworkPath])
      if (artSet) filled.push('Artwork file from the release row')
      else skipped.push('Artwork stays on the release row until SoundCloud shows an image input.')
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return { filled, skipped, errors }
}

/**
 * Download Studio artwork + DSP WAV masters and attach them to DistroKid /new/
 * file inputs via Playwright setInputFiles. Never submits the DistroKid form.
 */

import { createWriteStream, existsSync, mkdirSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fetchR2Object } from '@/lib/audio/r2Media'
import { fetchArtworkBuffer, renderDspReadyJpeg } from '@/lib/studio/artwork-dsp'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'
import type { DistroKidPrefillPacket } from '@/lib/ai/distrokid-prefill'

export type DistroKidAssetUploadResult = {
  filled: string[]
  skipped: string[]
  errors: string[]
}

/** Playwright page handle — real Page exposes locator + long timeouts for 70MB+ WAVs. */
export type DistroKidUploadPage = {
  setDefaultTimeout?: (timeout: number) => void
  setInputFiles?: (selector: string, files: string | string[]) => Promise<void>
  waitForTimeout?: (ms: number) => Promise<void>
  evaluate?: (fn: (...args: never[]) => unknown, ...args: never[]) => Promise<unknown>
  locator?: (
    selector: string
  ) => {
    setInputFiles: (
      files: string | string[],
      options?: { timeout?: number; force?: boolean }
    ) => Promise<void>
    waitFor: (options?: { state?: 'attached' | 'visible'; timeout?: number }) => Promise<void>
    scrollIntoViewIfNeeded?: (options?: { timeout?: number }) => Promise<void>
  }
}

const FILE_ACTION_TIMEOUT_MS = 180_000
const TRACK_UPLOAD_SETTLE_MS = 4_000
const TMP_RETAIN_MS = 45 * 60_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || fallback
}

function localAudioPath(relative: string): string | null {
  const root = path.join(process.cwd(), 'public', 'audio')
  const filePath = path.resolve(root, relative)
  if (!filePath.startsWith(root + path.sep) && filePath !== root) return null
  return existsSync(filePath) ? filePath : null
}

async function downloadHttp(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow', headers: { Accept: '*/*' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(dest, buf)
}

export async function downloadWavToPath(wavUrl: string, dest: string): Promise<void> {
  const relative = extractVaultRelativePath(wavUrl, { preferMp3: false })
  if (relative) {
    const local = localAudioPath(relative)
    if (local) {
      await fs.copyFile(local, dest)
      return
    }
    const r2 = await fetchR2Object(relative, { method: 'GET' })
    if (r2?.body) {
      const body = r2.body as unknown as NodeJS.ReadableStream & { getReader?: () => unknown }
      if (typeof body.pipe === 'function') {
        await pipeline(body, createWriteStream(dest))
      } else {
        await pipeline(Readable.fromWeb(r2.body as import('stream/web').ReadableStream), createWriteStream(dest))
      }
      return
    }
  }

  if (/^https?:\/\//i.test(wavUrl)) {
    await downloadHttp(wavUrl, dest)
    return
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
    process.env.AUDIO_ORIGIN?.replace(/\/+$/, '') ||
    'http://127.0.0.1:3001'
  const abs = wavUrl.startsWith('/') ? `${origin}${wavUrl}` : `${origin}/${wavUrl}`
  await downloadHttp(abs, dest)
}

async function downloadArtworkDspReady(url: string, destBase: string): Promise<string> {
  const dest = `${destBase}.jpg`
  try {
    const { buffer } = await fetchArtworkBuffer(url)
    const rendered = await renderDspReadyJpeg(buffer)
    await fs.writeFile(dest, rendered.buffer)
    return dest
  } catch (normalizeErr) {
    const res = await fetch(url, { redirect: 'follow', headers: { Accept: 'image/*,*/*' } })
    if (!res.ok) throw new Error(`Artwork HTTP ${res.status} (${String(normalizeErr)})`)
    const buf = Buffer.from(await res.arrayBuffer())
    const sharp = (await import('sharp')).default
    const jpg = await sharp(buf).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    await fs.writeFile(dest, jpg)
    return dest
  }
}

async function waitForArtworkSettled(page: DistroKidUploadPage): Promise<{ ok: boolean; detail: string }> {
  if (!page.evaluate) return { ok: true, detail: 'no evaluate' }
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const state = (await page.evaluate(() => {
      const input = document.getElementById('artwork') as HTMLInputElement | null
      const val = (input?.value || '').toLowerCase()
      const preview =
        document.querySelector<HTMLImageElement>('#artworkPreview img, img.album-art, #albumArtPreview img') ||
        document.querySelector<HTMLImageElement>('img[src*="blob:"]')
      const blob = (document.body.textContent || '').replace(/\s+/g, ' ')
      const err = /cover art|artwork|image must|too small|too large|invalid.*(image|jpg|jpeg)/i.test(blob)
      const uploading = /uploading.*art|processing.*cover/i.test(blob)
      const hasFile = val.includes('.jpg') || val.includes('.jpeg') || val.includes('.png')
      const hasPreview = Boolean(preview?.src && !/blank|placeholder|data:,/i.test(preview.src))
      return { val, hasFile, hasPreview, uploading, err }
    })) as {
      val: string
      hasFile: boolean
      hasPreview: boolean
      uploading: boolean
      err: boolean
    }
    if (state.err) return { ok: false, detail: 'DistroKid rejected the cover image' }
    if ((state.hasFile || state.hasPreview) && !state.uploading) {
      return { ok: true, detail: state.val || 'cover bound' }
    }
    if (page.waitForTimeout) await page.waitForTimeout(500)
    else await sleep(500)
  }
  return { ok: false, detail: 'timed out waiting for DistroKid to accept cover art' }
}

function primarySelector(selectors: string): string {
  return selectors.split(',')[0]?.trim() || selectors
}

async function nudgeFileInputChange(page: DistroKidUploadPage, selector: string): Promise<void> {
  if (!page.evaluate) return
  const sel = primarySelector(selector)
  await page.evaluate(
    ((s: string) => {
      const el = document.querySelector(s) as HTMLInputElement | null
      if (!el) return
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      try {
        const w = window as unknown as {
          jQuery?: (el: HTMLElement) => { trigger: (e: string) => unknown }
        }
        if (typeof w.jQuery === 'function') w.jQuery(el).trigger('change')
      } catch {
        /* ignore */
      }
    }) as never,
    sel as never
  )
}

async function setFileOnInput(
  page: DistroKidUploadPage,
  selectors: string,
  filePath: string
): Promise<void> {
  const sel = primarySelector(selectors)
  const loc = page.locator?.(sel)
  if (loc) {
    await loc.waitFor({ state: 'attached', timeout: 60_000 })
    await loc.scrollIntoViewIfNeeded?.({ timeout: 30_000 }).catch(() => undefined)
    await loc.setInputFiles(filePath, { timeout: FILE_ACTION_TIMEOUT_MS, force: true })
    await nudgeFileInputChange(page, sel)
    return
  }
  if (typeof page.setInputFiles === 'function') {
    await page.setInputFiles(sel, filePath)
    await nudgeFileInputChange(page, sel)
    return
  }
  throw new Error('Playwright setInputFiles is unavailable on this page handle')
}

async function waitForTrackUploadSlot(page: DistroKidUploadPage, trackNumber: number): Promise<void> {
  const sel = `#js-track-upload-${trackNumber}`
  const loc = page.locator?.(sel)
  if (loc) {
    await loc.waitFor({ state: 'attached', timeout: 90_000 })
    return
  }
  if (!page.evaluate) throw new Error(`Track ${trackNumber} upload input missing`)
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const ready = (await page.evaluate(
      ((n: number) => Boolean(document.getElementById(`js-track-upload-${n}`))) as never,
      trackNumber as never
    )) as boolean
    if (ready) return
    if (page.waitForTimeout) await page.waitForTimeout(400)
    else await sleep(400)
  }
  throw new Error(`Track ${trackNumber} upload input not in DOM`)
}

/** Wait until DistroKid has bound the file and is not still showing an active upload spinner. */
async function waitForTrackUploadSettled(
  page: DistroKidUploadPage,
  trackNumber: number,
  fileBaseName: string
): Promise<{ ok: boolean; detail: string }> {
  if (!page.evaluate) return { ok: true, detail: 'no evaluate' }
  const deadline = Date.now() + 120_000
  const want = fileBaseName.toLowerCase()
  while (Date.now() < deadline) {
    const state = (await page.evaluate(
      ((n: number, base: string) => {
        const input = document.getElementById(`js-track-upload-${n}`) as HTMLInputElement | null
        const val = (input?.value || '').toLowerCase()
        const title =
          document.querySelector<HTMLInputElement>(`input[placeholder="Track ${n} title"]`) ||
          document.querySelector<HTMLInputElement>(`input[name^="title_"][placeholder*="Track ${n}"]`)
        let root: HTMLElement | null = input?.parentElement || null
        for (let i = 0; i < 14 && root; i++) {
          if (root.querySelector(`#js-track-upload-${n}`) && root.textContent && root.textContent.length > 40) {
            break
          }
          root = root.parentElement
        }
        const blob = (root?.textContent || document.body.textContent || '').replace(/\s+/g, ' ')
        const uploading = /uploading|processing your audio|please wait|transcod/i.test(blob)
        const err = /could not upload|invalid audio|file too|upload failed|must be a wav/i.test(blob)
        const hasName = val.includes('.wav') || val.includes(base.replace(/\.wav$/i, ''))
        return { val, hasName, uploading, err, hasTitle: Boolean(title?.value?.trim()) }
      }) as never,
      trackNumber as never,
      want as never
    )) as { val: string; hasName: boolean; uploading: boolean; err: boolean; hasTitle: boolean }

    if (state.err) return { ok: false, detail: 'DistroKid reported an upload error near this track' }
    if (state.hasName && !state.uploading) return { ok: true, detail: state.val || 'file bound' }
    if (page.waitForTimeout) await page.waitForTimeout(500)
    else await sleep(500)
  }
  return { ok: false, detail: 'timed out waiting for DistroKid to accept the WAV' }
}

export async function uploadDistroKidAssets(
  page: DistroKidUploadPage,
  packet: DistroKidPrefillPacket
): Promise<DistroKidAssetUploadResult> {
  const filled: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  if (page.setDefaultTimeout) page.setDefaultTimeout(FILE_ACTION_TIMEOUT_MS)

  const dir = path.join(tmpdir(), `sergik-dk-upload-${Date.now()}`)
  mkdirSync(dir, { recursive: true })

  const trackCount = Math.max(1, packet.tracks.length)
  try {
    if (page.waitForTimeout) await page.waitForTimeout(1200)
    else await sleep(1200)

    for (let n = 1; n <= trackCount; n++) {
      try {
        await waitForTrackUploadSlot(page, n)
      } catch (err) {
        errors.push(String(err))
        skipped.push(`Track ${n} upload input not ready — expand song count on DistroKid first`)
      }
    }

    type PreparedTrack = {
      track_number: number
      title: string
      isrc: string
      wav_url: string
      localPath: string
      sizeMb: string
    }
    const prepared: PreparedTrack[] = []

    await Promise.all(
      packet.tracks.map(async (track) => {
        const n = track.track_number
        if (!track.wav_url) {
          skipped.push(`Track ${n} WAV URL missing`)
          return
        }
        try {
          const base = safeFileName(
            `${track.isrc || `track-${n}`}-${track.title || 'audio'}`.slice(0, 80),
            `track-${n}`
          )
          const dest = path.join(dir, base.toLowerCase().endsWith('.wav') ? base : `${base}.wav`)
          await downloadWavToPath(track.wav_url, dest)
          const stat = await fs.stat(dest)
          if (stat.size < 1000) throw new Error(`download too small (${stat.size} bytes)`)
          prepared.push({
            track_number: n,
            title: track.title,
            isrc: track.isrc,
            wav_url: track.wav_url,
            localPath: dest,
            sizeMb: (stat.size / (1024 * 1024)).toFixed(1),
          })
        } catch (err) {
          errors.push(`Track ${n} WAV download failed: ${String(err)}`)
          skipped.push(`Track ${n} WAV — download failed: ${track.wav_url}`)
        }
      })
    )

    prepared.sort((a, b) => a.track_number - b.track_number)

    if (packet.release.artwork_url) {
      try {
        const artPath = await downloadArtworkDspReady(
          packet.release.artwork_url,
          path.join(dir, safeFileName(packet.release.title || 'artwork', 'artwork'))
        )
        if (page.evaluate) {
          await page.evaluate(() => {
            const art = document.getElementById('artwork')
            art?.scrollIntoView({ block: 'center', inline: 'nearest' })
          })
        }
        await setFileOnInput(page, '#artwork, input[type="file"][name="artwork"]', artPath)
        const artSettled = await waitForArtworkSettled(page)
        if (page.waitForTimeout) await page.waitForTimeout(2000)
        else await sleep(2000)
        if (!artSettled.ok) {
          errors.push(`Artwork: ${artSettled.detail}`)
          skipped.push(`Artwork — verify in desk or upload manually: ${packet.release.artwork_url}`)
        } else {
          filled.push(`Artwork uploaded (${path.basename(artPath)}, DSP-ready JPEG)`)
        }
      } catch (err) {
        const msg = `Artwork upload failed: ${String(err)}`
        errors.push(msg)
        skipped.push(`Artwork — upload manually: ${packet.release.artwork_url}`)
      }
    } else {
      skipped.push('Artwork URL missing on packet')
    }

    for (const track of prepared) {
      const n = track.track_number
      try {
        await waitForTrackUploadSlot(page, n)
        if (page.evaluate) {
          await page.evaluate(
            ((num: number) => {
              const input = document.getElementById(`js-track-upload-${num}`)
              input?.scrollIntoView({ block: 'center', inline: 'nearest' })
            }) as never,
            n as never
          )
        }
        await setFileOnInput(
          page,
          `#js-track-upload-${n}, input[type="file"][id="js-track-upload-${n}"]`,
          track.localPath
        )
        const settled = await waitForTrackUploadSettled(page, n, path.basename(track.localPath))
        if (page.waitForTimeout) await page.waitForTimeout(TRACK_UPLOAD_SETTLE_MS)
        else await sleep(TRACK_UPLOAD_SETTLE_MS)
        if (!settled.ok) {
          errors.push(`Track ${n} WAV: ${settled.detail}`)
          skipped.push(`Track ${n} WAV — verify in desk or upload manually: ${track.wav_url}`)
          continue
        }
        filled.push(`Track ${n} WAV uploaded (${path.basename(track.localPath)}, ${track.sizeMb}MB)`)
      } catch (err) {
        const msg = `Track ${n} WAV upload failed: ${String(err)}`
        errors.push(msg)
        skipped.push(`Track ${n} WAV — upload manually: ${track.wav_url}`)
      }
    }

  } finally {
    setTimeout(() => {
      void fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }, TMP_RETAIN_MS)
  }

  return { filled, skipped, errors }
}

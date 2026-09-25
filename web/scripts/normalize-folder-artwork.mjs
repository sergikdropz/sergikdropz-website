/**
 * Rebuild public/images/audio/artwork JPEG masters at high quality / high resolution.
 * Prefers original PNG sources from:
 *   1) Supabase Storage (remote PNG still present)
 *   2) git HEAD (deleted local PNG)
 *   3) current on-disk file (re-encode existing JPEG)
 *
 * Usage:
 *   node scripts/normalize-folder-artwork.mjs
 *   node scripts/normalize-folder-artwork.mjs --dry-run
 *   node scripts/normalize-folder-artwork.mjs --from-storage
 */

import { readdir, readFile, writeFile, unlink, stat, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ART_DIR = join(ROOT, 'public', 'images', 'audio', 'artwork')
/** Keep full camera/export resolution up to this edge. */
const MAX_PX = 4000
/** High-quality JPEG (PNG→JPEG pipeline). */
const QUALITY = 92
const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)$/i
const dryRun = process.argv.includes('--dry-run')

const STORAGE_BASE =
  process.env.ARTWORK_STORAGE_BASE ||
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/audio-files/artwork` ||
  'https://bjzevrsruixsbypybyiy.supabase.co/storage/v1/object/public/audio-files/artwork'

async function fetchBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

function gitShowPng(stem) {
  try {
    return execFileSync('git', ['show', `HEAD:web/public/images/audio/artwork/${stem}.png`], {
      cwd: join(ROOT, '..'),
      maxBuffer: 40 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

async function resolveSourceBuffer(stem, onDiskFull) {
  const pngCandidates = [
    `${STORAGE_BASE}/${stem}.png`,
    `${STORAGE_BASE}/${stem}-.png`,
    `${STORAGE_BASE}/${stem}.PNG`,
  ]
  for (const url of pngCandidates) {
    try {
      const buf = await fetchBuffer(url)
      if (buf?.length) return { buffer: buf, source: url }
    } catch {
      /* try next */
    }
  }
  const fromGit = gitShowPng(stem)
  if (fromGit?.length) return { buffer: fromGit, source: `git:HEAD:${stem}.png` }

  // Prefer a larger Storage JPEG master over a previously downscaled local copy.
  for (const stemVariant of [stem, `${stem}-`]) {
    for (const ext of ['jpg', 'jpeg']) {
      const url = `${STORAGE_BASE}/${stemVariant}.${ext}`
      try {
        const buf = await fetchBuffer(url)
        if (!buf?.length) continue
        let localSize = 0
        if (onDiskFull) {
          try {
            localSize = (await stat(onDiskFull)).size
          } catch {
            /* ignore */
          }
        }
        if (!onDiskFull || buf.length > localSize * 1.15) {
          return { buffer: buf, source: url }
        }
      } catch {
        /* try next */
      }
    }
  }

  if (onDiskFull) {
    try {
      const buf = await readFile(onDiskFull)
      if (buf.length) return { buffer: buf, source: onDiskFull }
    } catch {
      /* ignore */
    }
  }
  return null
}

async function encodeHqJpeg(input) {
  return sharp(input, { failOn: 'none', animated: false })
    .rotate()
    .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

async function main() {
  await mkdir(ART_DIR, { recursive: true })
  let entries = []
  try {
    entries = await readdir(ART_DIR)
  } catch (err) {
    console.error('No artwork directory:', ART_DIR, err.message)
    process.exit(1)
  }

  const byStem = new Map()
  for (const file of entries) {
    if (!IMAGE_EXT.test(file)) continue
    const full = join(ART_DIR, file)
    const st = await stat(full)
    const stem = file.replace(/\.[^.]+$/, '')
    const key = stem.toLowerCase()
    const prev = byStem.get(key)
    if (!prev || st.mtimeMs >= prev.mtimeMs) {
      byStem.set(key, { stem, file, full, size: st.size, mtimeMs: st.mtimeMs })
    }
  }

  // Also ensure known Storage PNG stems are included even if only JPG exists locally.
  for (const stem of [
    'folder-1788602874594',
    'folder-1789905818849',
    'folder-1789940397018',
    'folder-collection-unreleased-eps-sergik---in-the-streets',
    'folder-collection-unreleased-eps-sergik---staying-a-vibe',
    'folder-collection-unreleased-eps-sergik---daze',
    'folder-collection-unreleased-eps-sergik---utopia',
    'folder-collection-unreleased-eps-sergik---the-chan-suk-legend',
  ]) {
    const key = stem.toLowerCase()
    if (!byStem.has(key)) byStem.set(key, { stem, file: null, full: null, size: 0, mtimeMs: 0 })
  }

  let beforeBytes = 0
  let afterBytes = 0
  let converted = 0

  for (const { stem, full, size } of byStem.values()) {
    beforeBytes += size
    const resolved = await resolveSourceBuffer(stem, full)
    if (!resolved) {
      console.warn(`skip ${stem} — no PNG/JPEG source`)
      continue
    }

    const fromPng =
      /\.png$/i.test(String(resolved.source)) || String(resolved.source).includes('.png')
    const fromRemoteJpeg = /\/audio-files\/artwork\//i.test(String(resolved.source)) && !fromPng
    const meta = await sharp(resolved.buffer, { failOn: 'none' }).metadata()

    // Skip only when the only source is the same already-normalized local JPEG.
    if (
      !fromPng &&
      !fromRemoteJpeg &&
      (meta.format === 'jpeg' || meta.format === 'jpg') &&
      onDiskFull &&
      String(resolved.source) === onDiskFull
    ) {
      console.log(`skip ${stem} — already JPEG, no better original (keep ${meta.width}×${meta.height})`)
      afterBytes += size
      continue
    }

    const out = await encodeHqJpeg(resolved.buffer)
    const outName = `${stem}.jpg`
    const outPath = join(ART_DIR, outName)

    if (dryRun) {
      afterBytes += out.length
      console.log(
        `[dry-run] ${stem} ← ${resolved.source}\n` +
          `         ${meta.width}×${meta.height} ${(resolved.buffer.length / 1024 / 1024).toFixed(2)}MB → ~${(out.length / 1024).toFixed(0)}KB jpeg q${QUALITY}`,
      )
      continue
    }

    await writeFile(outPath, out)
    afterBytes += out.length
    converted++

    // Remove sibling extensions for this stem (keep the new jpg).
    for (const sibling of await readdir(ART_DIR)) {
      if (!IMAGE_EXT.test(sibling)) continue
      if (sibling === outName) continue
      if (sibling.replace(/\.[^.]+$/, '') !== stem) continue
      await unlink(join(ART_DIR, sibling)).catch(() => {})
    }

    console.log(
      `✓ ${stem} ← ${String(resolved.source).slice(-60)}\n` +
        `  ${meta.width}×${meta.height} ${(resolved.buffer.length / 1024 / 1024).toFixed(2)}MB → ${(out.length / 1024).toFixed(0)}KB`,
    )
  }

  console.log('')
  console.log(
    `${dryRun ? 'Would convert' : 'Converted'} ${converted || byStem.size} covers @ max ${MAX_PX}px q${QUALITY}: ` +
      `${(beforeBytes / 1024 / 1024).toFixed(1)}MB on-disk before → ${(afterBytes / 1024 / 1024).toFixed(1)}MB after`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

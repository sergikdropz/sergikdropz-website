#!/usr/bin/env node
/**
 * Rebuild header logo assets from the source GIF (negative stone-eye spin).
 * Flattens transparent GIF frames onto solid black before encoding.
 *
 * Usage (from repo root):
 *   node web/scripts/compress-header-logo.mjs "/path/to/SERGIK_stone_eye_3D_spin_negative.gif"
 *
 * Writes:
 *   web/public/images/gallery/sergik-stone-eye-logo.mp4   (~128×128 loop)
 *   web/public/images/gallery/sergik-stone-eye-logo.webp  (poster, reduced motion)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../public/images/gallery')
const src = process.argv[2]

if (!src || !fs.existsSync(src)) {
  console.error('Pass path to source GIF, e.g. ~/Downloads/SERGIK_stone_eye_3D_spin_negative.gif')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
const mp4 = path.join(outDir, 'sergik-stone-eye-logo.mp4')
const webp = path.join(outDir, 'sergik-stone-eye-logo.webp')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sergik-header-logo-'))
const framePattern = path.join(tmpDir, 'frame_%03d.png')

try {
  execFileSync(
    'magick',
    [
      src,
      '-coalesce',
      '-resize',
      '128x128',
      '-background',
      'black',
      '-alpha',
      'remove',
      '-alpha',
      'off',
      '+repage',
      `PNG24:${framePattern}`,
    ],
    { stdio: 'inherit' },
  )

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      '12',
      '-i',
      framePattern,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      '-crf',
      '28',
      mp4,
    ],
    { stdio: 'inherit' },
  )

  execFileSync(
    'magick',
    [`${src}[0]`, '-coalesce', '-resize', '128x128', '-background', 'black', '-flatten', '-quality', '82', webp],
    { stdio: 'inherit' },
  )
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

for (const f of [mp4, webp]) {
  const { size } = fs.statSync(f)
  console.log(`${path.basename(f)}: ${(size / 1024).toFixed(1)} KiB`)
}

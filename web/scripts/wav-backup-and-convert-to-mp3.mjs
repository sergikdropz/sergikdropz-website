#!/usr/bin/env node

/**
 * WAV archive + high-quality MP3 conversion for public/audio and music-library.json
 *
 * Requires: ffmpeg in PATH (brew install ffmpeg)
 *
 * Typical flow:
 *   1) Backup WAVs to external drive (from local tree or from URLs in data/music-library.json)
 *   2) Encode MP3s (VBR V0 by default, or CBR 320k)
 *   3) Rewrite data/music-library.json (.wav -> .mp3 in track file URLs)
 *   4) Run: node scripts/supabase-replace-wav-with-mp3.mjs
 *
 * Usage:
 *   node scripts/wav-backup-and-convert-to-mp3.mjs backup --dest /Volumes/YOUR_DISK/sergik-wav-backup
 *   node scripts/wav-backup-and-convert-to-mp3.mjs backup --dest /path --from-library
 *   node scripts/wav-backup-and-convert-to-mp3.mjs encode [--input public/audio] [--output public/audio] [--delete-wav] [--bitrate 320]
 *   node scripts/wav-backup-and-convert-to-mp3.mjs rewrite-library [--dry-run]
 *   node scripts/wav-backup-and-convert-to-mp3.mjs run-all --dest /Volumes/... [--from-library] [--delete-wav]
 */

import { spawnSync } from 'child_process'
import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
  unlink,
  stat,
} from 'fs/promises'
import { join, relative, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const WEB_ROOT = join(__dirname, '..')
const DEFAULT_AUDIO = join(WEB_ROOT, 'public', 'audio')
const LIBRARY_JSON = join(WEB_ROOT, 'data', 'music-library.json')

const AUDIO_MARKER = '/object/public/audio-files/'

function printHelp() {
  console.log(`
wav-backup-and-convert-to-mp3.mjs

  backup --dest <path> [--from-library]
      Copy local public/audio/**/*.wav to <path>, preserving paths.
      --from-library  Also download every .wav URL from data/music-library.json (deduped).

  encode [--input <dir>] [--output <dir>] [--delete-wav] [--bitrate 0|320]
      ffmpeg: WAV -> MP3. Default input/output: public/audio
      --bitrate 0   LAME VBR -q:a 0 (~245 kbps VBR, default, "high quality")
      --bitrate 320 CBR 320 kbps

  rewrite-library [--dry-run]
      Replace .wav with .mp3 in track "file" strings inside data/music-library.json

  run-all --dest <path> [backup flags...] [encode flags...]
      backup (local) -> encode -> rewrite-library

Environment:
  LIBRARY_JSON  Override path to music-library.json
`)
}

function ensureFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) {
    console.error('❌ ffmpeg not found. Install: brew install ffmpeg')
    process.exit(1)
  }
}

async function scanWavFiles(rootDir) {
  const out = []
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile() && /\.wav$/i.test(e.name)) out.push(p)
    }
  }
  if (existsSync(rootDir)) await walk(rootDir)
  return out
}

async function backupLocalWavs(destRoot, sourceRoot) {
  const wavs = await scanWavFiles(sourceRoot)
  console.log(`📁 Found ${wavs.length} WAV files under ${sourceRoot}`)
  for (const abs of wavs) {
    const rel = relative(sourceRoot, abs)
    const target = join(destRoot, rel)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(abs, target)
    console.log(`  ✅ ${rel}`)
  }
  return wavs.length
}

function storagePathFromPublicUrl(fileUrl) {
  try {
    const u = new URL(fileUrl)
    const idx = u.pathname.indexOf(AUDIO_MARKER)
    if (idx === -1) return null
    return decodeURIComponent(u.pathname.slice(idx + AUDIO_MARKER.length))
  } catch {
    return null
  }
}

async function collectWavUrlsFromLibrary(libraryPath) {
  const raw = await readFile(libraryPath, 'utf8')
  const data = JSON.parse(raw)
  const urls = new Set()

  function walkFolders(nodes) {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (Array.isArray(node.tracks)) {
        for (const t of node.tracks) {
          const f = t.file
          if (typeof f === 'string' && /\.wav(?=$|[?#])/i.test(f) && f.startsWith('http')) {
            urls.add(f)
          }
        }
      }
      if (Array.isArray(node.children)) walkFolders(node.children)
    }
  }

  walkFolders(data.folders)
  return [...urls]
}

async function backupFromLibrary(destRoot, libraryPath) {
  const urls = await collectWavUrlsFromLibrary(libraryPath)
  console.log(`🌐 ${urls.length} unique .wav URLs in library`)
  let ok = 0
  for (const url of urls) {
    const spath = storagePathFromPublicUrl(url)
    if (!spath || !/\.wav$/i.test(spath)) {
      console.warn(`  ⚠️  Skip (not audio-files URL): ${url.slice(0, 80)}…`)
      continue
    }
    const target = join(destRoot, spath)
    await mkdir(dirname(target), { recursive: true })
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`  ❌ ${res.status} ${spath}`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(target, buf)
    console.log(`  ✅ ${spath}`)
    ok++
  }
  return ok
}

function ffmpegArgs(src, dst, bitrateMode) {
  const base = ['-y', '-nostdin', '-i', src, '-vn']
  if (bitrateMode === '320') {
    return [...base, '-codec:a', 'libmp3lame', '-b:a', '320k', dst]
  }
  return [...base, '-codec:a', 'libmp3lame', '-q:a', '0', dst]
}

async function encodeTree(inputRoot, outputRoot, { deleteWav, bitrateMode }) {
  ensureFfmpeg()
  const wavs = await scanWavFiles(inputRoot)
  console.log(`🎛️  Encoding ${wavs.length} WAV -> MP3 (${bitrateMode === '320' ? 'CBR 320k' : 'VBR -q:a 0'})`)

  let done = 0
  for (const wavAbs of wavs) {
    const rel = relative(inputRoot, wavAbs)
    const mp3Rel = rel.replace(/\.wav$/i, '.mp3')
    const mp3Abs = join(outputRoot, mp3Rel)
    await mkdir(dirname(mp3Abs), { recursive: true })

    if (existsSync(mp3Abs)) {
      const stW = await stat(wavAbs)
      const stM = await stat(mp3Abs)
      if (stM.mtimeMs >= stW.mtimeMs) {
        console.log(`  ⏭️  Up-to-date: ${mp3Rel}`)
        if (deleteWav && wavAbs !== mp3Abs) await unlink(wavAbs).catch(() => {})
        continue
      }
    }

    const r = spawnSync('ffmpeg', ffmpegArgs(wavAbs, mp3Abs, bitrateMode), {
      stdio: 'inherit',
    })
    if (r.status !== 0) {
      console.error(`  ❌ ffmpeg failed: ${rel}`)
      process.exit(1)
    }
    done++
    console.log(`  ✅ ${mp3Rel}`)
    if (deleteWav && wavAbs !== mp3Abs) {
      await unlink(wavAbs)
      console.log(`     🗑️  removed ${rel}`)
    }
  }
  console.log(`\nEncoded (new or updated): ${done}`)
}

function rewriteTrackFileUrl(s) {
  if (typeof s !== 'string') return s
  return s.replace(/\.wav(?=$|[?#])/i, '.mp3')
}

async function rewriteLibrary({ dryRun, libraryPath }) {
  const raw = await readFile(libraryPath, 'utf8')
  const data = JSON.parse(raw)
  let n = 0

  function walkFolders(nodes) {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (Array.isArray(node.tracks)) {
        for (const t of node.tracks) {
          if (typeof t.file === 'string' && /\.wav(?=$|[?#])/i.test(t.file)) {
            const next = rewriteTrackFileUrl(t.file)
            if (next !== t.file) {
              t.file = next
              n++
            }
          }
        }
      }
      if (Array.isArray(node.children)) walkFolders(node.children)
    }
  }

  walkFolders(data.folders)
  console.log(`${dryRun ? '[dry-run] ' : ''}Would rewrite ${n} track file URL(s)`)
  if (!dryRun && n > 0) {
    await writeFile(libraryPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
    console.log(`✅ Wrote ${libraryPath}`)
  }
  return n
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dest') args.dest = argv[++i]
    else if (a === '--from-library') args.fromLibrary = true
    else if (a === '--input') args.input = argv[++i]
    else if (a === '--output') args.output = argv[++i]
    else if (a === '--delete-wav') args.deleteWav = true
    else if (a === '--bitrate') args.bitrate = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--help' || a === '-h') args.help = true
    else if (a.startsWith('-')) console.warn('Unknown flag:', a)
    else args._.push(a)
  }
  return args
}

async function main() {
  const argv = parseArgs(process.argv.slice(2))
  if (argv.help || argv._.length === 0) {
    printHelp()
    process.exit(argv.help ? 0 : 1)
  }

  const cmd = argv._[0]
  const libraryPath = process.env.LIBRARY_JSON || LIBRARY_JSON

  if (cmd === 'backup') {
    if (!argv.dest) {
      console.error('backup requires --dest /path/to/external/drive/folder')
      process.exit(1)
    }
    const dest = argv.dest
    await mkdir(dest, { recursive: true })
    const n = await backupLocalWavs(dest, DEFAULT_AUDIO)
    if (argv.fromLibrary) {
      if (!existsSync(libraryPath)) {
        console.error('Missing', libraryPath)
        process.exit(1)
      }
      await backupFromLibrary(dest, libraryPath)
    }
    console.log(`\n✅ Backup finished (${n} local files copied; see log for downloads)`)
    return
  }

  if (cmd === 'encode') {
    const inputRoot = argv.input ? join(WEB_ROOT, argv.input) : DEFAULT_AUDIO
    const outputRoot = argv.output ? join(WEB_ROOT, argv.output) : inputRoot
    const bitrateMode = argv.bitrate === '320' ? '320' : '0'
    if (!existsSync(inputRoot)) {
      console.error('Input dir missing:', inputRoot)
      process.exit(1)
    }
    await encodeTree(inputRoot, outputRoot, {
      deleteWav: !!argv.deleteWav,
      bitrateMode,
    })
    return
  }

  if (cmd === 'rewrite-library') {
    if (!existsSync(libraryPath)) {
      console.error('Missing', libraryPath)
      process.exit(1)
    }
    await rewriteLibrary({ dryRun: !!argv.dryRun, libraryPath })
    return
  }

  if (cmd === 'run-all') {
    if (!argv.dest) {
      console.error('run-all requires --dest for backup')
      process.exit(1)
    }
    await mkdir(argv.dest, { recursive: true })
    await backupLocalWavs(argv.dest, DEFAULT_AUDIO)
    if (argv.fromLibrary && existsSync(libraryPath)) {
      await backupFromLibrary(argv.dest, libraryPath)
    }
    const bitrateMode = argv.bitrate === '320' ? '320' : '0'
    await encodeTree(DEFAULT_AUDIO, DEFAULT_AUDIO, {
      deleteWav: !!argv.deleteWav,
      bitrateMode,
    })
    await rewriteLibrary({ dryRun: false, libraryPath })
    console.log('\nNext: node scripts/supabase-replace-wav-with-mp3.mjs')
    return
  }

  console.error('Unknown command:', cmd)
  printHelp()
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

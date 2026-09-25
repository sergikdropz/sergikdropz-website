/**
 * For vault rows whose WAV is on R2 (not on local disk), encode a 320 kbps MP3
 * next to the master and point file_url at it. The WAV path is unchanged.
 */
import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { fetchR2Object, getR2MediaConfig, putR2Object } from '../lib/audio/r2Media'

async function main() {
const root = process.cwd()
const envText = await readFile(join(root, '.env.local'), 'utf8')
for (const line of envText.split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const i = line.indexOf('=')
  if (!process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1)
}

if (!getR2MediaConfig()) {
  console.error('R2 is not configured')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function decodePath(fileUrl) {
  const clean = String(fileUrl).split('?')[0]
  const marker = clean.includes('/api/audio/media/') ? '/api/audio/media/' : '/audio/'
  const idx = clean.toLowerCase().indexOf(marker)
  if (idx < 0) return null
  return decodeURIComponent(clean.slice(idx + marker.length)).replace(/^\/+/, '')
}

function proxyUrl(rel) {
  return `/api/audio/media/${rel.split('/').map((part) => encodeURIComponent(part)).join('/')}`
}

async function bodyBuffer(body) {
  if (!body) throw new Error('empty R2 body')
  const res = new Response(body)
  return Buffer.from(await res.arrayBuffer())
}

async function transcode(input) {
  const dir = await mkdtemp(join(tmpdir(), 'sergik-r2-mp3-'))
  try {
    const inPath = join(dir, 'in.wav')
    const outPath = join(dir, 'out.mp3')
    await writeFile(inPath, input)
    await new Promise((resolve, reject) => {
      const ff = spawn(
        'ffmpeg',
        ['-y', '-hide_banner', '-loglevel', 'error', '-i', inPath, '-codec:a', 'libmp3lame', '-b:a', '320k', '-map_metadata', '0', '-id3v2_version', '3', outPath],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      )
      let err = ''
      ff.stderr.on('data', (chunk) => {
        err += chunk.toString()
      })
      ff.on('error', reject)
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `ffmpeg ${code}`))))
    })
    return await readFile(outPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function patch(table, id, body) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${table} ${id}: ${res.status} ${await res.text()}`)
}

const tracks = []
for (let offset = 0; ; offset += 200) {
  const q = new URL(`${supabaseUrl}/rest/v1/music_library_tracks`)
  q.searchParams.set('select', 'id,title,file_url,audio_file_id,metadata')
  q.searchParams.set('file_url', 'ilike.*.wav*')
  q.searchParams.set('limit', '200')
  q.searchParams.set('offset', String(offset))
  const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(await res.text())
  const page = await res.json()
  tracks.push(...page)
  if (page.length < 200) break
}

let done = 0
let skipped = 0
for (const track of tracks) {
  const rel = decodePath(track.file_url)
  if (!rel || !/\.wav$/i.test(rel)) {
    skipped++
    continue
  }
  const mp3Rel = rel.replace(/\.wav$/i, '.mp3')
  try {
    const wav = await fetchR2Object(rel, { method: 'GET' })
    if (!wav?.body) {
      skipped++
      console.log('skip (not on R2)', track.title)
      continue
    }
    const mp3 = await transcode(await bodyBuffer(wav.body))
    await putR2Object(mp3Rel, mp3, { contentType: 'audio/mpeg' })
    const streamUrl = proxyUrl(mp3Rel)
    const meta =
      track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
        ? track.metadata
        : {}
    await patch('music_library_tracks', track.id, {
      file_url: streamUrl,
      metadata: {
        ...meta,
        file_path: mp3Rel,
        stream_format: 'mp3',
        stream_bitrate: '320k',
        dspMastersPath: rel,
        distribution_wav_url: proxyUrl(rel),
      },
    })
    if (track.audio_file_id) {
      await patch('audio_files', track.audio_file_id, {
        file_url: streamUrl,
        file_path: mp3Rel,
        file_name: mp3Rel.split('/').pop(),
        format: 'MP3',
        size_bytes: mp3.length,
        size_mb: Number((mp3.length / (1024 * 1024)).toFixed(2)),
      })
    }
    done++
    console.log(`ok ${done}/${tracks.length}`, track.title)
  } catch (err) {
    skipped++
    console.log('skip', track.title, err instanceof Error ? err.message : err)
  }
}

console.log(`finished r2 converted=${done} skipped=${skipped} total=${tracks.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

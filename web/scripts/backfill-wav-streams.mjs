/**
 * Point existing vault rows at a 320 kbps MP3 and keep the WAV under dsp-masters.
 * Usage: node scripts/backfill-wav-streams.mjs
 */
import { spawn } from 'child_process'
import { copyFile, mkdir, readFile, stat } from 'fs/promises'
import { dirname, join } from 'path'
function planImportedAudio(opts) {
  const rel = opts.vaultRelativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^audio\//i, '')
  const wav = /\.wav$/i.test(opts.fileName) || /\.wav$/i.test(rel)
  if (!wav) return { isWav: false, streamRelativePath: rel, dspWavRelativePath: null }
  const base = (rel.split('/').pop() || opts.fileName).replace(/\.mp3$/i, '.wav')
  const wavName = /\.wav$/i.test(base) ? base : `${base}.wav`
  return {
    isWav: true,
    streamRelativePath: rel.replace(/\.wav$/i, '.mp3'),
    dspWavRelativePath: /^dsp-masters\//i.test(rel) ? rel.replace(/\.mp3$/i, '.wav') : `dsp-masters/library/${wavName}`,
  }
}

const root = process.cwd()
const env = Object.fromEntries(
  (await readFile(join(root, '.env.local'), 'utf8'))
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    }),
)
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

function decodePath(fileUrl) {
  const clean = String(fileUrl).split('?')[0]
  const marker = clean.includes('/api/audio/media/')
    ? '/api/audio/media/'
    : clean.toLowerCase().includes('/audio/')
      ? '/audio/'
      : null
  if (!marker) return null
  const rel = decodeURIComponent(clean.slice(clean.toLowerCase().indexOf(marker.toLowerCase()) + marker.length))
  return rel.replace(/^\/+/, '')
}

function proxyUrl(rel) {
  return `/api/audio/media/${rel.split('/').map(encodeURIComponent).join('/')}`
}

async function transcode(src, dest) {
  await mkdir(dirname(dest), { recursive: true })
  await new Promise((resolve, reject) => {
    const ff = spawn(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        src,
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '320k',
        '-map_metadata',
        '0',
        '-id3v2_version',
        '3',
        dest,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let err = ''
    ff.stderr.on('data', (chunk) => {
      err += chunk.toString()
    })
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `ffmpeg ${code}`))))
  })
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
  if (!rel) {
    skipped++
    console.log('skip (no local path)', track.title)
    continue
  }
  const planned = planImportedAudio({ fileName: rel.split('/').pop(), vaultRelativePath: rel })
  const src = join(root, 'public', 'audio', ...rel.split('/'))
  try {
    await stat(src)
  } catch {
    skipped++
    console.log('skip (file missing)', track.title, rel)
    continue
  }
  const mp3Abs = join(root, 'public', 'audio', ...planned.streamRelativePath.split('/'))
  let mp3Ready = false
  try {
    await stat(mp3Abs)
    mp3Ready = true
  } catch {
    mp3Ready = false
  }
  if (!mp3Ready) await transcode(src, mp3Abs)
  if (planned.dspWavRelativePath && planned.dspWavRelativePath !== rel) {
    const wavAbs = join(root, 'public', 'audio', ...planned.dspWavRelativePath.split('/'))
    try {
      await stat(wavAbs)
    } catch {
      await mkdir(dirname(wavAbs), { recursive: true })
      await copyFile(src, wavAbs)
    }
  }
  const streamUrl = proxyUrl(planned.streamRelativePath)
  const wavUrl = proxyUrl(planned.dspWavRelativePath || rel)
  const meta =
    track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
      ? track.metadata
      : {}
  await patch('music_library_tracks', track.id, {
    file_url: streamUrl,
    metadata: {
      ...meta,
      file_path: planned.streamRelativePath,
      stream_format: 'mp3',
      stream_bitrate: '320k',
      dspMastersPath: planned.dspWavRelativePath || rel,
      distribution_wav_url: wavUrl,
    },
  })
  if (track.audio_file_id) {
    const size = (await stat(mp3Abs)).size
    await patch('audio_files', track.audio_file_id, {
      file_url: streamUrl,
      file_path: planned.streamRelativePath,
      file_name: planned.streamRelativePath.split('/').pop(),
      format: 'MP3',
      size_bytes: size,
      size_mb: Number((size / (1024 * 1024)).toFixed(2)),
    })
  }
  done++
  console.log(`ok ${done}/${tracks.length}`, track.title)
}

console.log(`finished converted=${done} skipped=${skipped} total=${tracks.length}`)

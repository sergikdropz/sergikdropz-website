/** Upload local stream MP3s and dsp-masters/library WAVs that are not on R2 yet. */
import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { putR2ObjectFromFile, r2ObjectExists } from '../lib/audio/r2Media'

async function main() {
  const root = process.cwd()
  const envText = await readFile(join(root, '.env.local'), 'utf8')
  for (const line of envText.split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    if (!process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const q = new URL(`${supabaseUrl}/rest/v1/music_library_tracks`)
  q.searchParams.set('select', 'title,metadata')
  q.searchParams.set('metadata->>dspMastersPath', 'like.dsp-masters/library/%')
  q.searchParams.set('limit', '200')
  const res = await fetch(q, {
    headers: { apikey: key || '', Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as Array<{
    title: string
    metadata?: { dspMastersPath?: string; file_path?: string }
  }>

  let uploaded = 0
  for (const row of rows) {
    const pairs: Array<[string | undefined, string]> = [
      [row.metadata?.dspMastersPath, 'audio/wav'],
      [row.metadata?.file_path, 'audio/mpeg'],
    ]
    for (const [rel, type] of pairs) {
      if (!rel) continue
      const abs = join(root, 'public', 'audio', ...rel.split('/'))
      try {
        await stat(abs)
      } catch {
        console.log('missing local', rel)
        continue
      }
      if (await r2ObjectExists(rel)) {
        console.log('already', rel)
        continue
      }
      await putR2ObjectFromFile(rel, abs, { contentType: type })
      uploaded++
      console.log('uploaded', row.title, rel)
    }
  }
  console.log(`finished uploaded=${uploaded} tracks=${rows.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

/**
 * One-time vault tag backfill.
 * Reads audio, writes a tagged copy only when the audio bytes are unchanged.
 * Does not update database rows.
 *
 *   npx tsx scripts/imprint-vault-tags.ts
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import path from 'path'
import { imprintCatalogTags } from '@/lib/audio/imprint-catalog-tags'
import { createSupabaseServerClient } from '@/lib/supabase'

const logDir = path.join(process.cwd(), '.dev')
const logPath = path.join(logDir, 'catalog-stamp.log')

function doneIds(): Set<string> {
  if (!existsSync(logPath)) return new Set()
  const ids = new Set<string>()
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    if (line.startsWith('ok ')) ids.add(line.split(' ')[1] || '')
  }
  ids.delete('')
  return ids
}

function log(line: string) {
  mkdirSync(logDir, { recursive: true })
  appendFileSync(logPath, `${line}\n`)
  console.log(line)
}

async function main() {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_library_tracks')
    .select('audio_file_id')
    .or('is_archived.is.null,is_archived.eq.false')
    .not('audio_file_id', 'is', null)
  if (error) throw new Error(error.message)
  const ids = [...new Set((data || []).map((row) => String(row.audio_file_id || '').trim()).filter(Boolean))]
  const finished = doneIds()
  log(`start ${ids.length} audio files, ${finished.size} already stamped`)
  for (const id of ids) {
    if (finished.has(id)) continue
    try {
      const stamped = await imprintCatalogTags(id)
      if (!stamped.length) {
        log(`skip ${id} no-playable-file`)
        continue
      }
      log(`ok ${id} ${stamped.join('|')}`)
    } catch (err) {
      log(`fail ${id} ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  log('done')
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})

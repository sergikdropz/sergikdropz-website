import { Cursor } from '@cursor/sdk'

const key = process.env.CURSOR_API_KEY?.trim()
if (!key) {
  process.stdout.write(JSON.stringify({ error: 'Set CURSOR_API_KEY', ids: ['auto', 'composer-2.5'] }))
} else {
  try {
    const models = await Cursor.models.list({ apiKey: key })
    const ids = models.map((model) => model.id).filter(Boolean)
    process.stdout.write(JSON.stringify({ ids }))
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Cursor model list failed'
    process.stdout.write(JSON.stringify({ error: detail, ids: ['auto', 'composer-2.5'] }))
    process.exitCode = 1
  }
}

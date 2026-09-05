import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '../../../web')
const require = createRequire(path.join(webRoot, 'package.json'))

export function createSupabaseClient(url, serviceKey) {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

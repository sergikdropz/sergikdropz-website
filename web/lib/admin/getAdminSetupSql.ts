import { readFile } from 'fs/promises'
import path from 'path'

let cachedSql: string | null = null

export async function getAdminSetupSql() {
  if (cachedSql) return cachedSql

  const sqlPath = path.join(process.cwd(), 'supabase', 'admin-setup.sql')
  cachedSql = await readFile(sqlPath, 'utf8')
  return cachedSql
}

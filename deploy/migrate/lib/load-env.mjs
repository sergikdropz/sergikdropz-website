import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const MIGRATE_DIR = path.resolve(__dirname, '..')
export const REPO_ROOT = path.resolve(MIGRATE_DIR, '../..')
export const OUT_DIR = path.join(MIGRATE_DIR, 'out')

export function loadEnv(options = {}) {
  const { required = false } = options
  const envPath = path.join(MIGRATE_DIR, '.env')
  if (!fs.existsSync(envPath)) {
    if (required) {
      console.error('Missing deploy/migrate/.env — copy .env.example and fill R2_* keys.')
      process.exit(1)
    }
    return envPath
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
  return envPath
}

export function requiredEnv(name) {
  const v = process.env[name]?.trim()
  if (!v) {
    console.error(`Missing ${name} in deploy/migrate/.env`)
    process.exit(1)
  }
  return v
}

export function upsertEnvValue(key, value) {
  const envPath = path.join(MIGRATE_DIR, '.env')
  const line = `${key}=${value}`
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `${line}\n`)
    return
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const re = new RegExp(`^${key}=.*$`, 'm')
  fs.writeFileSync(envPath, re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`)
}

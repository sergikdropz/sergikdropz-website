#!/usr/bin/env node
/**
 * Seed the cloud Supabase Auth admin user (same defaults as home-server).
 * Does not print secrets. Safe to re-run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createSupabaseClient } from './lib/supabase-client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webEnv = path.resolve(__dirname, '../../web/.env.local')
const homeEnv = path.resolve(__dirname, '../home-server/.env')

function parse(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, i).trim()] = v
  }
  return out
}

function ensureAdminsTable(postgresUrl) {
  if (!postgresUrl) {
    console.log('[seed-admin] No POSTGRES_URL — skipping DDL (table may already exist)')
    return
  }
  const sql = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL,
  email TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
`
  const tmp = path.join(__dirname, '../out/ensure-admins.sql')
  fs.mkdirSync(path.dirname(tmp), { recursive: true })
  fs.writeFileSync(tmp, sql)
  const r = spawnSync(
    'docker',
    ['run', '--rm', '-v', `${tmp}:/ensure.sql:ro`, 'postgres:15', 'psql', postgresUrl, '-v', 'ON_ERROR_STOP=0', '-f', '/ensure.sql'],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    console.warn('[seed-admin] DDL warning:', (r.stderr || r.stdout || '').slice(-400))
  } else {
    console.log('[seed-admin] admins table ensured')
  }
}

function ensureAdminEmailsEnv(email) {
  const env = parse(webEnv)
  const current = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (current.includes(email.toLowerCase())) {
    console.log('[seed-admin] ADMIN_EMAILS already includes admin email')
    return
  }
  const next = [...current, email].join(',')
  const text = fs.readFileSync(webEnv, 'utf8')
  if (/^ADMIN_EMAILS=/m.test(text)) {
    fs.writeFileSync(webEnv, text.replace(/^ADMIN_EMAILS=.*$/m, `ADMIN_EMAILS=${next}`))
  } else {
    fs.appendFileSync(webEnv, `ADMIN_EMAILS=${next}\n`)
  }
  console.log('[seed-admin] Added ADMIN_EMAILS entry')
}

async function main() {
  const web = parse(webEnv)
  const home = parse(homeEnv)
  const url = (web.SERGIK_CLOUD_SUPABASE_URL || web.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  const service = web.SERGIK_CLOUD_SERVICE_ROLE_KEY || web.SUPABASE_SERVICE_ROLE_KEY
  const email = home.ADMIN_EMAIL || 'admin@sergik.com'
  const password = home.ADMIN_PASSWORD || 'SergikHome2026!'
  const postgres = web.POSTGRES_URL_NON_POOLING || web.POSTGRES_URL

  if (!url || !/\.supabase\.co/i.test(url)) {
    console.error('[seed-admin] Cloud URL missing — run db:init-cloud-profile / finish-vercel-cloud first')
    process.exit(1)
  }
  if (!service) {
    console.error('[seed-admin] Cloud service role key missing')
    process.exit(1)
  }

  ensureAdminsTable(postgres)

  const supabase = createSupabaseClient(url, service)

  console.log(`[seed-admin] Ensuring Auth user for ${email} on ${new URL(url).host}…`)
  let userId = null
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (created.error) {
    const msg = created.error.message || ''
    if (/already/i.test(msg)) {
      const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
      const existing = listed.data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
      if (!existing) {
        console.error('[seed-admin] User exists but could not be listed:', msg)
        process.exit(1)
      }
      userId = existing.id
      // Keep password in sync with home-server seed
      const upd = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      })
      if (upd.error) {
        console.warn('[seed-admin] password update:', upd.error.message)
      } else {
        console.log('[seed-admin] Existing user password refreshed from home-server seed')
      }
    } else {
      console.error('[seed-admin] createUser failed:', msg)
      process.exit(1)
    }
  } else {
    userId = created.data.user.id
    console.log('[seed-admin] Auth user created')
  }

  const { error: adminErr } = await supabase.from('admins').upsert(
    { user_id: userId, email, active: true },
    { onConflict: 'user_id' },
  )
  if (adminErr) {
    console.error('[seed-admin] admins upsert failed:', adminErr.message)
    process.exit(1)
  }
  console.log('[seed-admin] admins row upserted')

  ensureAdminEmailsEnv(email)

  // Verify password login works
  const anon = web.SERGIK_CLOUD_SUPABASE_ANON_KEY || web.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const publicClient = createSupabaseClient(url, anon)
  const login = await publicClient.auth.signInWithPassword({ email, password })
  if (login.error) {
    console.error('[seed-admin] Login verify failed:', login.error.message)
    process.exit(1)
  }
  await publicClient.auth.signOut()
  console.log('[seed-admin] Login verified OK')
  console.log(`[seed-admin] Use ${email} / (home-server ADMIN_PASSWORD) at /admin/login`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * Restore every collected email into public.fans (and missing email_subscribers)
 * from the Aug 2026 cluster dump + live fan_leads / email_subscribers / analytics.
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const repoRoot = path.join(webRoot, '..')
const BACKUP = path.join(repoRoot, 'db_cluster-13-08-2026@13-14-38.backup')

function loadEnv() {
  const envPath = path.join(webRoot, '.env.local')
  const env = {}
  if (!existsSync(envPath)) return env
  for (const line of readFileSync(envPath, 'utf8').split(/\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[t.slice(0, i).trim()] = v
  }
  return env
}

function parseCopyBlock(text, table) {
  const start = text.indexOf(`COPY public.${table} `)
  if (start < 0) return { columns: [], rows: [] }
  const headerEnd = text.indexOf('\n', start)
  const header = text.slice(start, headerEnd)
  const colsMatch = header.match(/\((.*)\) FROM stdin;/)
  const columns = colsMatch ? colsMatch[1].split(', ').map((c) => c.trim()) : []
  const bodyStart = headerEnd + 1
  const bodyEnd = text.indexOf('\n\\.\n', bodyStart)
  const body = text.slice(bodyStart, bodyEnd < 0 ? undefined : bodyEnd)
  const rows = []
  for (const line of body.split('\n')) {
    if (!line || line === '\\.') continue
    const cells = line.split('\t')
    const row = {}
    columns.forEach((col, i) => {
      const raw = cells[i]
      row[col] = raw === undefined || raw === '\\N' ? null : raw
    })
    rows.push(row)
  }
  return { columns, rows }
}

function parsePgArray(value) {
  if (!value || value === '{}') return []
  if (value.startsWith('{') && value.endsWith('}')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

function isCollectableEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return false
  const e = email.trim().toLowerCase()
  if (e.length > 320) return false
  if (e.endsWith('@sergik.local')) return false
  if (e.endsWith('@example.com')) return false
  if (/(^|[.+_-])(autodj|auto-dj|auto_dj)([.+_-]|$)/.test(e.split('@')[0])) return false
  if (/^e2e[-_.]/.test(e)) return false
  return true
}

function mergeContact(map, incoming) {
  const email = incoming.email.trim().toLowerCase()
  if (!isCollectableEmail(email)) return
  const prev = map.get(email) || {
    email,
    name: '',
    phone: null,
    source: incoming.source || 'import',
    tags: new Set(),
    created_at: incoming.created_at || null,
    subscribed_at: incoming.subscribed_at || incoming.created_at || null,
    last_engaged_at: incoming.last_engaged_at || incoming.created_at || null,
    unsubscribed_at: incoming.unsubscribed_at || null,
    sources: new Set(),
  }
  if (incoming.name && incoming.name.trim() && (!prev.name || prev.name.trim().length < incoming.name.trim().length)) {
    prev.name = incoming.name.trim()
  }
  if (incoming.phone && !prev.phone) prev.phone = incoming.phone
  if (incoming.source) prev.sources.add(incoming.source)
  if (!prev.source || prev.source === 'import' || prev.source === 'vault_unlock') {
    if (incoming.source && incoming.source !== 'vault_unlock') prev.source = incoming.source
    else if (!prev.source) prev.source = incoming.source || 'import'
  }
  for (const tag of incoming.tags || []) prev.tags.add(tag)
  const earlier = (a, b) => (!a ? b : !b ? a : a < b ? a : b)
  const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b)
  prev.created_at = earlier(prev.created_at, incoming.created_at)
  prev.subscribed_at = earlier(prev.subscribed_at, incoming.subscribed_at || incoming.created_at)
  prev.last_engaged_at = later(prev.last_engaged_at, incoming.last_engaged_at || incoming.created_at)
  if (incoming.unsubscribed_at) prev.unsubscribed_at = incoming.unsubscribed_at
  map.set(email, prev)
}

function toIso(value) {
  if (!value) return null
  const d = new Date(value.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('[restore-emails] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const contacts = new Map()
const subscriberRows = []

if (existsSync(BACKUP)) {
  const dump = readFileSync(BACKUP, 'utf8')
  const subs = parseCopyBlock(dump, 'email_subscribers')
  const leads = parseCopyBlock(dump, 'fan_leads')
  const fans = parseCopyBlock(dump, 'fans')

  for (const row of subs.rows) {
    subscriberRows.push(row)
    mergeContact(contacts, {
      email: row.email,
      name: row.name,
      source: row.source || 'email_subscriber',
      tags: ['email_subscriber', row.source].filter(Boolean),
      created_at: toIso(row.created_at),
      subscribed_at: toIso(row.created_at),
    })
  }
  for (const row of leads.rows) {
    mergeContact(contacts, {
      email: row.email,
      name: row.display_name,
      source: row.source || 'vault_unlock',
      tags: ['vault'],
      created_at: toIso(row.first_unlock_at || row.created_at),
      last_engaged_at: toIso(row.last_unlock_at || row.created_at),
    })
  }
  for (const row of fans.rows) {
    mergeContact(contacts, {
      email: row.email,
      name: row.name,
      phone: row.phone,
      source: row.source,
      tags: [...parsePgArray(row.tags), 'restored'],
      created_at: toIso(row.created_at),
      subscribed_at: toIso(row.subscribed_at),
      last_engaged_at: toIso(row.last_engaged_at),
      unsubscribed_at: toIso(row.unsubscribed_at),
    })
  }
  console.log(
    `[restore-emails] backup parsed subscribers=${subs.rows.length} leads=${leads.rows.length} fans=${fans.rows.length}`,
  )
} else {
  console.log('[restore-emails] backup file not found, using live tables only')
}

const [{ data: liveLeads }, { data: liveSubs }, { data: liveEvents }] = await Promise.all([
  supabase.from('fan_leads').select('email, display_name, source, campaign, first_unlock_at, last_unlock_at, created_at'),
  supabase.from('email_subscribers').select('email, name, source, created_at, is_active'),
  supabase.from('analytics_events').select('event_data, created_at').eq('event_type', 'fan_signup'),
])

for (const row of liveLeads || []) {
  mergeContact(contacts, {
    email: row.email,
    name: row.display_name,
    source: row.source || 'vault_unlock',
    tags: ['vault'],
    created_at: row.first_unlock_at || row.created_at,
    last_engaged_at: row.last_unlock_at || row.created_at,
  })
}
for (const row of liveSubs || []) {
  subscriberRows.push(row)
  mergeContact(contacts, {
    email: row.email,
    name: row.name,
    source: row.source || 'email_subscriber',
    tags: ['email_subscriber'],
    created_at: row.created_at,
    subscribed_at: row.created_at,
  })
}
for (const row of liveEvents || []) {
  const email = row.event_data?.email
  mergeContact(contacts, {
    email,
    name: null,
    source: row.event_data?.source || 'analytics',
    tags: ['analytics'],
    created_at: row.created_at,
  })
}

const fanRows = [...contacts.values()].map((c) => ({
  email: c.email,
  name: c.name || '',
  phone: c.phone,
  source: c.source || [...c.sources][0] || 'import',
  tags: Array.from(c.tags),
  consent_email: !c.unsubscribed_at,
  consent_sms: false,
  created_at: c.created_at || new Date().toISOString(),
  subscribed_at: c.subscribed_at || c.created_at || new Date().toISOString(),
  last_engaged_at: c.last_engaged_at,
  unsubscribed_at: c.unsubscribed_at,
  metadata: { restored: true, sources: [...c.sources] },
}))

let fansUpserted = 0
for (let i = 0; i < fanRows.length; i += 100) {
  const chunk = fanRows.slice(i, i + 100)
  const { error } = await supabase.from('fans').upsert(chunk, { onConflict: 'email' })
  if (error) {
    console.error('[restore-emails] fans upsert failed:', error.code, error.message)
    process.exit(1)
  }
  fansUpserted += chunk.length
}

const uniqueSubs = new Map()
for (const row of subscriberRows) {
  if (!isCollectableEmail(row.email)) continue
  const email = row.email.trim().toLowerCase()
  if (!uniqueSubs.has(email)) {
    uniqueSubs.set(email, {
      email,
      name: row.name || null,
      source: row.source || 'website',
      is_active: row.is_active !== false && row.is_active !== 'f',
      created_at: toIso(row.created_at) || row.created_at || new Date().toISOString(),
    })
  }
}

let subsUpserted = 0
const subList = [...uniqueSubs.values()]
for (let i = 0; i < subList.length; i += 100) {
  const chunk = subList.slice(i, i + 100)
  const { error } = await supabase.from('email_subscribers').upsert(chunk, { onConflict: 'email' })
  if (error) {
    console.warn('[restore-emails] subscribers upsert skipped:', error.code, error.message)
    break
  }
  subsUpserted += chunk.length
}

const { count: fansCount } = await supabase.from('fans').select('id', { count: 'exact', head: true })
const { count: namedCount } = await supabase
  .from('fans')
  .select('id', { count: 'exact', head: true })
  .neq('name', '')
const { count: subCount } = await supabase.from('email_subscribers').select('id', { count: 'exact', head: true })

console.log(
  JSON.stringify(
    {
      ok: true,
      contactsMerged: fanRows.length,
      fansUpserted,
      subscribersUpserted: subsUpserted,
      fansNow: fansCount,
      fansWithNames: namedCount,
      subscribersNow: subCount,
    },
    null,
    2,
  ),
)

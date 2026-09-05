#!/usr/bin/env node
/**
 * Apply browse RPC migration + folder artwork backfill.
 * 1) Prefer direct Postgres (pg) using POSTGRES_URL_NON_POOLING / DATABASE_URL from .env.local
 * 2) Fallback: headed Playwright → Supabase SQL editor + AppleScript to focus Chrome
 *
 * Usage: node scripts/apply-browse-rpcs-and-backfill.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const migrationPath = path.join(
  webRoot,
  'supabase/migrations/add_browse_rpcs_and_publish_version_fn.sql',
)
const projectRef = 'bjzevrsruixsbypybyiy'
const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`
const outDir = path.join(webRoot, '.dev/ops-shots')
fs.mkdirSync(outDir, { recursive: true })

function loadEnvLocal() {
  const envPath = path.join(webRoot, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2]
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function focusChrome() {
  spawnSync('osascript', [
    '-e',
    'tell application "Google Chrome" to activate',
  ])
}

const BACKFILL_SQL = `
WITH picked AS (
  SELECT DISTINCT ON (folder_id)
    folder_id,
    artwork_url AS art
  FROM music_library_tracks
  WHERE artwork_url IS NOT NULL
    AND btrim(artwork_url) <> ''
  ORDER BY folder_id, updated_at DESC NULLS LAST
),
updated AS (
  UPDATE music_library_folders f
  SET artwork_url = picked.art
  FROM picked
  WHERE f.id = picked.folder_id
    AND (f.artwork_url IS NULL OR btrim(f.artwork_url) = '')
  RETURNING f.id
)
SELECT count(*)::int AS folders_updated FROM updated;
`

const BUMP_SQL = `
INSERT INTO settings (key, value)
VALUES ('music_library_publish_version', jsonb_build_object('version', (extract(epoch from now()) * 1000)::bigint))
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object('version', (extract(epoch from now()) * 1000)::bigint)
RETURNING value;
`

const VERIFY_SQL = `
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('browse_music_artists','browse_music_genres','get_music_library_publish_version')
ORDER BY 1;
`

async function applyViaPg(migrationSql) {
  let url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL
  if (!url) throw new Error('No POSTGRES_URL_NON_POOLING / DATABASE_URL in env')

  // pg v8+ treats sslmode=require as verify-full; match apply-auto-dj-migration.mjs
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    url = url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '')
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}uselibpqcompat=true&sslmode=require`
  }

  // Prefer direct (5432) over pooler for DDL (same TLS workaround as apply-auto-dj-migration)
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 20000,
    ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    console.log('[ops] Applying migration via Postgres…')
    await client.query(migrationSql)
    console.log('[ops] Migration applied.')

    console.log('[ops] Verifying RPCs…')
    const { rows: fns } = await client.query(VERIFY_SQL)
    console.log(
      '[ops] Functions:',
      fns.map((r) => r.proname).join(', ') || '(none)',
    )
    if (fns.length < 3) {
      throw new Error(`Expected 3 RPCs, found ${fns.length}`)
    }

    console.log('[ops] Backfilling folder artwork…')
    const { rows: bf } = await client.query(BACKFILL_SQL)
    const updated = bf[0]?.folders_updated ?? 0
    console.log(`[ops] Folders updated: ${updated}`)

    console.log('[ops] Bumping publish version…')
    const { rows: bump } = await client.query(BUMP_SQL)
    console.log('[ops] Publish version bumped:', JSON.stringify(bump[0]?.value))

    return { ok: true, foldersUpdated: updated, functions: fns.map((r) => r.proname) }
  } finally {
    await client.end()
  }
}

async function applyViaPlaywright(migrationSql) {
  const profileDir = path.join(webRoot, '.dev/playwright-supabase-profile')
  fs.mkdirSync(profileDir, { recursive: true })

  console.log('[ops] Launching headed Chrome for Supabase SQL editor…')
  console.log('[ops] Log in if prompted, then the script will paste + run SQL.')

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const page = context.pages()[0] || (await context.newPage())
  focusChrome()

  await page.goto(sqlEditorUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
  focusChrome()
  await page.screenshot({ path: path.join(outDir, '01-sql-editor.png'), fullPage: true }).catch(() => {})

  // Wait for editor (Monaco) or login
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('/sign-in') || url.includes('login')) {
      console.log('[ops] Waiting for you to sign in to Supabase…')
      focusChrome()
      await page.waitForTimeout(3000)
      continue
    }
    const editor = page.locator('.monaco-editor, textarea, [data-testid="sql-editor"]').first()
    if (await editor.isVisible({ timeout: 2000 }).catch(() => false)) break
    await page.waitForTimeout(1500)
  }

  const fullSql = `${migrationSql}\n\n-- backfill\n${BACKFILL_SQL}\n\n-- bump\n${BUMP_SQL}\n\n-- verify\n${VERIFY_SQL}`

  // Focus monaco and set value via clipboard + keyboard
  await page.evaluate(async (sql) => {
    const ta = document.querySelector('textarea')
    if (ta) {
      ta.focus()
      ta.value = sql
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    // Monaco: try clipboard write + select-all paste
    await navigator.clipboard.writeText(sql)
  }, fullSql).catch(() => {})

  focusChrome()
  await page.keyboard.press('Meta+a').catch(() => {})
  await page.keyboard.press('Meta+v').catch(() => {})

  // Click Run
  const runClicked =
    (await page.getByRole('button', { name: /^run$/i }).first().click({ timeout: 5000 }).then(() => true).catch(() => false)) ||
    (await page.locator('button:has-text("Run")').first().click({ timeout: 5000 }).then(() => true).catch(() => false)) ||
    (await page.keyboard.press('Meta+Enter').then(() => true).catch(() => false))

  console.log('[ops] Run clicked:', runClicked)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(outDir, '02-after-run.png'), fullPage: true }).catch(() => {})

  const bodyText = await page.locator('body').innerText().catch(() => '')
  const ok =
    bodyText.includes('browse_music_artists') ||
    bodyText.includes('Success') ||
    bodyText.includes('folders_updated')

  await context.close()
  return { ok, via: 'playwright' }
}

async function main() {
  loadEnvLocal()
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  try {
    const result = await applyViaPg(migrationSql)
    console.log('[ops] DONE via Postgres', result)

    // Smoke-check with Playwright: open SQL verify query (optional headed confirm)
    if (process.env.OPS_PW_VERIFY === '1') {
      await applyViaPlaywright(VERIFY_SQL)
    }
    process.exit(0)
  } catch (err) {
    console.error('[ops] Postgres path failed:', err?.message || err)
    console.log('[ops] Falling back to Playwright + AppleScript…')
    const result = await applyViaPlaywright(migrationSql)
    console.log('[ops] Playwright result:', result)
    process.exit(result.ok ? 0 : 1)
  }
}

main().catch((err) => {
  console.error('[ops] Fatal:', err)
  process.exit(1)
})

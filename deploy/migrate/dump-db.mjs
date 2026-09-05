#!/usr/bin/env node
/**
 * Dump the home-server Postgres public schema (+ data) into deploy/migrate/out/.
 * Excludes auth/storage system schemas — restore those via Supabase Auth when cutting over.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'out')
const DUMP = path.join(OUT_DIR, 'sergik-public.dump.sql')
const COMPOSE = path.resolve(__dirname, '../home-server')

fs.mkdirSync(OUT_DIR, { recursive: true })

console.log('[dump-db] dumping public schema from home-server…')
const dump = spawnSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'db',
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    'sergik',
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
    '--exclude-schema=auth',
    '--exclude-schema=storage',
    '--exclude-schema=realtime',
    '--exclude-schema=supabase_functions',
    '--exclude-schema=extensions',
    '--exclude-schema=graphql',
    '--exclude-schema=graphql_public',
  ],
  { cwd: COMPOSE, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
)

if (dump.status !== 0) {
  console.error(dump.stderr || dump.stdout || 'pg_dump failed')
  process.exit(dump.status || 1)
}

fs.writeFileSync(DUMP, dump.stdout)
const mb = (fs.statSync(DUMP).size / (1024 * 1024)).toFixed(1)
console.log(`[dump-db] wrote ${DUMP} (${mb} MB)`)

const tables = [...dump.stdout.matchAll(/^CREATE TABLE (?:public\.)?(\S+)/gm)].map((m) => m[1])
console.log(`[dump-db] tables: ${tables.length} (${tables.slice(0, 8).join(', ')}${tables.length > 8 ? ', …' : ''})`)

#!/usr/bin/env node
import fs from 'node:fs'
import readline from 'node:readline'
import {
  activateCloudProfile,
  cloudBackupPath,
  readWebEnv,
  snapshotActiveProfile,
  webEnvPath,
  writeWebEnv,
} from './lib/env-profiles.mjs'

const args = process.argv.slice(2)
const fromArgs = {
  url: args.find((a) => a.startsWith('--url='))?.split('=').slice(1).join('='),
  anon: args.find((a) => a.startsWith('--anon='))?.split('=').slice(1).join('='),
  service: args.find((a) => a.startsWith('--service='))?.split('=').slice(1).join('='),
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main() {
  console.log('[init-cloud-profile] Store NEW Supabase project keys (cloud primary).\n')
  console.log('Create a project at https://supabase.com/dashboard if needed.')
  console.log('Settings → API → Project URL, anon key, service_role key.\n')

  const url =
    fromArgs.url ||
    (await ask('Project URL (https://xxxx.supabase.co): '))
  const anon = fromArgs.anon || (await ask('anon public key: '))
  const service = fromArgs.service || (await ask('service_role key (secret): '))

  if (!url.includes('supabase.co')) {
    console.error('[init-cloud-profile] URL must be a *.supabase.co host')
    process.exit(1)
  }

  console.log('\n[init-cloud-profile] Testing reachability…')
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/`, {
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404 || res.status >= 500) {
      console.error(`[init-cloud-profile] Host unreachable (HTTP ${res.status})`)
      process.exit(1)
    }
  } catch (err) {
    console.error('[init-cloud-profile] Host unreachable:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const snap = snapshotActiveProfile(readWebEnv())
  writeWebEnv({
    ...snap,
    SERGIK_CLOUD_SUPABASE_URL: url.replace(/\/+$/, ''),
    SERGIK_CLOUD_SUPABASE_ANON_KEY: anon,
    SERGIK_CLOUD_SERVICE_ROLE_KEY: service,
  })

  activateCloudProfile()
  fs.copyFileSync(webEnvPath, cloudBackupPath)

  console.log('\n[init-cloud-profile] Saved SERGIK_CLOUD_* profile and activated cloud target.')
  console.log('[init-cloud-profile] Next steps:')
  console.log('  1. cd web && npm run db:schema-bundle')
  console.log('  2. Paste deploy/supabase-foundation/out/schema-bundle.sql in Supabase SQL Editor → Run')
  console.log('  3. cd web && npm run db:bootstrap-cloud')
  console.log('  4. cd web && npm run dev:restart')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

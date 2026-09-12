/**
 * Allow browser <audio crossOrigin="anonymous"> and Range fetches from the site
 * against private R2 (presigned URLs). Safe to re-run.
 *
 * Needs bucket Admin Read & Write (S3) or a Cloudflare API token with R2 Edit.
 * Object Read & Write tokens cannot PutBucketCors.
 */
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(file) {
  try {
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq)
      const value = trimmed.slice(eq + 1)
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))
loadEnvFile(resolve(process.cwd(), '../deploy/migrate/.env'))

const accountId = process.env.R2_ACCOUNT_ID?.trim()
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
const bucket = process.env.R2_BUCKET?.trim()
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
const apiTokenLooksReal = Boolean(apiToken && !/account api tokens/i.test(apiToken) && apiToken.length > 20)

const ALLOWED_ORIGINS = [
  'https://sergikdropz.com',
  'https://www.sergikdropz.com',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
]

const EXPOSE_HEADERS = [
  'Accept-Ranges',
  'Content-Length',
  'Content-Range',
  'Content-Type',
  'ETag',
]

const s3Cors = {
  CORSRules: [
    {
      AllowedOrigins: ALLOWED_ORIGINS,
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: EXPOSE_HEADERS,
      MaxAgeSeconds: 86400,
    },
    {
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: EXPOSE_HEADERS,
      MaxAgeSeconds: 86400,
    },
  ],
}

function dashboardHint() {
  const acct = accountId || '<account>'
  const bkt = bucket || 'sergik-vault'
  return [
    'CORS is a bucket-admin write. Current Object Read & Write tokens are not enough.',
    '',
    'Dashboard:',
    `  https://dash.cloudflare.com/${acct}/r2/default/buckets/${bkt}/settings`,
    '  → CORS Policy → paste GET/HEAD for sergikdropz.com + localhost + optional *',
    '',
    'Or create an R2 token with Admin Read & Write, then re-run:',
    '  node scripts/apply-r2-audio-cors.mjs',
  ].join('\n')
}

async function applyViaS3() {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Missing R2_ACCOUNT_ID / KEY / SECRET / BUCKET')
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: s3Cors,
    }),
  )
}

async function applyViaCloudflareApi() {
  if (!accountId || !bucket || !apiTokenLooksReal) {
    throw new Error('CLOUDFLARE_API_TOKEN missing or placeholder')
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/cors`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rules: [
          {
            allowed: {
              origins: ALLOWED_ORIGINS,
              methods: ['GET', 'HEAD'],
              headers: ['*'],
            },
            exposeHeaders: EXPOSE_HEADERS,
            maxAgeSeconds: 86400,
          },
          {
            allowed: {
              origins: ['*'],
              methods: ['GET', 'HEAD'],
              headers: ['*'],
            },
            exposeHeaders: EXPOSE_HEADERS,
            maxAgeSeconds: 86400,
          },
        ],
      }),
    },
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    const err = body?.errors?.[0]?.message || res.statusText
    throw new Error(`Cloudflare API ${res.status}: ${err}`)
  }
}

let applied = false
let lastError = null

try {
  await applyViaS3()
  applied = true
  console.log(`R2 CORS applied via S3 on bucket ${bucket}`)
} catch (err) {
  lastError = err
  console.warn(`S3 PutBucketCors failed: ${err.name || ''} ${err.Code || err.message}`)
}

if (!applied) {
  try {
    await applyViaCloudflareApi()
    applied = true
    console.log(`R2 CORS applied via Cloudflare API on bucket ${bucket}`)
  } catch (err) {
    lastError = err
    console.warn(`Cloudflare API CORS failed: ${err.message}`)
  }
}

if (!applied) {
  console.error('\nCould not apply R2 CORS automatically.\n')
  console.error(dashboardHint())
  process.exit(1)
}

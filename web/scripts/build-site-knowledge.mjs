#!/usr/bin/env node
/**
 * Scans the Next.js App Router and related sources, then writes a machine-readable
 * snapshot for agents and humans. Run from repo root: `node web/scripts/build-site-knowledge.mjs`
 * or `cd web && npm run knowledge:build`.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(WEB_ROOT, '..')
const APP_DIR = path.join(WEB_ROOT, 'app')
const OUT_FILE = path.join(REPO_ROOT, 'knowledge', 'generated', 'site-knowledge.json')
/** Runtime mirror inside `web/` so Next/Vercel bundles and Admin AI can reread live updates. */
const WEB_OUT_FILE = path.join(WEB_ROOT, 'lib', 'generated', 'site-knowledge.json')
const ADMIN_UI_PATHS_FILE = path.join(WEB_ROOT, 'e2e', 'admin-ui-paths.ts')

const PAGE_NAMES = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js'])
const ROUTE_NAMES = new Set(['route.ts', 'route.tsx', 'route.js', 'route.jsx'])

function isRouteGroup(segment) {
  return segment.startsWith('(') && segment.endsWith(')')
}

/** @param {string} relFromAppDir e.g. admin/(protected)/foo/page.tsx */
function segmentsFromAppRel(relFromAppDir) {
  const dir = path.dirname(relFromAppDir)
  if (dir === '.') return []
  return dir
    .split(path.sep)
    .filter((s) => s && !isRouteGroup(s))
}

function urlPathFromAppRel(relFromAppDir) {
  const segs = segmentsFromAppRel(relFromAppDir)
  if (segs.length === 0) return '/'
  return '/' + segs.join('/').replace(/\\/g, '/')
}

function categorizePagePath(urlPath) {
  if (urlPath.startsWith('/api/')) return 'api'
  if (urlPath.startsWith('/admin')) return 'admin'
  if (urlPath.startsWith('/studio')) return 'studio'
  if (urlPath.startsWith('/fan')) return 'fan'
  if (urlPath.startsWith('/music-library')) return 'music_library'
  if (urlPath.startsWith('/shop')) return 'shop'
  if (urlPath === '/instagram-helper') return 'tooling'
  if (urlPath === '/debug') return 'debug'
  return 'public'
}

/** @param {string} absDir */
async function walk(absDir, acc, extFilter) {
  let entries
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const full = path.join(absDir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next') continue
      await walk(full, acc, extFilter)
    } else if (ent.isFile() && extFilter(ent.name)) {
      acc.push(full)
    }
  }
}

async function countFilesUnder(root, predicate) {
  const files = []
  await walk(root, files, () => true)
  return files.filter((f) => predicate(f)).length
}

function parseAdminUiCrawlPaths(source) {
  const m = source.match(
    /export const ADMIN_UI_CRAWL_PATHS:\s*readonly string\[\]\s*=\s*\[([\s\S]*?)\]/m
  )
  if (!m) return []
  const inner = m[1]
  const paths = []
  const re = /'([^']+)'/g
  let x
  while ((x = re.exec(inner)) !== null) paths.push(x[1])
  return paths
}

function shortHash(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16)
}

async function collectAppRouterPages() {
  const files = []
  await walk(APP_DIR, files, (name) => PAGE_NAMES.has(name))
  return files
    .map((abs) => path.relative(APP_DIR, abs).replace(/\\/g, '/'))
    .sort()
}

async function collectAppRouterRoutes() {
  const files = []
  await walk(APP_DIR, files, (name) => ROUTE_NAMES.has(name))
  return files
    .map((abs) => path.relative(APP_DIR, abs).replace(/\\/g, '/'))
    .sort()
}

async function buildPayload() {
  const pkgRaw = await fs.readFile(path.join(WEB_ROOT, 'package.json'), 'utf8')
  const pkg = JSON.parse(pkgRaw)

  const pageRels = await collectAppRouterPages()
  const routeRels = await collectAppRouterRoutes()

  const pages = pageRels.map((rel) => {
    const urlPath = urlPathFromAppRel(rel)
    return {
      urlPath,
      file: path.posix.join('web/app', rel),
      category: categorizePagePath(urlPath),
    }
  })

  const apiRoutes = routeRels.map((rel) => {
    const urlPath = urlPathFromAppRel(rel)
    return {
      urlPath,
      file: path.posix.join('web/app', rel),
      category: urlPath.startsWith('/api/') ? 'api' : 'other_route_handler',
    }
  })

  const adminPagePaths = new Set(
    pages.filter((p) => p.category === 'admin').map((p) => p.urlPath)
  )

  let adminCrawlPaths = []
  try {
    const crawlSrc = await fs.readFile(ADMIN_UI_PATHS_FILE, 'utf8')
    adminCrawlPaths = parseAdminUiCrawlPaths(crawlSrc)
  } catch {
    adminCrawlPaths = []
  }

  const crawlMissingInApp = adminCrawlPaths.filter((p) => {
    if (!p.startsWith('/admin')) return false
    if (p.includes('[')) return false
    return !adminPagePaths.has(p)
  })

  const crawlNotListed = [...adminPagePaths].filter((p) => {
    if (p === '/admin/login' || p === '/admin/setup') return false
    if (p.includes('[')) return false
    return !adminCrawlPaths.includes(p)
  })

  const [componentTsxCount, libTsCount] = await Promise.all([
    countFilesUnder(path.join(WEB_ROOT, 'components'), (f) => f.endsWith('.tsx')),
    countFilesUnder(path.join(WEB_ROOT, 'lib'), (f) => f.endsWith('.ts') && !f.endsWith('.d.ts')),
  ])

  const byCategory = {}
  for (const p of pages) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
  }

  const contentHash = shortHash({
    pages: pages.map((p) => p.urlPath),
    routes: apiRoutes.map((r) => r.urlPath),
    adminCrawlPaths,
  })
  let generatedAt = new Date().toISOString()
  try {
    const previous = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'))
    if (
      previous?.meta?.contentHash === contentHash &&
      typeof previous?.meta?.generatedAt === 'string'
    ) {
      generatedAt = previous.meta.generatedAt
    }
  } catch {
    // First build (or invalid prior output): use the current generation time.
  }

  const payload = {
    meta: {
      generatedAt,
      siteLabel: 'sergikdropz.com',
      repoPaths: {
        webRoot: 'web/',
        appDir: 'web/app/',
        knowledgeOut: 'knowledge/generated/site-knowledge.json',
      },
      package: {
        name: pkg.name,
        version: pkg.version,
        next: pkg.dependencies?.next ?? null,
        dependencyCount: Object.keys(pkg.dependencies ?? {}).length,
        devDependencyCount: Object.keys(pkg.devDependencies ?? {}).length,
      },
      counts: {
        appRouterPages: pages.length,
        appRouterRouteHandlers: apiRoutes.length,
        componentsTsx: componentTsxCount,
        libTs: libTsCount,
      },
      pagesByCategory: byCategory,
      contentHash,
    },
    middleware: {
      adminProtectedPrefixes: ['/admin (except /admin/login, /admin/setup)', '/studio'],
      adminApiPrefix: '/api/admin',
      sessionRefreshTargets: [
        '/admin',
        '/studio',
        '/api/admin',
        '/api/auth/session',
        '/fan',
        '/api/fan',
        '/api/membership/status',
        '/shop/membership/manage',
        '/music-library',
        '/api/music-library',
      ],
      notes:
        'Matcher is narrower than all routes; see web/middleware.ts config.matcher and full logic.',
    },
    e2e: {
      playwrightConfig: 'web/playwright.config.ts',
      adminCrawlListFile: 'web/e2e/admin-ui-paths.ts',
      adminCrawlPathCount: adminCrawlPaths.length,
      drift: {
        crawlPathsMissingMatchingAdminPage: crawlMissingInApp,
        adminPagesNotInCrawlList: crawlNotListed.sort(),
      },
      suites: {
        guest: 'admin-guest, admin-api, admin-audit, admin-a11y, fan-public',
        authenticated: 'admin-authenticated, admin-ui-crawl (requires E2E_ADMIN_EMAIL/PASSWORD)',
      },
    },
    tables: {
      appPages: pages,
      routeHandlers: apiRoutes,
    },
  }

  return {
    payload,
    crawlMissingInApp,
    crawlNotListed,
  }
}

function serializedSnapshot(payload) {
  return JSON.stringify(payload, null, 2) + '\n'
}

async function readExistingOrNull(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

function reportStale(filePath, existingText, expectedHash) {
  let existingHash = 'unknown'
  try {
    existingHash = JSON.parse(existingText)?.meta?.contentHash ?? 'unknown'
  } catch {
    existingHash = 'unreadable'
  }
  console.error(
    `Site knowledge snapshot is stale.\n` +
      `  file: ${path.relative(REPO_ROOT, filePath)}\n` +
      `  on-disk hash: ${existingHash}\n` +
      `  expected hash: ${expectedHash}\n` +
      'Run: cd web && npm run knowledge:build'
  )
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const { payload, crawlMissingInApp, crawlNotListed } = await buildPayload()
  const nextText = serializedSnapshot(payload)
  const outputs = [OUT_FILE, WEB_OUT_FILE]

  if (checkOnly) {
    let failed = false
    for (const filePath of outputs) {
      const existingText = await readExistingOrNull(filePath)
      if (existingText == null) {
        console.error(
          `Site knowledge snapshot missing: ${path.relative(REPO_ROOT, filePath)}\n` +
            'Run: cd web && npm run knowledge:build'
        )
        failed = true
        continue
      }
      if (existingText !== nextText) {
        reportStale(filePath, existingText, payload.meta.contentHash)
        failed = true
      }
    }
    if (failed) process.exit(1)
    process.stdout.write(
      `Verified ${outputs.map((f) => path.relative(REPO_ROOT, f)).join(' + ')} (hash=${payload.meta.contentHash})\n`
    )
    return
  }

  for (const filePath of outputs) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, nextText, 'utf8')
    process.stdout.write(`Wrote ${path.relative(REPO_ROOT, filePath)}\n`)
  }
  if (crawlMissingInApp.length || crawlNotListed.length) {
    process.stdout.write(
      `Note: e2e admin crawl drift — missing pages: ${crawlMissingInApp.length}, admin pages not in crawl list: ${crawlNotListed.length}\n`
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

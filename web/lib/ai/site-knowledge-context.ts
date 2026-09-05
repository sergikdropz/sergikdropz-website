import fs from 'node:fs'
import path from 'node:path'
import bundledSiteKnowledge from '../generated/site-knowledge.json'

type SiteRoute = {
  urlPath: string
  file: string
  category: string
}

type SiteKnowledge = {
  meta: {
    generatedAt: string
    siteLabel: string
    counts: {
      appRouterPages: number
      appRouterRouteHandlers: number
      componentsTsx: number
      libTs: number
    }
    pagesByCategory: Record<string, number>
    contentHash: string
  }
  middleware: {
    adminProtectedPrefixes: string[]
    adminApiPrefix: string
    sessionRefreshTargets: string[]
    notes: string
  }
  e2e: {
    adminCrawlPathCount: number
    drift: {
      crawlPathsMissingMatchingAdminPage: string[]
      adminPagesNotInCrawlList: string[]
    }
  }
  tables: {
    appPages: SiteRoute[]
    routeHandlers: SiteRoute[]
  }
}

type CachedSiteKnowledge = {
  mtimeMs: number
  filePath: string
  data: SiteKnowledge
}

let cached: CachedSiteKnowledge | null = null

function candidateSiteKnowledgePaths(): string[] {
  const cwd = process.cwd()
  return [
    path.join(cwd, 'lib', 'generated', 'site-knowledge.json'),
    path.join(cwd, 'web', 'lib', 'generated', 'site-knowledge.json'),
    path.join(cwd, '..', 'knowledge', 'generated', 'site-knowledge.json'),
    path.join(cwd, 'knowledge', 'generated', 'site-knowledge.json'),
  ]
}

function loadSiteKnowledge(): { data: SiteKnowledge; sourcePath: string | null } {
  const candidates = candidateSiteKnowledgePaths()

  for (const filePath of candidates) {
    try {
      const stat = fs.statSync(filePath)
      if (cached && cached.filePath === filePath && cached.mtimeMs === stat.mtimeMs) {
        return { data: cached.data, sourcePath: filePath }
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SiteKnowledge
      cached = { mtimeMs: stat.mtimeMs, filePath, data }
      return { data, sourcePath: filePath }
    } catch {
      // Try the next candidate; bundled snapshot is the production fallback.
    }
  }

  return { data: bundledSiteKnowledge as SiteKnowledge, sourcePath: 'bundled' }
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'can',
  'could',
  'for',
  'from',
  'have',
  'help',
  'into',
  'know',
  'make',
  'page',
  'please',
  'site',
  'that',
  'the',
  'this',
  'understand',
  'website',
  'what',
  'where',
  'with',
  'would',
])

const CORE_PATHS = [
  '/',
  '/admin',
  '/studio',
  '/fan',
  '/music',
  '/music-library',
  '/shop',
  '/book',
]

function normalizePathname(value?: string | null): string | null {
  if (!value) return null
  const pathname = value.trim().split(/[?#]/, 1)[0]
  if (!pathname.startsWith('/') || pathname.length > 300) return null
  return pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
}

function routePatternMatches(pattern: string, pathname: string): boolean {
  const patternSegments = pattern.split('/').filter(Boolean)
  const pathSegments = pathname.split('/').filter(Boolean)
  if (patternSegments.length !== pathSegments.length) return false
  return patternSegments.every(
    (segment, index) =>
      (segment.startsWith('[') && segment.endsWith(']')) || segment === pathSegments[index]
  )
}

function queryTokens(message: string): Set<string> {
  const tokens = message
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, ' ')
    .split(/\s+/)
    .flatMap((part) => part.split(/[\/_-]+/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !STOP_WORDS.has(part))
  return new Set(tokens)
}

function scoreRoute(route: SiteRoute, message: string, tokens: Set<string>, pathname: string | null) {
  let score = 0
  const messageLower = message.toLowerCase()
  const routeLower = route.urlPath.toLowerCase()
  const searchable = `${routeLower} ${route.file.toLowerCase()} ${route.category}`

  if (pathname && routePatternMatches(route.urlPath, pathname)) score += 200
  if (route.urlPath !== '/' && messageLower.includes(routeLower)) score += 120
  for (const token of Array.from(tokens)) {
    if (searchable.includes(token)) score += routeLower.includes(token) ? 16 : 5
  }

  if (messageLower.includes(route.category.replace('_', ' '))) score += 12
  if (CORE_PATHS.includes(route.urlPath)) score += 1
  return score
}

function selectRoutes(
  routes: SiteRoute[],
  message: string,
  tokens: Set<string>,
  pathname: string | null,
  limit: number
) {
  return routes
    .map((route) => ({ route, score: scoreRoute(route, message, tokens, pathname) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.route.urlPath.localeCompare(b.route.urlPath))
    .slice(0, limit)
    .map(({ route }) => route)
}

function formatRoutes(label: string, routes: SiteRoute[]): string[] {
  if (!routes.length) return []
  return [
    `${label}:`,
    ...routes.map((route) => `- ${route.urlPath} -> ${route.file} [${route.category}]`),
  ]
}

export type SiteKnowledgeContext = {
  prompt: string
  metadata: {
    contentHash: string
    generatedAt: string
    currentPath: string | null
    matchedPagePaths: string[]
    matchedRouteHandlerPaths: string[]
    /** Provenance for audits: where the snapshot was loaded from. */
    sourcePath: string | null
    freshnessHours: number | null
  }
}

/**
 * Builds a compact, query-aware slice of the generated route inventory.
 * The complete snapshot remains the source of truth; prompts receive only the
 * architecture summary and routes relevant to the current request/view.
 * Reads the snapshot from disk (mtime-cached) so rebuilds during local development
 * and prebuild updates are visible without restarting the process.
 */
export function buildSiteKnowledgeContext(params: {
  message: string
  pathname?: string | null
}): SiteKnowledgeContext {
  const { data: siteKnowledge, sourcePath } = loadSiteKnowledge()
  const pathname = normalizePathname(params.pathname)
  const generatedMs = Date.parse(siteKnowledge.meta.generatedAt)
  const freshnessHours = Number.isFinite(generatedMs)
    ? Math.max(0, Math.round(((Date.now() - generatedMs) / 3_600_000) * 10) / 10)
    : null
  const tokens = queryTokens(params.message)
  const matchedPages = selectRoutes(
    siteKnowledge.tables.appPages,
    params.message,
    tokens,
    pathname,
    10
  )
  const matchedRouteHandlers = selectRoutes(
    siteKnowledge.tables.routeHandlers,
    params.message,
    tokens,
    pathname,
    12
  )
  const categories = Object.entries(siteKnowledge.meta.pagesByCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => `${category}=${count}`)
    .join(', ')
  const drift = siteKnowledge.e2e.drift
  const crawlAligned =
    drift.crawlPathsMissingMatchingAdminPage.length === 0 &&
    drift.adminPagesNotInCrawlList.length === 0

  const lines = [
    'SITE KNOWLEDGE (authoritative static architecture snapshot):',
    `- Site: https://${siteKnowledge.meta.siteLabel}`,
    '- Product: SERGIK — Phoenix-based DJ, producer, curator, and organizer; voice is dark, energetic, direct, confident, underground, and concise.',
    '- Stack: Next.js 14 App Router, TypeScript, Tailwind, Supabase, Stripe, Vercel, Playwright, and Vitest.',
    '- Media rules: never autoplay audio; playback must be user-initiated. Use official Spotify, SoundCloud, and YouTube embeds.',
    `- Snapshot: ${siteKnowledge.meta.generatedAt}; hash=${siteKnowledge.meta.contentHash}; freshnessHours=${freshnessHours ?? 'unknown'}; source=${sourcePath ?? 'unknown'}`,
    `- Inventory: ${siteKnowledge.meta.counts.appRouterPages} pages, ${siteKnowledge.meta.counts.appRouterRouteHandlers} route handlers, ${siteKnowledge.meta.counts.componentsTsx} components, ${siteKnowledge.meta.counts.libTs} library modules`,
    `- Page categories: ${categories}`,
    `- Protected admin surfaces: ${siteKnowledge.middleware.adminProtectedPrefixes.join(', ')}; admin APIs: ${siteKnowledge.middleware.adminApiPrefix}`,
    `- Admin E2E crawl: ${siteKnowledge.e2e.adminCrawlPathCount} paths; aligned=${crawlAligned ? 'yes' : 'no'}`,
    pathname ? `- Current known UI path supplied by the app: ${pathname}` : '',
    '',
    'Grounding rules:',
    '- Treat this snapshot as proof of route/file architecture only, not proof of live records, successful integrations, or completed actions.',
    '- Use the exact route and source-file mappings below. Do not invent pages, APIs, database state, analytics, credentials, or execution results.',
    '- For live state, use the approved read tools. For writes, use only registered tools through Preview -> Approve; chat itself never executes.',
    '- If no relevant route is listed, say the snapshot does not establish it and request a narrower target or code inspection.',
    '',
    ...formatRoutes('Relevant pages', matchedPages),
    ...(matchedPages.length && matchedRouteHandlers.length ? [''] : []),
    ...formatRoutes('Relevant route handlers', matchedRouteHandlers),
  ]

  return {
    prompt: lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n').trim(),
    metadata: {
      contentHash: siteKnowledge.meta.contentHash,
      generatedAt: siteKnowledge.meta.generatedAt,
      currentPath: pathname,
      matchedPagePaths: matchedPages.map((route) => route.urlPath),
      matchedRouteHandlerPaths: matchedRouteHandlers.map((route) => route.urlPath),
      sourcePath,
      freshnessHours,
    },
  }
}

import fs from 'node:fs'
import path from 'node:path'

export type PlatformGrowthScorecard = {
  spotifyMonthlyListeners: number
  spotifyStreams28d: number
  spotifyStreams28dDeltaPct: number
  spotifyFollowers: number
  spotifySuperListeners: number
  spotifyMarqueeEligible: boolean
  soundCloudTopPlay: { title: string; plays: number }
  soundCloudFanSupport: boolean
  soundCloudSpotlightSlotsFilled: number
  soundCloudSpotlightSlotsTotal: number
  youtubeSubscribers: number
  youtubeViews28d: number
  youtubeWatchHours28d: number
  instagramFollowers: number
  instagramFollowing: number
  facebookFollowers: number
  appleArtistsStatus: string
  revelatorHomesUrlOk: boolean
}

export type PlatformGrowthSnapshot = {
  capturedAt: string
  source: string
  scorecard: PlatformGrowthScorecard
  priorities: { p0: string[]; p1: string[]; p2: string[] }
  thresholds: {
    deferMarqueeUntilMonthlyListeners: number
    deferMerchPushUntilYoutubeSubs: number
    preferOwnedFunnelUntilMonthlyListeners: number
  }
  doctrine: string[]
  homes: Array<{ label: string; url: string }>
  markdownPath: string
}

type CachedSnapshot = {
  mtimeMs: number
  filePath: string
  data: PlatformGrowthSnapshot
}

let cached: CachedSnapshot | null = null

function candidatePaths(): string[] {
  const cwd = process.cwd()
  return [
    path.join(cwd, '..', 'knowledge', 'generated', 'platform-growth-snapshot.json'),
    path.join(cwd, 'knowledge', 'generated', 'platform-growth-snapshot.json'),
    path.join(cwd, 'web', '..', 'knowledge', 'generated', 'platform-growth-snapshot.json'),
  ]
}

/** Load the last desk-ingest growth snapshot (JSON). */
export function loadPlatformGrowthSnapshot(): {
  data: PlatformGrowthSnapshot | null
  sourcePath: string | null
  error?: string
} {
  for (const filePath of candidatePaths()) {
    try {
      const stat = fs.statSync(filePath)
      if (cached && cached.filePath === filePath && cached.mtimeMs === stat.mtimeMs) {
        return { data: cached.data, sourcePath: filePath }
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PlatformGrowthSnapshot
      if (!data?.scorecard || !data?.capturedAt) {
        return { data: null, sourcePath: filePath, error: 'Snapshot JSON missing scorecard/capturedAt' }
      }
      cached = { mtimeMs: stat.mtimeMs, filePath, data }
      return { data, sourcePath: filePath }
    } catch {
      // try next
    }
  }
  return { data: null, sourcePath: null, error: 'platform-growth-snapshot.json not found' }
}

export function buildPlatformGrowthToolOutput(options?: { dryRun?: boolean }): Record<string, unknown> {
  const { data, sourcePath, error } = loadPlatformGrowthSnapshot()
  if (!data) {
    return {
      ok: false,
      error: error || 'Snapshot unavailable',
      dryRun: Boolean(options?.dryRun),
      hint: 'Re-ingest signed-in HOMES desks via admin_browser, then refresh knowledge/generated/platform-growth-snapshot.json',
    }
  }
  const sc = data.scorecard
  const ageDays = Math.max(
    0,
    Math.round((Date.now() - Date.parse(data.capturedAt)) / (24 * 60 * 60 * 1000))
  )
  return {
    ok: true,
    capturedAt: data.capturedAt,
    ageDays,
    stale: ageDays > 7,
    source: data.source,
    sourcePath,
    markdownPath: data.markdownPath,
    scorecard: sc,
    priorities: data.priorities,
    thresholds: data.thresholds,
    doctrine: data.doctrine,
    homes: data.homes,
    weeklyScorecardKeys: [
      'spotifyMonthlyListeners',
      'spotifyStreams28d',
      'soundCloudTopPlay',
      'youtubeViews28d',
      'youtubeSubscribers',
      'instagramFollowers',
      'ig_to_site_utm_clicks',
      'musicbank_unlocks',
    ],
    dryRun: Boolean(options?.dryRun),
  }
}

/** Compact system-prompt slice so Growth Marketing stays grounded without a tool call. */
export function buildPlatformGrowthContextPrompt(maxChars = 2200): string | null {
  const { data, error } = loadPlatformGrowthSnapshot()
  if (!data) {
    return [
      'PLATFORM GROWTH CONTEXT: snapshot file missing.',
      error || '',
      'Instruct the user to run `/exec query_platform_growth_snapshot {}` after a desk ingest, or refresh knowledge/generated/platform-growth-snapshot.json.',
      'Never invent Spotify/IG/YT/SC analytics.',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, maxChars)
  }

  const sc = data.scorecard
  const lines = [
    `PLATFORM GROWTH SNAPSHOT (captured ${data.capturedAt}; re-read desks if >7 days old).`,
    `Scorecard: Spotify ML ${sc.spotifyMonthlyListeners}, streams/28d ${sc.spotifyStreams28d} (${sc.spotifyStreams28dDeltaPct}%), followers ${sc.spotifyFollowers}, Marquee eligible ${sc.spotifyMarqueeEligible}.`,
    `SC top: ${sc.soundCloudTopPlay.title} ${sc.soundCloudTopPlay.plays} plays; Fan Support ${sc.soundCloudFanSupport}; Spotlight ${sc.soundCloudSpotlightSlotsFilled}/${sc.soundCloudSpotlightSlotsTotal}.`,
    `YT: ${sc.youtubeSubscribers} subs, ${sc.youtubeViews28d} views/28d, ${sc.youtubeWatchHours28d}h watch.`,
    `IG ${sc.instagramFollowers} followers / ${sc.instagramFollowing} following; FB ${sc.facebookFollowers}; Apple Artists: ${sc.appleArtistsStatus}.`,
    `Thresholds: defer Marquee until ML≥${data.thresholds.deferMarqueeUntilMonthlyListeners}; prefer MusicBank owned funnel until ML≥${data.thresholds.preferOwnedFunnelUntilMonthlyListeners}.`,
    `P0: ${data.priorities.p0.slice(0, 4).join(' | ')}`,
    'Doctrine: never invent analytics; cite this snapshot or `/exec query_platform_growth_snapshot` / admin_browser read. Weekly keys: Spotify ML+streams, SC top plays, YT views/subs, IG→site UTM, MusicBank unlocks.',
    'Full brief: knowledge/PLATFORM_GROWTH_SNAPSHOT.md',
  ]
  return lines.join(' ').slice(0, maxChars)
}

export function isGrowthDeskIntent(message: string): boolean {
  const c = message.toLowerCase()
  return (
    c.includes('growth board') ||
    c.includes('platform growth') ||
    c.includes('grow spotify') ||
    c.includes('grow the brand') ||
    c.includes('monthly listeners') ||
    c.includes('ig to dsp') ||
    c.includes('instagram to spotify') ||
    c.includes('marquee') ||
    c.includes('how do we grow') ||
    c.includes('how can we grow') ||
    c.includes('growth plan') ||
    c.includes('growth snapshot') ||
    c.includes('fan support') ||
    c.includes('spotlight 5') ||
    (c.includes('grow') && (c.includes('spotify') || c.includes('youtube') || c.includes('soundcloud') || c.includes('instagram')))
  )
}

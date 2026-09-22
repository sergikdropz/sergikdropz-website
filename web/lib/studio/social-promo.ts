/**
 * Release social / Meta promo schedule — IG feed, Stories, Reels, Facebook.
 * Times default to America/Los_Angeles engagement windows used for music promo.
 */

export const SOCIAL_PROMO_TIMEZONE = 'America/Los_Angeles'

export const SOCIAL_PROMO_CHANNELS = [
  { id: 'instagram_feed', label: 'IG Feed', platform: 'instagram', format: 'feed' },
  { id: 'instagram_story', label: 'IG Story', platform: 'instagram', format: 'story' },
  { id: 'instagram_reel', label: 'IG Reel', platform: 'instagram', format: 'reel' },
  { id: 'facebook_post', label: 'FB Post', platform: 'facebook', format: 'feed' },
  { id: 'facebook_story', label: 'FB Story', platform: 'facebook', format: 'story' },
] as const

export type SocialPromoChannel = (typeof SOCIAL_PROMO_CHANNELS)[number]['id']

export const SOCIAL_PROMO_STATUSES = [
  { id: 'planned', label: 'Planned' },
  { id: 'ready', label: 'Assets ready' },
  { id: 'posted', label: 'Posted' },
  { id: 'skipped', label: 'Skipped' },
] as const

export type SocialPromoStatus = (typeof SOCIAL_PROMO_STATUSES)[number]['id']

export const SOCIAL_PROMO_ASSETS = [
  { id: 'feed_square', label: '1080×1080 feed card', width: 1080, height: 1080 },
  { id: 'story_static', label: '1080×1920 story still', width: 1080, height: 1920 },
  { id: 'story_video', label: '15s story / reel video', width: 1080, height: 1920 },
  { id: 'caption_only', label: 'Caption / copy only', width: 0, height: 0 },
] as const

export type SocialPromoAssetKind = (typeof SOCIAL_PROMO_ASSETS)[number]['id']

export type SocialPromoPost = {
  id: string
  channel: SocialPromoChannel
  asset: SocialPromoAssetKind
  /** Offset days from street date (negative = before). */
  day_offset: number
  /** Local clock HH:mm in SOCIAL_PROMO_TIMEZONE. */
  local_time: string
  label: string
  hint: string
  scheduled_at: string | null
  status: SocialPromoStatus
  caption: string
  notes: string
}

export type SocialPromoPlan = {
  version: 1
  timezone: string
  street_date: string | null
  generated_at: string
  posts: SocialPromoPost[]
}

export const DEFAULT_SOCIAL_PROMO: SocialPromoPlan = {
  version: 1,
  timezone: SOCIAL_PROMO_TIMEZONE,
  street_date: null,
  generated_at: '',
  posts: [],
}

type SlotTemplate = {
  id: string
  channel: SocialPromoChannel
  asset: SocialPromoAssetKind
  day_offset: number
  local_time: string
  label: string
  hint: string
}

/** Optimized music-promo cadence around street date (PT windows). */
export const SOCIAL_PROMO_TEMPLATES: SlotTemplate[] = [
  {
    id: 'teaser-story',
    channel: 'instagram_story',
    asset: 'story_static',
    day_offset: -14,
    local_time: '19:00',
    label: 'Teaser story',
    hint: 'Artwork crop + “coming soon” — no full track yet.',
  },
  {
    id: 'artwork-feed',
    channel: 'instagram_feed',
    asset: 'feed_square',
    day_offset: -7,
    local_time: '12:00',
    label: 'Artwork reveal',
    hint: 'Tue–Thu noon PT is strong for feed discovery.',
  },
  {
    id: 'artwork-fb',
    channel: 'facebook_post',
    asset: 'feed_square',
    day_offset: -7,
    local_time: '13:00',
    label: 'FB artwork post',
    hint: 'Cross-post the same square to Meta Page.',
  },
  {
    id: 'countdown-story',
    channel: 'instagram_story',
    asset: 'story_video',
    day_offset: -3,
    local_time: '21:00',
    label: 'Countdown story',
    hint: '15s vinyl/cover trailer + link sticker.',
  },
  {
    id: 'presave-story',
    channel: 'instagram_story',
    asset: 'story_static',
    day_offset: -1,
    local_time: '17:00',
    label: 'Pre-save / reminder',
    hint: 'Eve-of story — smart link in sticker.',
  },
  {
    id: 'fb-story-eve',
    channel: 'facebook_story',
    asset: 'story_static',
    day_offset: -1,
    local_time: '18:00',
    label: 'FB story reminder',
    hint: 'Meta story for Page followers.',
  },
  {
    id: 'launch-feed',
    channel: 'instagram_feed',
    asset: 'feed_square',
    day_offset: 0,
    local_time: '09:00',
    label: 'Launch feed',
    hint: 'Street-day morning feed with OUT NOW caption.',
  },
  {
    id: 'launch-reel',
    channel: 'instagram_reel',
    asset: 'story_video',
    day_offset: 0,
    local_time: '12:00',
    label: 'Launch reel',
    hint: 'Midday Reel — strongest music engagement window.',
  },
  {
    id: 'launch-story',
    channel: 'instagram_story',
    asset: 'story_video',
    day_offset: 0,
    local_time: '19:00',
    label: 'Launch story',
    hint: 'Evening story wave + listen link sticker.',
  },
  {
    id: 'launch-fb',
    channel: 'facebook_post',
    asset: 'feed_square',
    day_offset: 0,
    local_time: '10:00',
    label: 'FB launch post',
    hint: 'Page post with smart link.',
  },
  {
    id: 'spotlight-story',
    channel: 'instagram_story',
    asset: 'story_video',
    day_offset: 1,
    local_time: '20:00',
    label: 'Track spotlight',
    hint: 'Day-after story featuring a single hook.',
  },
  {
    id: 'reminder-feed',
    channel: 'instagram_feed',
    asset: 'feed_square',
    day_offset: 3,
    local_time: '13:00',
    label: 'Still spinning',
    hint: 'Mid-week reminder feed while the release is fresh.',
  },
]

const CHANNEL_IDS = new Set<string>(SOCIAL_PROMO_CHANNELS.map((c) => c.id))
const STATUS_IDS = new Set<string>(SOCIAL_PROMO_STATUSES.map((s) => s.id))
const ASSET_IDS = new Set<string>(SOCIAL_PROMO_ASSETS.map((a) => a.id))

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function isChannel(value: string): value is SocialPromoChannel {
  return CHANNEL_IDS.has(value)
}

function isStatus(value: string): value is SocialPromoStatus {
  return STATUS_IDS.has(value)
}

function isAsset(value: string): value is SocialPromoAssetKind {
  return ASSET_IDS.has(value)
}

/** Build a Date in SOCIAL_PROMO_TIMEZONE for YYYY-MM-DD + HH:mm. */
export function zonedDateTimeIso(
  dateYmd: string,
  localTime: string,
  timeZone = SOCIAL_PROMO_TIMEZONE
): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(dateYmd))
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(clean(localTime))
  if (!dateMatch || !timeMatch) return null

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null

  // Approximate PT offset then refine with Intl parts (DST-safe enough for promo planning).
  const guessUtc = Date.UTC(year, month - 1, day, hour + 8, minute)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  function parts(ms: number) {
    const map = Object.fromEntries(
      formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value])
    )
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
    }
  }

  let ms = guessUtc
  for (let i = 0; i < 4; i += 1) {
    const p = parts(ms)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    const want = Date.UTC(year, month - 1, day, hour, minute)
    const delta = want - asUtc
    if (delta === 0) break
    ms += delta
  }
  return new Date(ms).toISOString()
}

export function addDaysYmd(dateYmd: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(dateYmd))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function defaultCaptionForSlot(
  slot: Pick<SlotTemplate, 'id' | 'label' | 'day_offset'>,
  input: { title: string; artist?: string | null; socialCaption?: string | null; smartLink?: string | null }
): string {
  const title = clean(input.title) || 'New release'
  const artist = clean(input.artist) || 'SERGIK'
  const link = clean(input.smartLink)
  const base = clean(input.socialCaption)

  if (slot.day_offset === 0 && base) {
    return link && !base.includes(link) ? `${base}\n\n${link}` : base
  }

  if (slot.day_offset < 0) {
    const days = Math.abs(slot.day_offset)
    return [
      `${title} — ${days} day${days === 1 ? '' : 's'} out.`,
      `${artist} · new music on the way.`,
      link ? `Link: ${link}` : 'Link in bio.',
      '',
      `#SERGIK #NewMusic #ComingSoon`,
    ].join('\n')
  }

  if (slot.day_offset === 0) {
    return [
      `OUT NOW — “${title}” by ${artist}`,
      '',
      link ? `Listen: ${link}` : 'Stream everywhere · link in bio',
      '',
      `#SERGIK #OutNow #NewMusic`,
    ].join('\n')
  }

  return [
    `Still spinning “${title}”`,
    `${artist} · which track are you on?`,
    link ? link : '',
    '',
    `#SERGIK #NowPlaying`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function generateSocialPromoPlan(input: {
  streetDate: string | null | undefined
  title: string
  artist?: string | null
  socialCaption?: string | null
  smartLink?: string | null
  timezone?: string
  nowIso?: string
}): SocialPromoPlan {
  const timezone = clean(input.timezone) || SOCIAL_PROMO_TIMEZONE
  const street = clean(input.streetDate) || null
  const streetYmd = street && /^\d{4}-\d{2}-\d{2}/.test(street) ? street.slice(0, 10) : null

  const posts: SocialPromoPost[] = SOCIAL_PROMO_TEMPLATES.map((slot) => {
    const day = streetYmd ? addDaysYmd(streetYmd, slot.day_offset) : null
    const scheduled_at = day ? zonedDateTimeIso(day, slot.local_time, timezone) : null
    return {
      id: slot.id,
      channel: slot.channel,
      asset: slot.asset,
      day_offset: slot.day_offset,
      local_time: slot.local_time,
      label: slot.label,
      hint: slot.hint,
      scheduled_at,
      status: 'planned' as const,
      caption: defaultCaptionForSlot(slot, input),
      notes: '',
    }
  })

  return {
    version: 1,
    timezone,
    street_date: streetYmd,
    generated_at: input.nowIso || new Date().toISOString(),
    posts,
  }
}

export function parseSocialPromoPlan(raw: unknown): SocialPromoPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_SOCIAL_PROMO, posts: [] }
  }
  const value = raw as Record<string, unknown>
  const postsRaw = Array.isArray(value.posts) ? value.posts : []
  const posts: SocialPromoPost[] = []
  for (const item of postsRaw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const channel = clean(row.channel)
    const asset = clean(row.asset)
    const status = clean(row.status)
    if (!isChannel(channel) || !isAsset(asset)) continue
    posts.push({
      id: clean(row.id) || `post-${posts.length + 1}`,
      channel,
      asset,
      day_offset: Number.isFinite(Number(row.day_offset)) ? Number(row.day_offset) : 0,
      local_time: clean(row.local_time) || '12:00',
      label: clean(row.label) || 'Post',
      hint: clean(row.hint),
      scheduled_at: clean(row.scheduled_at) || null,
      status: isStatus(status) ? status : 'planned',
      caption: clean(row.caption),
      notes: clean(row.notes),
    })
  }
  return {
    version: 1,
    timezone: clean(value.timezone) || SOCIAL_PROMO_TIMEZONE,
    street_date: clean(value.street_date) || null,
    generated_at: clean(value.generated_at) || '',
    posts,
  }
}

export function mergeSocialPromoPlan(
  current: SocialPromoPlan | unknown,
  patch: unknown
): SocialPromoPlan {
  const base = parseSocialPromoPlan(current)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const next = patch as Record<string, unknown>
  const merged: SocialPromoPlan = {
    ...base,
    timezone: clean(next.timezone) || base.timezone,
    street_date:
      next.street_date === null
        ? null
        : clean(next.street_date) || base.street_date,
    generated_at: clean(next.generated_at) || base.generated_at,
    posts: base.posts,
  }

  if (Array.isArray(next.posts)) {
    const byId = new Map(base.posts.map((p) => [p.id, { ...p }]))
    for (const item of next.posts) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const id = clean(row.id)
      if (!id) continue
      const prev = byId.get(id) || {
        id,
        channel: 'instagram_feed' as const,
        asset: 'feed_square' as const,
        day_offset: 0,
        local_time: '12:00',
        label: 'Post',
        hint: '',
        scheduled_at: null,
        status: 'planned' as const,
        caption: '',
        notes: '',
      }
      const channel = clean(row.channel)
      const asset = clean(row.asset)
      const status = clean(row.status)
      byId.set(id, {
        ...prev,
        id,
        channel: isChannel(channel) ? channel : prev.channel,
        asset: isAsset(asset) ? asset : prev.asset,
        day_offset: Number.isFinite(Number(row.day_offset))
          ? Number(row.day_offset)
          : prev.day_offset,
        local_time: clean(row.local_time) || prev.local_time,
        label: clean(row.label) || prev.label,
        hint: row.hint !== undefined ? clean(row.hint) : prev.hint,
        scheduled_at:
          row.scheduled_at === null
            ? null
            : clean(row.scheduled_at) || prev.scheduled_at,
        status: isStatus(status) ? status : prev.status,
        caption: row.caption !== undefined ? clean(row.caption) : prev.caption,
        notes: row.notes !== undefined ? clean(row.notes) : prev.notes,
      })
    }
    // Keep template order when possible
    const ordered: SocialPromoPost[] = []
    const seen = new Set<string>()
    for (const p of base.posts) {
      const nextPost = byId.get(p.id)
      if (nextPost) {
        ordered.push(nextPost)
        seen.add(p.id)
      }
    }
    for (const [id, post] of byId) {
      if (!seen.has(id)) ordered.push(post)
    }
    merged.posts = ordered
  }

  return merged
}

export type SocialPromoSummary = {
  total: number
  posted: number
  ready: number
  planned: number
  next_at: string | null
  next_label: string | null
  has_plan: boolean
}

export function summarizeSocialPromo(plan: SocialPromoPlan | null | undefined): SocialPromoSummary {
  const posts = plan?.posts || []
  if (!posts.length) {
    return {
      total: 0,
      posted: 0,
      ready: 0,
      planned: 0,
      next_at: null,
      next_label: null,
      has_plan: false,
    }
  }
  const posted = posts.filter((p) => p.status === 'posted').length
  const ready = posts.filter((p) => p.status === 'ready').length
  const planned = posts.filter((p) => p.status === 'planned').length
  const upcoming = posts
    .filter((p) => p.status !== 'posted' && p.status !== 'skipped' && p.scheduled_at)
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))[0]
  return {
    total: posts.length,
    posted,
    ready,
    planned,
    next_at: upcoming?.scheduled_at || null,
    next_label: upcoming?.label || null,
    has_plan: true,
  }
}

export function socialPromoChannelLabel(channel: string): string {
  return SOCIAL_PROMO_CHANNELS.find((c) => c.id === channel)?.label || channel
}

export function formatPromoSlotLocal(iso: string | null, timeZone = SOCIAL_PROMO_TIMEZONE): string {
  if (!iso) return 'Needs street date'
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

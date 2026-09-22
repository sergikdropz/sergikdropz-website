export const DISTRIBUTION_MODES = ['self', 'aggregator'] as const
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number]

export const WORKFLOW_STEPS = [
  { id: 'catalog', label: 'Catalog', description: 'Tracks, credits, DSP ingest, ISRCs' },
  { id: 'metadata', label: 'Metadata', description: 'Genre, dates, artwork policy' },
  { id: 'rights', label: 'Rights', description: 'Next action, IPI, clearance' },
  { id: 'copy', label: 'Copy', description: 'Pitch, social, store text' },
  { id: 'delivery', label: 'Delivery', description: 'UPC, artist IDs, store links' },
  { id: 'launch', label: 'Launch', description: 'Ingest gate + go live' },
] as const

export type WorkflowStepId = (typeof WORKFLOW_STEPS)[number]['id']

export const DSP_STORES = [
  { id: 'spotify', name: 'Spotify', color: '#1DB954' },
  { id: 'apple_music', name: 'Apple Music', color: '#FA243C' },
  { id: 'youtube_music', name: 'YouTube Music', color: '#FF0000' },
  { id: 'youtube', name: 'YouTube', color: '#FF2D2D' },
  { id: 'shazam', name: 'Shazam', color: '#0088FF' },
  { id: 'beatport', name: 'Beatport', color: '#94D500' },
  { id: 'traxsource', name: 'Traxsource', color: '#FF6A00' },
  { id: 'soundcloud', name: 'SoundCloud', color: '#FF5500' },
  { id: 'mixcloud', name: 'Mixcloud', color: '#5000FF' },
  { id: 'bandcamp', name: 'Bandcamp', color: '#629aa9' },
  { id: 'amazon', name: 'Amazon Music', color: '#FF9900' },
  { id: 'tidal', name: 'Tidal', color: '#000000' },
  { id: 'deezer', name: 'Deezer', color: '#A238FF' },
  { id: 'pandora', name: 'Pandora', color: '#224099' },
  { id: 'iheart', name: 'iHeartRadio', color: '#C6002B' },
  { id: 'tiktok', name: 'TikTok / Commercial', color: '#00F2EA' },
  { id: 'instagram', name: 'Instagram / Meta', color: '#E4405F' },
  // DistroKid regional / B2B stores (often submitted without public album URLs)
  { id: 'claro_musica', name: 'Claro Música', color: '#DA291C' },
  { id: 'saavn', name: 'JioSaavn', color: '#2BC5B4' },
  { id: 'boomplay', name: 'Boomplay', color: '#E31C25' },
  { id: 'anghami', name: 'Anghami', color: '#7B2D8E' },
  { id: 'netease', name: 'NetEase Cloud Music', color: '#D33A31' },
  { id: 'tencent', name: 'Tencent Music', color: '#00D3FF' },
  { id: 'qobuz', name: 'Qobuz', color: '#1C1C1C' },
  { id: 'joox', name: 'Joox', color: '#00C853' },
  { id: 'kuack_media', name: 'Kuack Media', color: '#FF6B00' },
  { id: 'adaptr', name: 'Adaptr', color: '#5B4CFF' },
  { id: 'flo', name: 'Flo', color: '#3059FF' },
  { id: 'medianet', name: 'MediaNet', color: '#111111' },
  // DistroKid optional “more stores” opt-ins (not always in the submitted icon row)
  { id: 'audiomack', name: 'Audiomack', color: '#FFA200' },
  { id: 'snapchat', name: 'Snapchat', color: '#FFFC00' },
  { id: 'massivemusic', name: 'MassiveMusic', color: '#E6007E' },
  { id: 'roblox', name: 'Roblox', color: '#00A2FF' },
] as const

export type DspStoreId = (typeof DSP_STORES)[number]['id']

export const ALL_DSP_STORE_IDS: DspStoreId[] = DSP_STORES.map((store) => store.id)

const DSP_STORE_ID_SET = new Set<string>(DSP_STORES.map((store) => store.id))

export function allDspStoreIds(): DspStoreId[] {
  return [...ALL_DSP_STORE_IDS]
}

export function isDspStoreId(value: string): value is DspStoreId {
  return DSP_STORE_ID_SET.has(value)
}

/** Stable DSP_STORES order for target / submitted sets. */
export function orderDspStoreIds(ids: Iterable<string>): DspStoreId[] {
  const set = new Set<DspStoreId>()
  for (const raw of ids) {
    if (isDspStoreId(raw)) set.add(raw)
  }
  return ALL_DSP_STORE_IDS.filter((id) => set.has(id))
}

export function dspStoreLabel(store: string): string {
  const known = DSP_STORES.find((item) => item.id === store)
  if (known) return known.name
  return store.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export type MarketingCopy = {
  elevator_pitch?: string
  press_blurb?: string
  spotify_pitch?: string
  social_caption?: string
  store_description?: string
  credits_block?: string
}

export type CopyTemplateMeta = {
  label: string
  short: string
  channel: string
  hint: string
  tip: string
  placeholder: string
  rows: number
  /** Soft target — shown as guidance */
  softMax?: number
  /** Hard limit (Spotify editorial) */
  hardMax?: number
}

export const COPY_TEMPLATES: Record<keyof MarketingCopy, CopyTemplateMeta> = {
  elevator_pitch: {
    label: 'Elevator pitch',
    short: 'Pitch',
    channel: 'Press · playlists · bios',
    hint: 'One charged sentence — the hook before anyone hits play.',
    tip: 'Lead with feel + function (room, system, time of night). Skip guest names you cannot verify.',
    placeholder: 'A late-night house cut that holds the floor without filling every corner of it…',
    rows: 4,
    softMax: 220,
  },
  press_blurb: {
    label: 'Press blurb',
    short: 'Press',
    channel: 'EPK · blogs · Radio promo',
    hint: 'Short EPK paragraph from Catalog press notes, BPM, keys, and billed artists.',
    tip: '2–4 sentences. Open with the release, then one track detail, then the room it belongs in.',
    placeholder: 'SERGIK returns with…',
    rows: 8,
    softMax: 900,
  },
  spotify_pitch: {
    label: 'Spotify editorial pitch',
    short: 'Spotify',
    channel: 'Spotify for Artists · editorial',
    hint: 'Under 500 characters — mood, BPM, keys, and honest comparables.',
    tip: 'Mood first, then BPM/key, then “for fans of…”. No fake chart claims.',
    placeholder: 'Mood: late-night funky house at 124–127 BPM. For fans of…',
    rows: 6,
    softMax: 450,
    hardMax: 500,
  },
  social_caption: {
    label: 'Launch caption',
    short: 'Social',
    channel: 'Instagram · X · Stories',
    hint: 'SEO launch caption: hook, release facts, CTA, then a discovery hashtag block.',
    tip: 'Line 1 = OUT NOW + title. Line 2 = one hook. Line 3 = track count/BPM/genre. CTA. End with 10–14 hashtags (brand + genre + NewMusic/OutNow/NowPlaying). No fake chart claims.',
    placeholder:
      'OUT NOW — “Are We Awake?” by SERGIK 🎧\n\nA late-night house listen…\n\n5-track EP · 124–127 BPM · Funky House\nStream everywhere · link in bio\n\n#SERGIK #AreWeAwake #FunkyHouse #NewEP #NewMusic #OutNow',
    rows: 8,
    softMax: 900,
  },
  store_description: {
    label: 'Store description',
    short: 'Store',
    channel: 'Bandcamp · site · smart link',
    hint: 'SEO store page: headline with artist/genre, engagement lead, tracklist with BPM/key, CTA + tags.',
    tip: 'Headline = Title by Artist — genre kind. Two short paragraphs (metadata + catalog). Why-listen line. Numbered Tracklist with BPM/key/press. CTA. End with Tags: artist · title · genre. Scannable line breaks — no run-on walls.',
    placeholder:
      'Are We Awake? by SERGIK — Funky House EP\n5-track EP · 124–127 BPM · Funky House\n\nPress lead…\n\nWhy press play: …\n\nTracklist\n1. …\n\nListen to “Are We Awake?” …\n\nTags: SERGIK · Are We Awake? · Funky House · EP',
    rows: 14,
    softMax: 2800,
  },
  credits_block: {
    label: 'Credits',
    short: 'Credits',
    channel: 'EPK · Bandcamp · liner',
    hint: 'Writers, producers, mix/master rolled up from Catalog credits.',
    tip: 'One role per line. Keep stage names consistent with Catalog.',
    placeholder: 'Written by…\nProduced by…\nMixed & mastered by…',
    rows: 8,
    softMax: 1200,
  },
}

export const STATUS_STYLES: Record<
  string,
  { label: string; bg: string; text: string; ring: string }
> = {
  draft: {
    label: 'Pending',
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-300',
    ring: 'ring-zinc-500/30',
  },
  pending: {
    label: 'Pending',
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-300',
    ring: 'ring-zinc-500/30',
  },
  submitted: {
    label: 'Submitted',
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    ring: 'ring-amber-500/30',
  },
  delivered: {
    label: 'Delivered',
    bg: 'bg-sky-500/15',
    text: 'text-sky-300',
    ring: 'ring-sky-500/30',
  },
  live: {
    label: 'Live',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    ring: 'ring-emerald-500/30',
  },
  error: {
    label: 'Error',
    bg: 'bg-red-500/15',
    text: 'text-red-300',
    ring: 'ring-red-500/30',
  },
}

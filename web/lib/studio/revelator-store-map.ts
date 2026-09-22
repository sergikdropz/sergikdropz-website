/**
 * Map SERGIK DSP store ids → Revelator distributorStoreId values.
 *
 * Confirmed IDs come from Revelator public docs (Apple=1, Spotify=9, YTM=13,
 * YouTube CID=307, Facebook RM=310, TikTok=319). Others stay unsupported until
 * GET /common/lookup/stores returns account-enabled IDs — do not invent numbers.
 */

import { ALL_DSP_STORE_IDS, DSP_STORES, type DspStoreId } from '@/lib/studio/constants'

export type RevelatorStoreMapping = {
  store: DspStoreId
  /** Revelator distributorStoreId when known for this account family. */
  distributorStoreId: number | null
  /** Human label for logs / UI. */
  revelatorName: string
  supported: boolean
  note?: string
}

/**
 * Curated map — only document-backed IDs are marked supported.
 * Name hints help match live lookup results later.
 */
const CURATED: Record<
  DspStoreId,
  { id: number | null; revelatorName: string; note?: string }
> = {
  apple_music: { id: 1, revelatorName: 'iTunes / Apple Music' },
  spotify: { id: 9, revelatorName: 'Spotify' },
  youtube_music: { id: 13, revelatorName: 'YouTube Music' },
  youtube: {
    id: 307,
    revelatorName: 'YouTube Content ID',
    note: 'Requires YouTube Music (13) in the same queue request.',
  },
  instagram: { id: 310, revelatorName: 'Facebook Rights Manager' },
  tiktok: { id: 319, revelatorName: 'TikTok' },
  // Remaining Studio targets — resolve via lookupStores() after partner access.
  shazam: { id: null, revelatorName: 'Shazam', note: 'Usually via Apple delivery; confirm with store lookup.' },
  beatport: { id: null, revelatorName: 'Beatport' },
  traxsource: { id: null, revelatorName: 'Traxsource' },
  soundcloud: { id: null, revelatorName: 'SoundCloud' },
  mixcloud: { id: null, revelatorName: 'Mixcloud' },
  bandcamp: { id: null, revelatorName: 'Bandcamp' },
  amazon: { id: null, revelatorName: 'Amazon Music' },
  tidal: { id: null, revelatorName: 'Tidal' },
  deezer: { id: null, revelatorName: 'Deezer' },
  pandora: { id: null, revelatorName: 'Pandora' },
  iheart: { id: null, revelatorName: 'iHeartRadio' },
  claro_musica: { id: null, revelatorName: 'Claro Música' },
  saavn: { id: null, revelatorName: 'JioSaavn' },
  boomplay: { id: null, revelatorName: 'Boomplay' },
  anghami: { id: null, revelatorName: 'Anghami' },
  netease: { id: null, revelatorName: 'NetEase' },
  tencent: { id: null, revelatorName: 'Tencent Music' },
  qobuz: { id: null, revelatorName: 'Qobuz' },
  joox: { id: null, revelatorName: 'Joox' },
  kuack_media: { id: null, revelatorName: 'Kuack Media' },
  adaptr: { id: null, revelatorName: 'Adaptr' },
  flo: { id: null, revelatorName: 'Flo' },
  medianet: { id: null, revelatorName: 'MediaNet' },
  audiomack: { id: null, revelatorName: 'Audiomack' },
  snapchat: { id: null, revelatorName: 'Snapchat' },
  massivemusic: { id: null, revelatorName: 'MassiveMusic' },
  roblox: { id: null, revelatorName: 'Roblox' },
}

export function revelatorStoreMappings(): RevelatorStoreMapping[] {
  return ALL_DSP_STORE_IDS.map((store) => {
    const row = CURATED[store]
    return {
      store,
      distributorStoreId: row.id,
      revelatorName: row.revelatorName,
      supported: row.id != null,
      note: row.note,
    }
  })
}

export function getRevelatorStoreMapping(store: DspStoreId): RevelatorStoreMapping {
  return revelatorStoreMappings().find((row) => row.store === store)!
}

export type ResolveTargetStoresResult = {
  storeIds: number[]
  queued: DspStoreId[]
  unsupported: Array<{ store: DspStoreId; name: string; note?: string }>
  /** Extra Revelator IDs forced by rules (e.g. YTM when YouTube CID queued). */
  implied: number[]
}

/**
 * Map Studio target_stores → Revelator queue IDs.
 * YouTube CID (307) implies YouTube Music (13) per Revelator rules.
 */
export function resolveRevelatorTargetStores(
  targets: Iterable<string>,
  overrides?: Partial<Record<DspStoreId, number>>
): ResolveTargetStoresResult {
  const wanted = new Set<DspStoreId>()
  for (const raw of targets) {
    const id = String(raw || '').trim()
    if ((ALL_DSP_STORE_IDS as string[]).includes(id)) wanted.add(id as DspStoreId)
  }

  const storeIds = new Set<number>()
  const queued: DspStoreId[] = []
  const unsupported: ResolveTargetStoresResult['unsupported'] = []
  const implied: number[] = []

  for (const store of ALL_DSP_STORE_IDS) {
    if (!wanted.has(store)) continue
    const override = overrides?.[store]
    const curated = CURATED[store]
    const id = override ?? curated.id
    if (id == null) {
      unsupported.push({
        store,
        name: DSP_STORES.find((s) => s.id === store)?.name || store,
        note: curated.note || 'Not in curated Revelator map — refresh from /common/lookup/stores after partner access.',
      })
      continue
    }
    storeIds.add(id)
    queued.push(store)
  }

  // YouTube CID requires YouTube Music in the same queue body.
  if (storeIds.has(307) && !storeIds.has(13)) {
    storeIds.add(13)
    implied.push(13)
    if (!queued.includes('youtube_music')) queued.push('youtube_music')
  }

  return {
    storeIds: [...storeIds].sort((a, b) => a - b),
    queued,
    unsupported,
    implied,
  }
}

/** Match a live lookup store name onto a Studio DspStoreId. */
export function matchLookupStoreName(name: string): DspStoreId | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const rules: Array<{ store: DspStoreId; needles: string[] }> = [
    { store: 'apple_music', needles: ['apple music', 'itunes', 'apple'] },
    { store: 'spotify', needles: ['spotify'] },
    { store: 'youtube_music', needles: ['youtube music'] },
    { store: 'youtube', needles: ['youtube content', 'youtube cid', 'content id'] },
    { store: 'amazon', needles: ['amazon'] },
    { store: 'tidal', needles: ['tidal'] },
    { store: 'deezer', needles: ['deezer'] },
    { store: 'pandora', needles: ['pandora'] },
    { store: 'beatport', needles: ['beatport'] },
    { store: 'traxsource', needles: ['traxsource'] },
    { store: 'soundcloud', needles: ['soundcloud'] },
    { store: 'tiktok', needles: ['tiktok'] },
    { store: 'instagram', needles: ['facebook', 'instagram', 'meta'] },
    { store: 'iheart', needles: ['iheart'] },
    { store: 'qobuz', needles: ['qobuz'] },
    { store: 'anghami', needles: ['anghami'] },
    { store: 'boomplay', needles: ['boomplay'] },
    { store: 'saavn', needles: ['saavn', 'jiosaavn'] },
    { store: 'audiomack', needles: ['audiomack'] },
    { store: 'shazam', needles: ['shazam'] },
    { store: 'snapchat', needles: ['snapchat'] },
    { store: 'roblox', needles: ['roblox'] },
    { store: 'medianet', needles: ['medianet'] },
    { store: 'claro_musica', needles: ['claro'] },
    { store: 'netease', needles: ['netease'] },
    { store: 'tencent', needles: ['tencent'] },
    { store: 'joox', needles: ['joox'] },
    { store: 'flo', needles: ['flo'] },
    { store: 'kuack_media', needles: ['kuack'] },
    { store: 'adaptr', needles: ['adaptr'] },
    { store: 'massivemusic', needles: ['massivemusic', 'massive music'] },
    { store: 'bandcamp', needles: ['bandcamp'] },
    { store: 'mixcloud', needles: ['mixcloud'] },
  ]
  for (const rule of rules) {
    if (rule.needles.some((needle) => n.includes(needle))) return rule.store
  }
  return null
}

export function mapRevelatorStoreIdToDsp(distributorStoreId: number): DspStoreId | null {
  for (const store of ALL_DSP_STORE_IDS) {
    if (CURATED[store].id === distributorStoreId) return store
  }
  return null
}

export type AggregatorStoreMatrixRow = {
  store: DspStoreId
  name: string
  targeted: boolean
  curatedId: number | null
  lookupId: number | null
  /** curated or lookup — can queue today */
  queueable: boolean
  honesty: 'curated' | 'lookup' | 'unsupported' | 'not_targeted'
  note?: string
  deliveryStatus?: string | null
  deliveryUrl?: string | null
}

/**
 * Honest per-store matrix: curated map ≠ account-enabled ≠ Studio target list.
 */
export function buildAggregatorStoreMatrix(input: {
  targets: Iterable<string>
  lookupStores?: Array<{
    distributorStoreId?: number
    name?: string
    studioStore?: string | null
    isActive?: boolean
  }>
  deliveryStores?: Array<{ name?: string; status?: string; url?: string | null }>
}): AggregatorStoreMatrixRow[] {
  const wanted = new Set<string>()
  for (const t of input.targets) {
    if ((ALL_DSP_STORE_IDS as string[]).includes(String(t))) wanted.add(String(t))
  }

  const lookupByStore = new Map<DspStoreId, number>()
  for (const row of input.lookupStores || []) {
    if (row.isActive === false) continue
    const fromStudio =
      row.studioStore && (ALL_DSP_STORE_IDS as string[]).includes(row.studioStore)
        ? (row.studioStore as DspStoreId)
        : null
    const fromName = row.name ? matchLookupStoreName(row.name) : null
    const store = fromStudio || fromName
    const id = Number(row.distributorStoreId)
    if (store && Number.isFinite(id) && id > 0) lookupByStore.set(store, id)
  }

  const deliveryByStore = new Map<string, { status?: string; url?: string | null }>()
  for (const row of input.deliveryStores || []) {
    const key = String(row.name || '').trim()
    if (!key) continue
    deliveryByStore.set(key, { status: row.status, url: row.url })
  }

  return ALL_DSP_STORE_IDS.map((store) => {
    const curated = CURATED[store]
    const lookupId = lookupByStore.get(store) ?? null
    const targeted = wanted.has(store)
    const queueable = Boolean(curated.id != null || lookupId != null)
    let honesty: AggregatorStoreMatrixRow['honesty'] = 'unsupported'
    if (!targeted) honesty = 'not_targeted'
    else if (curated.id != null) honesty = 'curated'
    else if (lookupId != null) honesty = 'lookup'
    else honesty = 'unsupported'

    const delivery = deliveryByStore.get(store)
    return {
      store,
      name: DSP_STORES.find((s) => s.id === store)?.name || store,
      targeted,
      curatedId: curated.id,
      lookupId,
      queueable: targeted && queueable,
      honesty,
      note: curated.note,
      deliveryStatus: delivery?.status || null,
      deliveryUrl: delivery?.url || null,
    }
  })
}

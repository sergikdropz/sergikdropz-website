export const DISTRIBUTION_MODES = ['self', 'aggregator'] as const
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number]

export const WORKFLOW_STEPS = [
  { id: 'catalog', label: 'Catalog', description: 'Tracks, WAVs, ISRCs' },
  { id: 'metadata', label: 'Metadata', description: 'Artwork, genre, dates' },
  { id: 'rights', label: 'Rights', description: 'Splits, copyright, legal' },
  { id: 'copy', label: 'Copy', description: 'Pitch, social, store text' },
  { id: 'delivery', label: 'Delivery', description: 'DSP targets & links' },
  { id: 'launch', label: 'Launch', description: 'Go live on SERGIK' },
] as const

export type WorkflowStepId = (typeof WORKFLOW_STEPS)[number]['id']

export const DSP_STORES = [
  { id: 'spotify', name: 'Spotify', color: '#1DB954' },
  { id: 'apple_music', name: 'Apple Music', color: '#FA243C' },
  { id: 'amazon', name: 'Amazon Music', color: '#FF9900' },
  { id: 'youtube_music', name: 'YouTube Music', color: '#FF0000' },
  { id: 'tidal', name: 'Tidal', color: '#000000' },
  { id: 'deezer', name: 'Deezer', color: '#A238FF' },
  { id: 'soundcloud', name: 'SoundCloud', color: '#FF5500' },
  { id: 'bandcamp', name: 'Bandcamp', color: '#629aa9' },
  { id: 'tiktok', name: 'TikTok / Commercial', color: '#00F2EA' },
  { id: 'instagram', name: 'Instagram / Meta', color: '#E4405F' },
] as const

export type DspStoreId = (typeof DSP_STORES)[number]['id']

export type MarketingCopy = {
  elevator_pitch?: string
  press_blurb?: string
  spotify_pitch?: string
  social_caption?: string
  store_description?: string
  credits_block?: string
}

export const COPY_TEMPLATES: Record<
  keyof MarketingCopy,
  { label: string; hint: string; placeholder: string }
> = {
  elevator_pitch: {
    label: 'Elevator pitch',
    hint: 'One sentence hook for playlists and press',
    placeholder: 'A late-night techno cut built for warehouse systems…',
  },
  press_blurb: {
    label: 'Press blurb',
    hint: '3–4 sentences for EPK / blog outreach',
    placeholder: 'SERGIK returns with…',
  },
  spotify_pitch: {
    label: 'Spotify editorial pitch',
    hint: 'Under 500 chars — mood, story, comparable artists',
    placeholder: 'For fans of…',
  },
  social_caption: {
    label: 'Launch caption',
    hint: 'Instagram / X announcement with CTA',
    placeholder: 'OUT NOW — stream everywhere…',
  },
  store_description: {
    label: 'Store description',
    hint: 'Long-form for Bandcamp / website embed',
    placeholder: 'Tracklist, production notes, thank-yous…',
  },
  credits_block: {
    label: 'Credits block',
    hint: 'Writers, producers, mix/master — for liner notes',
    placeholder: 'Written by… Produced by…',
  },
}

export const STATUS_STYLES: Record<
  string,
  { label: string; bg: string; text: string; ring: string }
> = {
  draft: {
    label: 'Draft',
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

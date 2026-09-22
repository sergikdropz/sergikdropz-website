'use client'

import {
  DSP_STORES,
  isDspStoreId,
  type DspStoreId,
} from '@/lib/studio/constants'
import {
  isReleaseLiveOnStore,
  verificationLabel,
  type DspVerificationStatus,
} from '@/lib/studio/dsp-verify'
import type { StoreLinkRow } from '@/components/studio/DspDeliveryBoard'
import type { IconType } from 'react-icons'
import {
  FaAmazon,
  FaApple,
  FaDeezer,
  FaInstagram,
  FaMusic,
  FaSoundcloud,
  FaSpotify,
  FaTiktok,
  FaYoutube,
} from 'react-icons/fa'
import { SiBandcamp, SiBeatport, SiMixcloud, SiShazam, SiTidal } from 'react-icons/si'

const STORE_ICONS: Partial<Record<DspStoreId, IconType>> = {
  spotify: FaSpotify,
  apple_music: FaApple,
  youtube_music: FaYoutube,
  youtube: FaYoutube,
  soundcloud: FaSoundcloud,
  amazon: FaAmazon,
  tidal: SiTidal,
  deezer: FaDeezer,
  mixcloud: SiMixcloud,
  bandcamp: SiBandcamp,
  beatport: SiBeatport,
  shazam: SiShazam,
  instagram: FaInstagram,
  tiktok: FaTiktok,
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

function openStoreLink(url: string) {
  const href = url.trim()
  if (!isHttpUrl(href)) return
  window.open(href, '_blank', 'noopener,noreferrer')
}

type Props = {
  storeLinks: StoreLinkRow[]
  /** Max icons before “+N” overflow chip. */
  maxVisible?: number
  className?: string
  onOpenDelivery?: () => void
}

/**
 * Compact store icon buttons — each opens that store’s release/track URL.
 * Verified live/reachable stores are emphasized; linked-but-unverified still open.
 */
export default function VerifiedStoreIcons({
  storeLinks,
  maxVisible = 12,
  className = '',
  onOpenDelivery,
}: Props) {
  const linked = DSP_STORES.map((store) => {
    const link = storeLinks.find((row) => row.store === store.id && isHttpUrl(row.url || ''))
    if (!link) return null
    return { store, link }
  }).filter(Boolean) as Array<{
    store: (typeof DSP_STORES)[number]
    link: StoreLinkRow
  }>

  if (!linked.length) {
    return (
      <button
        type="button"
        onClick={onOpenDelivery}
        className={`inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition ${className}`}
        title="Add store links in Delivery"
      >
        <FaMusic className="text-[10px] opacity-60" />
        No store links
      </button>
    )
  }

  const visible = linked.slice(0, maxVisible)
  const overflow = linked.length - visible.length

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}
      data-testid="verified-store-icons"
      aria-label={`${linked.length} store links`}
    >
      {visible.map(({ store, link }) => {
        const Icon = (isDspStoreId(store.id) && STORE_ICONS[store.id]) || FaMusic
        const verified = isReleaseLiveOnStore(link.verification_status as DspVerificationStatus)
        const status = verificationLabel(link.verification_status as DspVerificationStatus)
        return (
          <button
            key={store.id}
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openStoreLink(link.url)
            }}
            title={`Open on ${store.name}${status ? ` · ${status}` : ''}`}
            aria-label={`Open ${store.name}`}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border bg-zinc-900/80 hover:scale-105 transition ${
              verified
                ? 'border-emerald-700/60 ring-1 ring-emerald-500/30'
                : 'border-white/10 hover:border-white/25'
            }`}
            style={{
              color:
                store.color === '#000000' || store.color === '#1C1C1C' || store.color === '#FFFC00'
                  ? '#fff'
                  : store.color,
            }}
          >
            <Icon className="text-[13px]" aria-hidden />
          </button>
        )
      })}
      {overflow > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onOpenDelivery?.()
          }}
          className="inline-flex h-7 min-w-7 px-1.5 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[10px] text-zinc-400 hover:text-white"
          title={`${overflow} more store links — open Delivery`}
        >
          +{overflow}
        </button>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import type { LaunchHandoffStatus } from '@/lib/studio/launch-handoff'
import { vaultSoftReadiness } from '@/lib/studio/vault-import'
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaLink,
  FaEnvelope,
  FaRocket,
  FaBolt,
  FaExternalLinkAlt,
} from 'react-icons/fa'

type PreflightItem = {
  id: string
  label: string
  ok: boolean
  hint?: string
  soft?: boolean
}

type Props = {
  releaseId: string
  title: string
  isLive: boolean
  goingLive: boolean
  copyright: CopyrightReadiness | null
  hasArtwork: boolean
  hasGenre: boolean
  hasReleaseDate: boolean
  trackCount: number
  tracks?: Array<{
    music_library_track_id?: string | null
    wav_url?: string | null
    artwork_url?: string | null
  }>
  storeLinkCount: number
  targetStoreCount: number
  copyFilled: boolean
  handoff: LaunchHandoffStatus | null
  onGoLive: (force?: boolean) => void
  onEnsureHandoff: () => void
  handoffLoading?: boolean
}

export default function LaunchPanel({
  releaseId,
  title,
  isLive,
  goingLive,
  copyright,
  hasArtwork,
  hasGenre,
  hasReleaseDate,
  trackCount,
  tracks = [],
  storeLinkCount,
  targetStoreCount,
  copyFilled,
  handoff,
  onGoLive,
  onEnsureHandoff,
  handoffLoading,
}: Props) {
  const soft = vaultSoftReadiness(tracks, hasArtwork ? 'yes' : null)

  const checks: PreflightItem[] = [
    {
      id: 'tracks',
      label: 'Tracks on release',
      ok: trackCount > 0,
      hint: trackCount ? `${trackCount} track(s)` : 'Add tracks in Catalog',
    },
    {
      id: 'isrc',
      label: 'ISRCs assigned',
      ok: Boolean(copyright?.checks.tracks_have_isrc),
    },
    {
      id: 'audio',
      label: 'WAV audio uploaded',
      ok: Boolean(copyright?.checks.tracks_have_audio),
    },
    {
      id: 'artwork',
      label: 'Artwork',
      ok: hasArtwork,
    },
    {
      id: 'genre',
      label: 'Genre set',
      ok: hasGenre,
    },
    {
      id: 'date',
      label: 'Release date',
      ok: hasReleaseDate,
    },
    {
      id: 'rights',
      label: 'Copyright pipeline ready',
      ok: Boolean(copyright?.checks.ready_to_distribute),
      hint: copyright?.next_best_action?.label,
    },
    {
      id: 'copy',
      label: 'Marketing copy started',
      ok: copyFilled,
    },
    {
      id: 'dsp',
      label: 'DSP targets or store links',
      ok: storeLinkCount > 0 || targetStoreCount > 0,
      hint:
        storeLinkCount > 0
          ? `${storeLinkCount} link(s)`
          : targetStoreCount
            ? `${targetStoreCount} target(s)`
            : undefined,
    },
    {
      id: 'vault',
      label: 'Music Vault linked',
      ok: soft.vaultLinked || trackCount === 0,
      soft: true,
      hint: soft.hints[0],
    },
    {
      id: 'masters',
      label: 'Master WAV (not vault stream)',
      ok: !soft.needsMasterWav || trackCount === 0,
      soft: true,
      hint: soft.needsMasterWav
        ? 'Replace streaming/pending URLs with distribution masters before DSP'
        : 'Masters look like WAV or ready',
    },
  ]

  const blockers = checks.filter((c) => !c.ok && !c.soft)
  const softWarnings = checks.filter((c) => !c.ok && c.soft)
  const ready = blockers.length === 0
  const siteBase = (typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com'
  ).replace(/\/$/, '')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-white">Launch preflight</h3>
            <p className="text-sm text-zinc-500 mt-1">
              {isLive
                ? `"${title}" is live on SERGIK.`
                : ready
                  ? softWarnings.length
                    ? 'Hard checks green — soft vault/master hints remain.'
                    : 'All checks green — publish when ready.'
                  : `${blockers.length} item(s) still open before a clean go-live.`}
            </p>
          </div>
          {isLive ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
              <FaCheckCircle /> Live
            </span>
          ) : ready ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30">
              Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30">
              <FaExclamationTriangle /> Blocked
            </span>
          )}
        </div>

        <ul className="space-y-2 mb-6">
          {checks.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-3 text-sm border-b border-zinc-800/80 py-2 last:border-0"
            >
              <span
                className={
                  c.ok
                    ? 'text-emerald-400 mt-0.5'
                    : c.soft
                      ? 'text-sky-400 mt-0.5'
                      : 'text-amber-400 mt-0.5'
                }
              >
                {c.ok ? (
                  <FaCheckCircle />
                ) : c.soft ? (
                  <FaInfoCircle />
                ) : (
                  <FaExclamationTriangle />
                )}
              </span>
              <div>
                <p className={c.ok ? 'text-zinc-300' : 'text-zinc-200'}>
                  {c.label}
                  {c.soft ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-sky-500/80">
                      soft
                    </span>
                  ) : null}
                </p>
                {c.hint && <p className="text-xs text-zinc-500 mt-0.5">{c.hint}</p>}
              </div>
            </li>
          ))}
        </ul>

        {!isLive && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={goingLive || !ready}
              onClick={() => onGoLive(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 font-semibold text-sm disabled:opacity-40"
            >
              <FaRocket />
              {goingLive ? 'Publishing…' : 'Go live on SERGIK'}
            </button>
            <button
              type="button"
              disabled={goingLive}
              onClick={() => onGoLive(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-600 text-zinc-400 text-sm hover:border-zinc-500 disabled:opacity-50"
            >
              <FaBolt />
              Force launch
            </button>
          </div>
        )}

        {isLive && (
          <Link
            href={`/music/${encodeURIComponent(releaseId)}`}
            className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200"
          >
            Open public music page <FaExternalLinkAlt className="text-xs" />
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="text-lg font-semibold text-white mb-1">Marketing handoff</h3>
        <p className="text-sm text-zinc-500 mb-5">
          Campaign draft + smart link for fans. Created automatically on go-live; you can also
          ensure them here.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div className="rounded-lg border border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wider mb-2">
              <FaEnvelope /> Campaign
            </div>
            {handoff?.campaign ? (
              <div>
                <p className="text-white text-sm font-medium">{handoff.campaign.name}</p>
                <p className="text-xs text-zinc-500 mt-1 capitalize">{handoff.campaign.status}</p>
                <Link
                  href="/admin/nurturing/campaigns"
                  className="text-xs text-violet-400 hover:text-violet-300 mt-2 inline-block"
                >
                  Open campaigns
                </Link>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Not created yet</p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wider mb-2">
              <FaLink /> Smart link
            </div>
            {handoff?.smartLink ? (
              <div>
                <p className="text-white text-sm font-medium font-mono">/{handoff.smartLink.slug}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {handoff.smartLink.total_clicks} clicks
                </p>
                <a
                  href={`${siteBase}/l/${handoff.smartLink.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-violet-400 hover:text-violet-300 mt-2 inline-flex items-center gap-1"
                >
                  Open link <FaExternalLinkAlt className="text-[10px]" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Not created yet</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={handoffLoading}
            onClick={onEnsureHandoff}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-600 text-sm text-zinc-200 hover:border-violet-500 disabled:opacity-50"
          >
            {handoffLoading ? 'Working…' : 'Ensure campaign + smart link'}
          </button>
          <Link
            href="/studio/releases/pipeline"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-700 text-sm text-zinc-400 hover:text-white"
          >
            Open marketing pipeline
          </Link>
        </div>
      </div>
    </div>
  )
}

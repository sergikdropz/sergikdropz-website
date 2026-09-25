/**
 * Distributor-ready checklist — path from partner delivery → label royalty ops →
 * multi-label / eventual own DSP deals. Composes existing copyright + ingest signals;
 * does not emit DDEX XML (future).
 */

import { DEFAULT_LABEL_NAME } from '@/lib/studio/constants'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import type { RoyaltyOpsSignals } from '@/lib/studio/royalties/types'

export type DistributorReadinessPhase =
  | 'partner_delivery'
  | 'label_royalty_ops'
  | 'multi_label_platform'

export type DistributorReadinessItem = {
  id: string
  phase: DistributorReadinessPhase
  label: string
  ok: boolean
  /** Soft = recommended for scale, not a hard site go-live blocker */
  soft?: boolean
  hint?: string
}

export type DistributorReadinessRelease = {
  title?: string | null
  album_artist?: string | null
  label_name?: string | null
  upc?: string | null
  catalog_number?: string | null
  language?: string | null
  genre?: string | null
  release_date?: string | null
  artwork_url?: string | null
  p_line_year?: number | null
  c_line_year?: number | null
  spotify_artist_id?: string | null
  apple_artist_id?: string | null
  youtube_artist_id?: string | null
}

export type DistributorReadinessResult = {
  ok: boolean
  partnerReady: boolean
  score: number
  blockers: string[]
  warnings: string[]
  items: DistributorReadinessItem[]
  phases: Record<
    DistributorReadinessPhase,
    { label: string; done: number; total: number; ok: boolean }
  >
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function hasYear(value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 1900 && n <= 2100
}

const PHASE_LABELS: Record<DistributorReadinessPhase, string> = {
  partner_delivery: 'Partner delivery (Revelator / DistroKid)',
  label_royalty_ops: 'Label royalty ops (you pay collaborators)',
  multi_label_platform: 'Multi-label / distributor path',
}

/**
 * Evaluate how close a release (and by extension the studio) is to distributor-grade ops.
 * Partner-delivery blockers affect `partnerReady` / `ok`. Later phases are soft by default.
 * Pass `royaltyOps` from `/studio/royalties` store signals when available.
 */
export function evaluateDistributorReadiness(
  release: DistributorReadinessRelease,
  copyright: CopyrightReadiness | null | undefined,
  royaltyOps?: RoyaltyOpsSignals | null,
): DistributorReadinessResult {
  const label = clean(release.label_name)
  const imprintOk = Boolean(label) && label.toLowerCase() !== 'sergik'
  const checks = copyright?.checks
  const ingest = copyright?.ingest?.checks

  const items: DistributorReadinessItem[] = [
    // —— Partner delivery (hard for clean distribute) ——
    {
      id: 'imprint',
      phase: 'partner_delivery',
      label: `Label imprint set (${DEFAULT_LABEL_NAME})`,
      ok: imprintOk,
      hint: imprintOk
        ? label
        : `Set Metadata → Label to ${DEFAULT_LABEL_NAME} (not artist name alone)`,
    },
    {
      id: 'album-artist',
      phase: 'partner_delivery',
      label: 'Album artist',
      ok: Boolean(clean(release.album_artist) || clean(release.title)),
      hint: clean(release.album_artist) || 'Add album artist on Metadata',
    },
    {
      id: 'masters',
      phase: 'partner_delivery',
      label: 'Master audio on every track',
      ok: Boolean(checks?.tracks_have_audio),
      hint: 'Catalog → WAV/FLAC masters (not vault stream URLs)',
    },
    {
      id: 'isrc',
      phase: 'partner_delivery',
      label: 'ISRC on every track',
      ok: Boolean(checks?.tracks_have_isrc),
      hint: 'Rights → assign QTA53 / ISRC',
    },
    {
      id: 'upc',
      phase: 'partner_delivery',
      label: 'UPC / EAN',
      ok: Boolean(checks?.has_upc || clean(release.upc)),
      hint: 'Metadata or Delivery → UPC',
    },
    {
      id: 'artwork',
      phase: 'partner_delivery',
      label: 'Release artwork',
      ok: Boolean(clean(release.artwork_url)),
      hint: 'Square DSP cover on the release',
    },
    {
      id: 'genre',
      phase: 'partner_delivery',
      label: 'Primary genre',
      ok: Boolean(clean(release.genre) || ingest?.dsp_genre),
      hint: 'Metadata → DSP genre',
    },
    {
      id: 'street-date',
      phase: 'partner_delivery',
      label: 'Street date',
      ok: Boolean(clean(release.release_date)),
      hint: 'Metadata → release date',
    },
    {
      id: 'ingest',
      phase: 'partner_delivery',
      label: 'DSP ingest QC passed',
      ok: Boolean(checks?.dsp_ingest_passed),
      hint: copyright?.ingest?.blockers?.[0] || 'Clear Rights / ingest blockers',
    },
    {
      id: 'rights-ready',
      phase: 'partner_delivery',
      label: 'Copyright pipeline ready to distribute',
      ok: Boolean(checks?.ready_to_distribute),
      hint: copyright?.next_best_action?.label || 'Complete Rights stages',
    },
    {
      id: 'notice-years',
      phase: 'partner_delivery',
      label: '℗ / © notice years',
      ok: hasYear(release.p_line_year) && hasYear(release.c_line_year),
      soft: true,
      hint: 'Metadata → P-line / C-line year (distributor package)',
    },
    {
      id: 'catalog-number',
      phase: 'partner_delivery',
      label: 'Catalog number',
      ok: Boolean(clean(release.catalog_number)),
      soft: true,
      hint: 'Optional but useful for multi-release ops (e.g. SDZ-001)',
    },
    {
      id: 'dsp-profiles',
      phase: 'partner_delivery',
      label: 'At least one DSP artist profile ID',
      ok: Boolean(
        clean(release.spotify_artist_id) ||
          clean(release.apple_artist_id) ||
          clean(release.youtube_artist_id) ||
          ingest?.artist_profiles,
      ),
      soft: true,
      hint: 'Delivery → Spotify / Apple / YouTube artist IDs',
    },

    // —— Label royalty ops (you collect from partner, pay collabs) ——
    {
      id: 'splits-100',
      phase: 'label_royalty_ops',
      label: 'Track splits total 100%',
      ok: Boolean(checks?.splits_total_100),
      soft: true,
      hint: 'Rights → split sheets before paying collaborators',
    },
    {
      id: 'contracts',
      phase: 'label_royalty_ops',
      label: 'Contracts / split paperwork approved',
      ok: Boolean(checks?.contracts_approved),
      soft: true,
      hint: 'Collaborators paid by SERGIKdropz LLC — not by the distributor',
    },
    {
      id: 'legal-lock',
      phase: 'label_royalty_ops',
      label: 'Legal lock',
      ok: Boolean(checks?.legal_locked),
      soft: true,
      hint: 'Rights → legal lock when intake + contracts are done',
    },
    {
      id: 'partner-sole-payee',
      phase: 'label_royalty_ops',
      label: 'Partner payout model: LLC sole payee',
      ok: true,
      soft: true,
      hint: 'Ops policy — DistroKid/Revelator pay Nexus Studios AZ LLC; Studio pays collabs',
    },
    {
      id: 'statement-ingest',
      phase: 'label_royalty_ops',
      label: 'Partner statement ingested',
      ok: Boolean(royaltyOps && royaltyOps.statementCount > 0),
      soft: true,
      hint:
        royaltyOps && royaltyOps.statementCount > 0
          ? `${royaltyOps.statementCount} statement(s) in Royalties`
          : 'Studio → Royalties → Ingest DistroKid / Revelator CSV',
    },
    {
      id: 'payee-ledger',
      phase: 'label_royalty_ops',
      label: 'Payee ledger allocated',
      ok: Boolean(royaltyOps && royaltyOps.ledgerEntryCount > 0),
      soft: true,
      hint:
        royaltyOps && royaltyOps.ledgerEntryCount > 0
          ? `${royaltyOps.ledgerEntryCount} ledger row(s)`
          : 'Ingest allocates Rights split sheets to payees',
    },
    {
      id: 'payout-run',
      phase: 'label_royalty_ops',
      label: 'Collaborator payout recorded',
      ok: Boolean(royaltyOps && royaltyOps.payoutCount > 0),
      soft: true,
      hint:
        royaltyOps && royaltyOps.payoutCount > 0
          ? `${royaltyOps.payoutCount} payout(s)`
          : 'Royalties → Payouts → mark collab rows paid (not LLC retain)',
    },

    // —— Multi-label / eventual distributor ——
    {
      id: 'imprint-not-artist',
      phase: 'multi_label_platform',
      label: 'Imprint distinct from artist branding',
      ok: imprintOk,
      soft: true,
      hint: `${DEFAULT_LABEL_NAME} = label; SERGIK = artist`,
    },
    {
      id: 'monitoring',
      phase: 'multi_label_platform',
      label: 'Post-release monitoring enabled',
      ok: Boolean(checks?.monitoring_enabled),
      soft: true,
      hint: 'Rights → monitoring after go-live (claims, takedowns, SX)',
    },
    {
      id: 'ddex-path',
      phase: 'multi_label_platform',
      label: 'DDEX / direct DSP path (future)',
      ok: false,
      soft: true,
      hint: 'Not available yet — partner delivery first; DDEX ERN when volume justifies',
    },
  ]

  const partnerItems = items.filter((i) => i.phase === 'partner_delivery' && !i.soft)
  const partnerReady = partnerItems.every((i) => i.ok)
  const blockers = partnerItems.filter((i) => !i.ok).map((i) => i.label)
  const warnings = items.filter((i) => i.soft && !i.ok).map((i) => i.label)

  const phases = (Object.keys(PHASE_LABELS) as DistributorReadinessPhase[]).reduce(
    (acc, phase) => {
      const phaseItems = items.filter((i) => i.phase === phase)
      const done = phaseItems.filter((i) => i.ok).length
      const hard = phaseItems.filter((i) => !i.soft)
      acc[phase] = {
        label: PHASE_LABELS[phase],
        done,
        total: phaseItems.length,
        ok: hard.length === 0 ? done === phaseItems.length : hard.every((i) => i.ok),
      }
      return acc
    },
    {} as DistributorReadinessResult['phases'],
  )

  const scored = items.filter((i) => i.ok).length
  const score = items.length ? Math.round((scored / items.length) * 100) : 0

  return {
    ok: partnerReady,
    partnerReady,
    score,
    blockers,
    warnings,
    items,
    phases,
  }
}

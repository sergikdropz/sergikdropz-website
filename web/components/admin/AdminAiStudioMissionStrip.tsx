'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { formatReleaseCountdownLabel } from '@/lib/admin-ai-release-countdown'
import { buildMissionBlockerFixQuickStart } from '@/lib/admin-ai-dock-ui'
import type { AdminAiQuickStart } from '@/lib/admin-ai-quick-starts'
import { sameOriginApiUrl } from '@/lib/same-origin-api'
import type { MissionDockAction, MissionDockModel } from '@/lib/admin-ai-mission-dock'
import {
  RELEASE_MISSION_REFRESH_EVENT,
  type AdminAiStudioNavTarget,
} from '@/lib/admin-ai-studio-nav'
import { studioTargetForBlocker, studioTargetLabel } from '@/lib/studio/rights-action-target'
import { studioReleaseHref, workflowStepForActionKind } from '@/lib/studio/studio-ia'
import { FaBrain, FaRocket, FaSync, FaTools, FaWaveSquare } from 'react-icons/fa'

export type ReleaseMissionSummary = {
  releaseId: string
  title: string
  distributorStatus: string
  releaseDate: string | null
  readinessScore: number | null
  nextAction: string | null
  nextActionKind?: string | null
  blockers: string[]
  blockerIssues?: Array<{ id: string; label: string }>
  emptyMarketingCount: number
  sonicDnaUnified: {
    trackCount: number
    unifiedIntelligenceTracks: number
    copyIntelSignalTracks: number
  }
  timestampsComplete: boolean
  copyDeskNote: string
}

type Props = {
  releaseId?: string
  releaseTitle?: string
  activeStep?: string
  compact?: boolean
  refreshNonce?: number
  disabled?: boolean
  onSnapshot: () => void
  onHarness: () => void
  onCopyDryRun: () => void
  onOpenLaunch: () => void
  onFixTopBlocker?: (start: AdminAiQuickStart) => void
  onOpenBlocker?: (target: AdminAiStudioNavTarget) => void
  onMissionChange?: (mission: ReleaseMissionSummary | null) => void
  /** Composer placement: one status line plus the studio chips, without the thread card. */
  docked?: boolean
  onDraftCopy?: () => void
  draftCopyLabel?: string
  onWeekPriorities?: () => void
  trailing?: ReactNode
  dock?: MissionDockModel
  onAction?: (action: MissionDockAction) => void
}

export default function AdminAiStudioMissionStrip({
  releaseId,
  releaseTitle,
  activeStep,
  compact,
  refreshNonce = 0,
  disabled,
  onSnapshot,
  onHarness,
  onCopyDryRun,
  onOpenLaunch,
  onFixTopBlocker,
  onOpenBlocker,
  onMissionChange,
  docked,
  onDraftCopy,
  draftCopyLabel = 'Draft copy',
  onWeekPriorities,
  trailing,
  dock,
  onAction,
}: Props) {
  const [mission, setMission] = useState<ReleaseMissionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockersOpen, setBlockersOpen] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const loadedReleaseRef = useRef<string | null>(null)
  const [dockOpen, setDockOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const onMissionChangeRef = useRef(onMissionChange)
  onMissionChangeRef.current = onMissionChange

  useEffect(() => {
    setOpenMenu(null)
  }, [dock?.areaLabel, releaseId])

  useEffect(() => {
    if (!releaseId) return
    function onRefresh(event: Event) {
      const id = (event as CustomEvent<{ releaseId?: string }>).detail?.releaseId
      if (id && id !== releaseId) return
      setRefreshTick((tick) => tick + 1)
    }
    window.addEventListener(RELEASE_MISSION_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(RELEASE_MISSION_REFRESH_EVENT, onRefresh)
  }, [releaseId])

  useEffect(() => {
    if (!releaseId) {
      loadedReleaseRef.current = null
      setMission(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    const background = loadedReleaseRef.current === releaseId
    if (!background) setLoading(true)
    setError(null)
    fetch(sameOriginApiUrl(`/api/admin/ai/release-mission?releaseId=${encodeURIComponent(releaseId)}`), {
      credentials: 'same-origin',
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as ReleaseMissionSummary & { error?: string }
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || 'Could not load mission')
          setMission(null)
          loadedReleaseRef.current = null
          onMissionChangeRef.current?.(null)
          return
        }
        loadedReleaseRef.current = releaseId
        setMission(data)
        onMissionChangeRef.current?.(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Mission load failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [releaseId, refreshNonce, refreshTick])

  const title = mission?.title || releaseTitle || 'Release'
  const countdown =
    mission?.releaseDate != null ? formatReleaseCountdownLabel(mission.releaseDate) : null
  const score = mission?.readinessScore
  const unified = mission?.sonicDnaUnified
  const blockers = mission?.blockers ?? []
  const fixStart =
    mission && onFixTopBlocker && releaseId
      ? buildMissionBlockerFixQuickStart(releaseId, {
          nextAction: mission.nextAction,
          nextActionKind: mission.nextActionKind ?? null,
          blockers,
        })
      : null
  const blockerStep = workflowStepForActionKind(mission?.nextActionKind)
  const statusLine = !releaseId
    ? dock?.statusFallback || 'Pick an action below.'
    : loading
      ? 'Loading…'
      : error
        ? error
        : mission?.nextAction || dock?.statusFallback || 'Pick an action below.'
  const areaLabel = dock?.areaLabel || 'Mission'
  const subject = mission?.title || dock?.subject || (!releaseId ? null : title)

  if (docked && dock) {
    const resolvedMenus = dock.menus
      .map((column) => ({
        ...column,
        items: column.items.flatMap((entry): MissionMenuItem[] => {
          if (entry.action.type === 'fix-blocker') {
            if (!fixStart || !onFixTopBlocker) return []
            return [
              {
                id: entry.id,
                label: entry.label,
                title: entry.title || `Open ${blockerStep} in Studio and start the AI fix`,
                className: entry.className,
                onSelect: () => onFixTopBlocker(fixStart),
              },
            ]
          }
          if (!onAction) return []
          return [
            {
              id: entry.id,
              label: entry.label,
              title: entry.title,
              className: entry.className,
              onSelect: () => onAction(entry.action),
            },
          ]
        }),
      }))
      .filter((column) => column.items.length > 0)
    const columnClass =
      resolvedMenus.length <= 1 ? 'grid-cols-1' : resolvedMenus.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

    return (
      <div className="mb-2 rounded-lg border border-purple-500/25 bg-gradient-to-br from-gray-900/90 to-gray-950/95 shadow-inner">
        <button
          type="button"
          onClick={() => {
            setOpenMenu(null)
            setDockOpen((open) => !open)
          }}
          aria-expanded={dockOpen}
          className="flex w-full items-center justify-center gap-2 px-3 py-1.5 text-[11px] hover:bg-purple-950/30"
        >
          <span className="font-semibold uppercase tracking-wide text-purple-300/90">Mission</span>
          <span className="font-medium text-purple-100/90">{areaLabel}</span>
          {subject ? <span className="max-w-[14rem] truncate font-medium text-white">{subject}</span> : null}
          {score != null ? <span className="text-emerald-200/90">{score}%</span> : null}
          {blockers.length > 0 ? (
            <span className="text-amber-200/90">
              {blockers.length} blocker{blockers.length === 1 ? '' : 's'}
            </span>
          ) : null}
          <span className="text-gray-500" aria-hidden>
            {dockOpen ? '▾' : '▸'}
          </span>
        </button>
        {dockOpen ? (
          <div className="space-y-2.5 border-t border-purple-500/20 px-2.5 py-2">
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-center">
              <p className="w-full truncate text-[11px] text-gray-400">{statusLine}</p>
              {score != null ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[10px] text-emerald-200">
                  {score}% ready
                </span>
              ) : null}
              {blockers.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setBlockersOpen((o) => !o)}
                  className="rounded-full border border-amber-500/35 bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-100 hover:text-amber-50"
                  aria-expanded={blockersOpen}
                  title={blockers[0]}
                >
                  {blockers.length} blocker{blockers.length === 1 ? '' : 's'}
                  {blockersOpen ? ' ▾' : ' ▸'}
                </button>
              ) : null}
              {countdown ? (
                <span className="rounded-full border border-fuchsia-500/35 bg-fuchsia-950/40 px-2 py-0.5 text-[10px] text-fuchsia-100/95">
                  {countdown}
                </span>
              ) : null}
              {unified && unified.trackCount > 0 ? (
                <span
                  className="rounded-full border border-cyan-500/30 bg-cyan-950/30 px-2 py-0.5 text-[10px] text-cyan-100/90"
                  title="Unified Sonic DNA"
                >
                  {unified.unifiedIntelligenceTracks}/{unified.trackCount} DNA
                </span>
              ) : null}
              {releaseId ? (
                <Link
                  href={studioReleaseHref(releaseId, activeStep as Parameters<typeof studioReleaseHref>[1])}
                  className="text-[10px] text-purple-300/80 hover:text-purple-100"
                >
                  Open release
                </Link>
              ) : null}
            </div>
            {blockersOpen && blockers.length > 0 ? (
              <BlockerJumpList
                blockers={blockers}
                issues={mission?.blockerIssues}
                releaseId={releaseId}
                onOpen={onOpenBlocker}
                className="mx-auto max-h-24 max-w-md space-y-0.5 overflow-y-auto rounded-md border border-amber-500/20 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-100/90"
              />
            ) : null}
            <div className={`grid gap-2 ${columnClass} ${openMenu ? 'relative z-20' : ''}`}>
              {resolvedMenus.map((column) => (
                <MissionColumnMenu
                  key={column.id}
                  label={column.label}
                  open={openMenu === column.id}
                  disabled={disabled}
                  items={column.items}
                  onToggle={() => setOpenMenu((current) => (current === column.id ? null : column.id))}
                  onPick={() => setOpenMenu(null)}
                />
              ))}
            </div>
            {trailing ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-gray-800/80 pt-2">
                {trailing}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  if (!releaseId) return null

  return (
    <div
      className={`rounded-xl border border-purple-500/25 bg-gradient-to-br from-gray-900/90 to-gray-950/95 shadow-inner ${
        compact ? 'p-2' : 'p-3'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-300/90">
            Release mission control
          </p>
          <Link
            href={studioReleaseHref(releaseId, activeStep as Parameters<typeof studioReleaseHref>[1])}
            className="text-sm font-medium text-white hover:text-purple-100 truncate block max-w-[420px]"
          >
            {title}
          </Link>
          <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
            {loading ? 'Loading snapshot…' : error ? error : mission?.nextAction || 'Snapshot loaded — pick an action.'}
          </p>
          {blockers.length > 0 ? (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setBlockersOpen((o) => !o)}
                className="text-left text-[10px] text-amber-300/90 hover:text-amber-200"
                aria-expanded={blockersOpen}
              >
                {blockers.length} blocker{blockers.length === 1 ? '' : 's'}
                {blockersOpen ? ' ▾' : ' ▸'} · {blockers[0]}
              </button>
              {blockersOpen ? (
                <BlockerJumpList
                  blockers={blockers}
                  issues={mission?.blockerIssues}
                  releaseId={releaseId}
                  onOpen={onOpenBlocker}
                  className="mt-1 max-h-28 space-y-0.5 overflow-y-auto rounded-md border border-amber-500/20 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-100/90"
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {score != null ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-emerald-200">
              {score}% ready
            </span>
          ) : null}
          {blockers.length > 0 ? (
            <span className="rounded-full border border-amber-500/35 bg-amber-950/40 px-2 py-0.5 text-amber-100">
              {blockers.length} blocker{blockers.length === 1 ? '' : 's'}
            </span>
          ) : null}
          {countdown ? (
            <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-400">{countdown}</span>
          ) : null}
          {!compact && unified && unified.trackCount > 0 ? (
            <span className="rounded-full border border-cyan-500/30 bg-cyan-950/30 px-2 py-0.5 text-cyan-100/90">
              {unified.unifiedIntelligenceTracks}/{unified.trackCount} unified DNA
            </span>
          ) : null}
        </div>
      </div>

      {!compact && mission?.emptyMarketingCount ? (
        <p className="mt-2 text-[10px] text-gray-500 line-clamp-2" title={mission.copyDeskNote}>
          {mission.emptyMarketingCount} empty marketing field{mission.emptyMarketingCount === 1 ? '' : 's'}
          {!mission.timestampsComplete ? ' · visualizer timestamps incomplete' : ''}
        </p>
      ) : null}

      {!compact ? (
        <p className="mt-2 text-[10px] leading-relaxed text-gray-600">
          Snapshot = release JSON · Harness = intelligence stack · Copy dry-run = marketing merge preview.
        </p>
      ) : null}

      <div className={`flex flex-wrap gap-1.5 ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
        {fixStart && onFixTopBlocker ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFixTopBlocker(fixStart)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/45 bg-amber-950/35 px-2.5 py-1.5 text-[11px] font-medium text-amber-100 hover:bg-amber-900/40 disabled:opacity-40"
            title={`Open ${blockerStep} in Studio and start AI fix flow`}
          >
            <FaTools className="text-[9px]" />
            Fix top blocker
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={onSnapshot}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-[11px] text-gray-200 hover:border-purple-500/50 disabled:opacity-40"
          title="Run release snapshot dry-run in chat (mission refetches after exec)"
        >
          <FaSync className="text-[9px]" />
          Snapshot
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onHarness}
          className="inline-flex items-center gap-1 rounded-lg border border-cyan-700/40 bg-cyan-950/30 px-2.5 py-1.5 text-[11px] text-cyan-100 hover:bg-cyan-900/30 disabled:opacity-40"
        >
          <FaBrain className="text-[9px]" />
          Harness
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCopyDryRun}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-600/40 bg-violet-950/30 px-2.5 py-1.5 text-[11px] text-violet-100 hover:bg-violet-900/30 disabled:opacity-40"
        >
          <FaWaveSquare className="text-[9px]" />
          Copy dry-run
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onOpenLaunch}
          className="inline-flex items-center gap-1 rounded-lg border border-purple-600/50 bg-purple-600/20 px-2.5 py-1.5 text-[11px] text-purple-100 hover:bg-purple-600/30 disabled:opacity-40"
        >
          <FaRocket className="text-[9px]" />
          Launch step
        </button>
      </div>
    </div>
  )
}

function BlockerJumpList({
  blockers,
  issues,
  releaseId,
  onOpen,
  className,
}: {
  blockers: string[]
  issues?: Array<{ id: string; label: string }>
  releaseId?: string
  onOpen?: (target: AdminAiStudioNavTarget) => void
  className: string
}) {
  return (
    <ul className={className}>
      {blockers.map((blocker, index) => {
        const focus = studioTargetForBlocker(blocker, issues)
        const hint = studioTargetLabel(focus)
        return (
          <li key={`${blocker}-${index}`} className="leading-snug">
            <button
              type="button"
              title={`Open ${hint}`}
              disabled={!releaseId || !onOpen}
              className="w-full cursor-pointer rounded-sm px-0.5 text-left hover:bg-amber-900/30 hover:text-amber-50 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-inherit"
              onClick={() => {
                if (!releaseId || !onOpen) return
                onOpen({
                  releaseId,
                  step: focus.step,
                  section: focus.section,
                  trackId: focus.trackId,
                  party: focus.party,
                })
              }}
            >
              · {blocker}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

type MissionMenuItem = {
  id: string
  label: string
  title?: string
  className?: string
  onSelect: () => void
}

function MissionColumnMenu({
  label,
  open,
  disabled,
  items,
  onToggle,
  onPick,
}: {
  label: string
  open: boolean
  disabled?: boolean
  items: MissionMenuItem[]
  onToggle: () => void
  onPick: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onPick()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, onPick])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || items.length === 0}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-1 rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-200 hover:border-purple-500/40 disabled:opacity-40"
      >
        {label}
        <span className="text-gray-500" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-gray-700 bg-gray-950 py-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={disabled}
              title={item.title}
              className={`block w-full px-2.5 py-1.5 text-left text-[10px] font-medium hover:bg-gray-800 disabled:opacity-40 ${item.className ?? 'text-gray-200'}`}
              onClick={() => {
                onPick()
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

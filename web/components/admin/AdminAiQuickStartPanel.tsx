'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  groupQuickStartHistoryByField,
  QUICK_START_HISTORY_FIELD_COLLAPSE_THRESHOLD,
  QUICK_START_HISTORY_FIELD_GROUP_THRESHOLD,
  unfinishedBusinessEntryToQuickStart,
  UNFINISHED_BUSINESS_VISIBLE_COUNT,
  type AdminAiPriorityHistoryEntry,
  type AdminAiQuickStart,
  type AdminAiUnfinishedBusinessEntry,
  type QuickStartHistoryFieldGroup,
} from '@/lib/admin-ai-quick-starts'
import type { AdminAiPlaybook } from '@/lib/admin-ai-playbooks'
import {
  EMPTY_QUICKSTART_EXPAND,
  loadQuickStartExpandState,
  pickSmartDefaultExpandedSection,
  saveQuickStartExpandState,
  type QuickStartExpandState,
  type QuickStartSectionKey,
} from '@/lib/admin-ai-dock-ui'

type Props = {
  compact?: boolean
  sessionId?: string
  smartExpand?: {
    hasRelease: boolean
    unfinishedCount: number
    priorityCount: number
    blockerCount: number
  }
  sectionCounts?: {
    priority: number
    unfinished: number
    playbooks: number
    creative: number
  }
  priority: AdminAiQuickStart[]
  creative: AdminAiQuickStart[]
  priorityHistory: AdminAiPriorityHistoryEntry[]
  creativeHistory: AdminAiPriorityHistoryEntry[]
  unfinishedBusiness: AdminAiUnfinishedBusinessEntry[]
  allUnfinishedCount?: number
  dismissedUnfinishedHistory?: AdminAiPriorityHistoryEntry[]
  onRefreshUnfinished?: () => void
  onRestoreDismissedUnfinished?: (entry: AdminAiPriorityHistoryEntry) => void
  disabled?: boolean
  onPick: (start: AdminAiQuickStart) => void
  onRefreshPriority: () => void
  onRefreshCreative: () => void
  onDismissUnfinished: (id: string) => void
  priorityPoolExhaustedHint?: boolean
  creativePoolExhaustedHint?: boolean
  showPlaybookSection?: boolean
  playbooks?: AdminAiPlaybook[]
  playbookHistory?: AdminAiPriorityHistoryEntry[]
  playbookPoolExhaustedHint?: boolean
  onRefreshPlaybooks?: () => void
  onRunPlaybook?: (playbook: AdminAiPlaybook) => void
  onPickPlaybookHistory?: (entry: AdminAiPriorityHistoryEntry) => void
}

export default function AdminAiQuickStartPanel({
  compact = false,
  sessionId,
  smartExpand,
  sectionCounts,
  priority,
  creative,
  priorityHistory,
  creativeHistory,
  unfinishedBusiness,
  allUnfinishedCount = 0,
  dismissedUnfinishedHistory = [],
  onRefreshUnfinished,
  onRestoreDismissedUnfinished,
  disabled,
  onPick,
  onRefreshPriority,
  onRefreshCreative,
  onDismissUnfinished,
  priorityPoolExhaustedHint,
  creativePoolExhaustedHint,
  showPlaybookSection = false,
  playbooks = [],
  playbookHistory = [],
  playbookPoolExhaustedHint,
  onRefreshPlaybooks,
  onRunPlaybook,
  onPickPlaybookHistory,
}: Props) {
  const showUnfinishedSection = allUnfinishedCount > 0 || dismissedUnfinishedHistory.length > 0
  const counts = {
    priority: sectionCounts?.priority ?? priority.length,
    unfinished: sectionCounts?.unfinished ?? unfinishedBusiness.length,
    playbooks: sectionCounts?.playbooks ?? playbooks.length,
    creative: sectionCounts?.creative ?? creative.length,
  }
  const [expanded, setExpanded] = useState<QuickStartExpandState>(EMPTY_QUICKSTART_EXPAND)
  const [trayOpen, setTrayOpen] = useState(false)
  const [hydratedSessionId, setHydratedSessionId] = useState<string | null>(null)
  const userTouchedRef = useRef(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!sessionId) return
    userTouchedRef.current = false
    setTrayOpen(false)
    const saved = loadQuickStartExpandState(sessionId)
    if (saved) {
      userTouchedRef.current = true
      setExpanded(saved)
    } else if (smartExpand && !compact) {
      const key = pickSmartDefaultExpandedSection(smartExpand)
      setExpanded(key ? { ...EMPTY_QUICKSTART_EXPAND, [key]: true } : EMPTY_QUICKSTART_EXPAND)
    } else {
      setExpanded(EMPTY_QUICKSTART_EXPAND)
    }
    setHydratedSessionId(sessionId)
    // Smart hints can arrive after hydration; a separate effect updates until the user toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per session
  }, [sessionId])

  useEffect(() => {
    if (compact) return
    if (!sessionId || hydratedSessionId !== sessionId || userTouchedRef.current || !smartExpand) return
    const key = pickSmartDefaultExpandedSection(smartExpand)
    setExpanded(key ? { ...EMPTY_QUICKSTART_EXPAND, [key]: true } : EMPTY_QUICKSTART_EXPAND)
  }, [
    compact,
    sessionId,
    hydratedSessionId,
    smartExpand?.hasRelease,
    smartExpand?.unfinishedCount,
    smartExpand?.priorityCount,
    smartExpand?.blockerCount,
  ])

  useEffect(() => {
    if (!sessionId || hydratedSessionId !== sessionId) return
    saveQuickStartExpandState(sessionId, expanded)
  }, [sessionId, hydratedSessionId, expanded])

  const toggleSection = (key: QuickStartSectionKey) => {
    userTouchedRef.current = true
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const focusSection = (key: QuickStartSectionKey) => {
    userTouchedRef.current = true
    setExpanded({ ...EMPTY_QUICKSTART_EXPAND, [key]: true })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
      const dock = panelRef.current?.closest('[data-admin-ai-panel]')
      if (!dock) return
      const active = document.activeElement
      if (!(active instanceof Node) || !dock.contains(active)) return

      if (e.key === 'Escape') {
        userTouchedRef.current = true
        setExpanded(EMPTY_QUICKSTART_EXPAND)
        if (compact) setTrayOpen(false)
        return
      }
      const map: Record<string, QuickStartSectionKey> = {
        '1': 'priority',
        '2': 'unfinished',
        '3': 'playbooks',
        '4': 'creative',
      }
      const section = map[e.key]
      if (!section) return
      if (section === 'unfinished' && !showUnfinishedSection) return
      if (section === 'playbooks' && !showPlaybookSection) return
      e.preventDefault()
      if (compact) setTrayOpen(true)
      focusSection(section)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compact, showPlaybookSection, showUnfinishedSection])

  const sections = (
    <>
        <QuickStartCollapsibleSection
          title="Needs attention"
          titleClass="text-amber-400/90"
          badgeCount={counts.priority}
          expanded={expanded.priority}
          onToggle={() => toggleSection('priority')}
        >
          <QuickStartSectionHeader
            title="Needs attention"
            titleClass="text-amber-400/90"
            refreshLabel="Refresh priorities"
            refreshTitle="Show four new priority suggestions"
            refreshClass="border-amber-500/40 bg-amber-950/40 text-amber-100 hover:bg-amber-900/50"
            history={priorityHistory}
            disabled={disabled}
            onRefresh={onRefreshPriority}
            onTitleToggle={() => toggleSection('priority')}
            onPickHistory={(entry) =>
              onPick({
                id: entry.id,
                kind: 'priority',
                label: entry.label,
                detail: entry.detail,
                message: entry.message,
                skillId: entry.skillId,
                priorityScore: entry.priorityScore,
              })
            }
            badgeVariant="priority"
          />
          {priorityPoolExhaustedHint ? (
            <p className="px-1 text-[10px] text-amber-300/80">
              Priority pool cycling — attended items stay in history only.
            </p>
          ) : null}
          {priority.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-700 px-3 py-4 text-center text-[11px] text-gray-500">
              No new priority suggestions left — check history or refresh after opening a release in Studio.
            </p>
          ) : (
            priority.map((row) => (
              <QuickStartButton
                key={`${row.id}-${row.priorityScore}`}
                row={row}
                disabled={disabled}
                onPick={onPick}
                variant="priority"
              />
            ))
          )}
        </QuickStartCollapsibleSection>

        {showUnfinishedSection && onRefreshUnfinished && onRestoreDismissedUnfinished ? (
          <QuickStartCollapsibleSection
            title="Unfinished business"
            titleClass="text-teal-400/90"
            badgeCount={counts.unfinished}
            expanded={expanded.unfinished}
            onToggle={() => toggleSection('unfinished')}
          >
            <QuickStartSectionHeader
              title="Unfinished business"
              subtitle="Started or high-impact skips · opens Studio step"
              titleClass="text-teal-400/90"
              refreshLabel="Refresh unfinished"
              refreshTitle="Rotate unfinished business rows"
              refreshClass="border-teal-500/40 bg-teal-950/40 text-teal-100 hover:bg-teal-900/50"
              history={[]}
              historyOnlySections={[
                {
                  title: 'Dismissed',
                  entries: dismissedUnfinishedHistory,
                  onPick: onRestoreDismissedUnfinished,
                },
              ]}
              disabled={disabled}
              refreshDisabled={disabled || allUnfinishedCount <= UNFINISHED_BUSINESS_VISIBLE_COUNT}
              onRefresh={onRefreshUnfinished}
              onPickHistory={onRestoreDismissedUnfinished}
              onTitleToggle={() => toggleSection('unfinished')}
              badgeVariant="unfinished"
            />
            {unfinishedBusiness.map((entry) => (
              <UnfinishedBusinessRow
                key={`${entry.id}-${entry.at}`}
                entry={entry}
                disabled={disabled}
                onPick={() => onPick(unfinishedBusinessEntryToQuickStart(entry))}
                onDismiss={() => onDismissUnfinished(entry.id)}
              />
            ))}
            {unfinishedBusiness.length === 0 && allUnfinishedCount > 0 ? (
              <p className="rounded-xl border border-dashed border-gray-700 px-3 py-4 text-center text-[11px] text-gray-500">
                All visible unfinished items dismissed — check history or refresh the list.
              </p>
            ) : null}
          </QuickStartCollapsibleSection>
        ) : null}

        {showPlaybookSection && onRunPlaybook && onRefreshPlaybooks && onPickPlaybookHistory ? (
          <QuickStartCollapsibleSection
            title="Playbooks"
            titleClass="text-purple-300/90"
            badgeCount={counts.playbooks}
            expanded={expanded.playbooks}
            onToggle={() => toggleSection('playbooks')}
          >
            <QuickStartSectionHeader
              title="Playbooks"
              subtitle="Sequential dry-run /exec chain"
              titleClass="text-purple-300/90"
              refreshLabel="Refresh playbooks"
              refreshTitle="Show the next playbook suggestions"
              refreshClass="border-purple-500/40 bg-purple-950/40 text-purple-100 hover:bg-purple-900/50"
              history={playbookHistory}
              disabled={disabled}
              onRefresh={onRefreshPlaybooks}
              onPickHistory={onPickPlaybookHistory}
              onTitleToggle={() => toggleSection('playbooks')}
              badgeVariant="playbook"
            />
            {playbookPoolExhaustedHint ? (
              <p className="px-1 text-[10px] text-purple-300/80">
                Playbook pool cycling — run items stay in history only.
              </p>
            ) : null}
            {playbooks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-700 px-3 py-4 text-center text-[11px] text-gray-500">
                No playbooks in this rotation — refresh or check history.
              </p>
            ) : (
              playbooks.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onRunPlaybook(book)}
                  className="w-full rounded-xl border border-purple-500/30 bg-purple-950/25 px-3 py-2.5 text-left transition hover:border-purple-400/50 hover:bg-purple-950/40 disabled:opacity-40"
                >
                  <p className="text-sm font-medium text-purple-100">{book.label}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{book.detail}</p>
                  <p className="mt-1 text-[10px] text-gray-600">
                    {book.steps.length} step{book.steps.length === 1 ? '' : 's'} · preview only
                  </p>
                </button>
              ))
            )}
          </QuickStartCollapsibleSection>
        ) : null}

        <QuickStartCollapsibleSection
          title="Explore & grow"
          titleClass="text-violet-400/90"
          badgeCount={counts.creative}
          expanded={expanded.creative}
          onToggle={() => toggleSection('creative')}
        >
          <QuickStartSectionHeader
            title="Explore & grow"
            titleClass="text-violet-400/90"
            refreshLabel="Refresh explore"
            refreshTitle="Show four new explore suggestions"
            refreshClass="border-violet-500/40 bg-violet-950/40 text-violet-100 hover:bg-violet-900/50"
            history={creativeHistory}
            disabled={disabled}
            onRefresh={onRefreshCreative}
            onTitleToggle={() => toggleSection('creative')}
            onPickHistory={(entry) =>
              onPick({
                id: entry.id,
                kind: 'creative',
                label: entry.label,
                detail: entry.detail,
                message: entry.message,
                skillId: entry.skillId,
                priorityScore: entry.priorityScore,
              })
            }
            badgeVariant="creative"
          />
          {creativePoolExhaustedHint ? (
            <p className="px-1 text-[10px] text-violet-300/80">
              Explore pool cycling — attended items stay in history only.
            </p>
          ) : null}
          {creative.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-700 px-3 py-4 text-center text-[11px] text-gray-500">
              No new explore suggestions — check history or open Studio for contextual ideas.
            </p>
          ) : (
            creative.map((row) => (
              <QuickStartButton
                key={`${row.id}-${row.priorityScore}`}
                row={row}
                disabled={disabled}
                onPick={onPick}
                variant="creative"
              />
            ))
          )}
        </QuickStartCollapsibleSection>
    </>
  )

  const suggestionTotal =
    counts.priority +
    (showUnfinishedSection ? counts.unfinished : 0) +
    (showPlaybookSection ? counts.playbooks : 0) +
    counts.creative

  if (compact) {
    return (
      <div
        ref={panelRef}
        tabIndex={0}
        className={`rounded-lg border border-gray-800/80 bg-gray-950/40 outline-none ${
          trayOpen ? 'px-2 py-2' : 'px-2 py-0.5'
        }`}
        aria-label="Suggestions"
      >
        <button
          type="button"
          onClick={() => setTrayOpen((open) => !open)}
          aria-expanded={trayOpen}
          className="flex w-full items-center justify-center gap-1 rounded-lg px-1 py-1.5 transition hover:bg-gray-900/50"
          title={trayOpen ? 'Collapse suggestions' : 'Expand suggestions'}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Suggestions
            {suggestionTotal > 0 ? (
              <span className="font-normal text-gray-500"> · {suggestionTotal}</span>
            ) : null}
          </span>
          <span className="text-[9px] text-gray-600" aria-hidden>
            {trayOpen ? '▾' : '▸'}
          </span>
        </button>
        {trayOpen ? (
          <>
            <p className="mb-1.5 mt-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-600">
              Keys 1–4 expand · Esc collapse
            </p>
            <div className="w-full space-y-1.5">{sections}</div>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      tabIndex={0}
      className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-2 py-6 outline-none"
      aria-label="Quick start"
    >
      <p className="mb-1 text-center text-sm font-medium text-gray-200">Quick start</p>
      <p className="mb-6 max-w-md text-center text-[11px] leading-relaxed text-gray-500">
        Expand a section for priorities, unfinished loops, playbooks, or explore ideas — refresh rotates rows in each pool.
        Press 1–4 to expand a lane, Esc to collapse all.
      </p>
      <div className="w-full max-w-xl space-y-2">{sections}</div>
    </div>
  )
}

type HistoryOnlySection = {
  title: string
  entries: AdminAiPriorityHistoryEntry[]
  onPick: (entry: AdminAiPriorityHistoryEntry) => void
}

function QuickStartCollapsibleSection({
  title,
  titleClass,
  badgeCount,
  expanded,
  onToggle,
  className,
  children,
}: {
  title: string
  titleClass: string
  badgeCount?: number
  expanded: boolean
  onToggle: () => void
  className?: string
  children: ReactNode
}) {
  const countLabel = badgeCount != null && badgeCount > 0 ? ` · ${badgeCount}` : ''

  if (!expanded) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          className="flex w-full items-center justify-center gap-1 rounded-lg px-1 py-1.5 transition hover:bg-gray-900/50"
          title={`Expand ${title}${countLabel}`}
        >
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${titleClass}`}>
            {title}
            {countLabel ? <span className="font-normal text-gray-500">{countLabel}</span> : null}
          </span>
          <span className="text-[9px] text-gray-600" aria-hidden>
            ▸
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {children}
    </div>
  )
}

function QuickStartSectionHeader({
  title,
  subtitle,
  titleClass,
  refreshLabel,
  refreshTitle,
  refreshClass,
  history,
  historyOnlySections,
  disabled,
  refreshDisabled,
  onRefresh,
  onPickHistory,
  onTitleToggle,
  badgeVariant,
  className,
}: {
  title: string
  subtitle?: string
  titleClass: string
  refreshLabel: string
  refreshTitle: string
  refreshClass: string
  history: AdminAiPriorityHistoryEntry[]
  historyOnlySections?: HistoryOnlySection[]
  disabled?: boolean
  refreshDisabled?: boolean
  onRefresh: () => void
  onPickHistory: (entry: AdminAiPriorityHistoryEntry) => void
  onTitleToggle?: () => void
  badgeVariant: QuickStartBadgeVariant
  className?: string
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!historyOpen) return
    const onDoc = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [historyOpen])

  const attended = history.filter((h) => h.status === 'attended')
  const ignored = history.filter((h) => h.status === 'ignored')
  const onlySectionsCount = (historyOnlySections ?? []).reduce((n, s) => n + s.entries.length, 0)
  const useHistoryOnly = Boolean(historyOnlySections?.length && history.length === 0)
  const historyMenuCount = useHistoryOnly ? onlySectionsCount : history.length + onlySectionsCount
  const historyMenuOpen = historyOpen && historyMenuCount > 0

  const titleNode = (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${titleClass}`}>
      {title}
      <span className="text-[9px] font-normal text-gray-500" aria-hidden>
        ▾
      </span>
    </span>
  )

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-1 ${className ?? ''}`}>
      {onTitleToggle ? (
        <button
          type="button"
          onClick={onTitleToggle}
          aria-expanded
          className="rounded px-0.5 py-0.5 text-left transition hover:bg-gray-900/50"
          title={`Collapse ${title}`}
        >
          {titleNode}
        </button>
      ) : (
        titleNode
      )}
      {subtitle ? (
        <p className="hidden min-w-0 flex-1 truncate text-right text-[10px] text-gray-500 sm:block">{subtitle}</p>
      ) : null}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={refreshDisabled ?? disabled}
          onClick={onRefresh}
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium disabled:opacity-40 ${refreshClass}`}
          title={refreshTitle}
        >
          {refreshLabel}
        </button>
        <div className="relative" ref={historyRef}>
          <button
            type="button"
            disabled={disabled || historyMenuCount === 0}
            onClick={() => setHistoryOpen((o) => !o)}
            className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-1 text-[10px] font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            title="Ignored and completed suggestions"
          >
            History{historyMenuCount ? ` (${historyMenuCount})` : ''}
          </button>
          {historyMenuOpen ? (
            <div className="absolute right-0 top-full z-20 mt-1 max-h-[min(24rem,70vh)] w-[min(100vw-2rem,24rem)] overflow-y-auto rounded-lg border border-gray-700 bg-gray-950 py-2 shadow-xl">
              {useHistoryOnly
                ? historyOnlySections!.map((section) =>
                    section.entries.length > 0 ? (
                      <HistorySection
                        key={section.title}
                        title={section.title}
                        entries={section.entries}
                        disabled={disabled}
                        badgeVariant={badgeVariant}
                        onPick={(entry) => {
                          setHistoryOpen(false)
                          section.onPick(entry)
                        }}
                      />
                    ) : null,
                  )
                : null}
              {!useHistoryOnly && historyOnlySections
                ? historyOnlySections.map((section) =>
                    section.entries.length > 0 ? (
                      <HistorySection
                        key={section.title}
                        title={section.title}
                        entries={section.entries}
                        disabled={disabled}
                        badgeVariant={badgeVariant}
                        onPick={(entry) => {
                          setHistoryOpen(false)
                          section.onPick(entry)
                        }}
                      />
                    ) : null,
                  )
                : null}
              {attended.length > 0 ? (
                <HistorySection
                  title="Attended"
                  entries={attended}
                  disabled={disabled}
                  badgeVariant={badgeVariant}
                  onPick={(entry) => {
                    setHistoryOpen(false)
                    onPickHistory(entry)
                  }}
                />
              ) : null}
              {ignored.length > 0 ? (
                <HistorySection
                  title="Skipped on refresh"
                  entries={ignored}
                  disabled={disabled}
                  badgeVariant={badgeVariant}
                  onPick={(entry) => {
                    setHistoryOpen(false)
                    onPickHistory(entry)
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {subtitle ? <p className="w-full text-[10px] text-gray-500 sm:hidden">{subtitle}</p> : null}
    </div>
  )
}

type QuickStartBadgeVariant = 'priority' | 'creative' | 'playbook' | 'unfinished'

function HistorySection({
  title,
  entries,
  disabled,
  onPick,
  badgeVariant,
}: {
  title: string
  entries: AdminAiPriorityHistoryEntry[]
  disabled?: boolean
  onPick: (entry: AdminAiPriorityHistoryEntry) => void
  badgeVariant: QuickStartBadgeVariant
}) {
  const groupByField = entries.length > QUICK_START_HISTORY_FIELD_GROUP_THRESHOLD
  const fieldGroups = groupByField ? groupQuickStartHistoryByField(entries) : null

  return (
    <div className="border-b border-gray-800 px-2 pb-2 last:border-0">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      {groupByField && fieldGroups ? (
        <div className="space-y-2">
          {fieldGroups.map((group) => (
            <HistoryFieldGroup
              key={`${title}-${group.fieldId}`}
              group={group}
              disabled={disabled}
              badgeVariant={badgeVariant}
              onPick={onPick}
            />
          ))}
        </div>
      ) : (
        <HistoryEntryList entries={entries} disabled={disabled} badgeVariant={badgeVariant} onPick={onPick} />
      )}
    </div>
  )
}

function HistoryFieldGroup({
  group,
  disabled,
  onPick,
  badgeVariant,
}: {
  group: QuickStartHistoryFieldGroup
  disabled?: boolean
  onPick: (entry: AdminAiPriorityHistoryEntry) => void
  badgeVariant: QuickStartBadgeVariant
}) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = group.entries.length > QUICK_START_HISTORY_FIELD_COLLAPSE_THRESHOLD

  if (!collapsible) {
    return (
      <div className="space-y-0.5">
        <p className="px-2 text-[10px] font-medium text-gray-400">{group.fieldLabel}</p>
        <HistoryEntryList
          entries={group.entries}
          disabled={disabled}
          badgeVariant={badgeVariant}
          onPick={onPick}
        />
      </div>
    )
  }

  return (
    <div className="rounded-md border border-gray-800/80 bg-gray-900/40">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setExpanded((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[10px] font-medium text-gray-300 hover:bg-gray-800/60 disabled:opacity-40"
        aria-expanded={expanded}
      >
        <span className="truncate">{group.fieldLabel}</span>
        <span className="shrink-0 tabular-nums text-gray-500">
          {group.entries.length} {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-gray-800/80 pb-1">
          <HistoryEntryList
            entries={group.entries}
            disabled={disabled}
            badgeVariant={badgeVariant}
            onPick={onPick}
          />
        </div>
      ) : null}
    </div>
  )
}

function HistoryEntryList({
  entries,
  disabled,
  onPick,
  badgeVariant,
}: {
  entries: AdminAiPriorityHistoryEntry[]
  disabled?: boolean
  onPick: (entry: AdminAiPriorityHistoryEntry) => void
  badgeVariant: QuickStartBadgeVariant
}) {
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => (
        <li key={`${entry.id}-${entry.at}`}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(entry)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-800/80 disabled:opacity-40"
          >
            <ImpactBadge score={entry.priorityScore} compact variant={badgeVariant} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-gray-200">{entry.label}</span>
              <span className="block truncate text-[10px] text-gray-500">{entry.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ImpactBadge({
  score,
  compact,
  variant,
}: {
  score?: number
  compact?: boolean
  variant: QuickStartBadgeVariant
}) {
  const value = score ?? 5
  const tone =
    variant === 'creative'
      ? value >= 9
        ? 'bg-violet-500/30 text-violet-100 border-violet-400/50'
        : value >= 7
          ? 'bg-violet-500/20 text-violet-200 border-violet-500/40'
          : 'bg-gray-700/80 text-gray-300 border-gray-600'
      : variant === 'playbook'
        ? value >= 9
          ? 'bg-purple-500/30 text-purple-100 border-purple-400/50'
          : value >= 7
            ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
            : 'bg-gray-700/80 text-gray-300 border-gray-600'
        : variant === 'unfinished'
          ? value >= 9
            ? 'bg-teal-500/30 text-teal-100 border-teal-400/50'
            : value >= 7
              ? 'bg-teal-500/20 text-teal-200 border-teal-500/40'
              : 'bg-gray-700/80 text-gray-300 border-gray-600'
          : value >= 9
            ? 'bg-rose-500/25 text-rose-200 border-rose-500/40'
            : value >= 7
              ? 'bg-amber-500/25 text-amber-100 border-amber-500/40'
              : 'bg-gray-700/80 text-gray-300 border-gray-600'
  return (
    <span
      className={`shrink-0 rounded border font-mono tabular-nums ${tone} ${
        compact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      }`}
      title={`Impact ${value}/10`}
    >
      {value}
    </span>
  )
}

function UnfinishedBusinessRow({
  entry,
  disabled,
  onPick,
  onDismiss,
}: {
  entry: AdminAiUnfinishedBusinessEntry
  disabled?: boolean
  onPick: () => void
  onDismiss: () => void
}) {
  const badgeVariant: QuickStartBadgeVariant = entry.kind === 'creative' ? 'creative' : 'unfinished'
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className="flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-teal-500/35 bg-teal-950/25 px-3 py-2.5 text-left text-gray-100 transition hover:bg-teal-900/30 disabled:opacity-40"
      >
        <ImpactBadge score={entry.priorityScore} variant={badgeVariant} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium leading-snug">{entry.label}</span>
            <span
              className={`rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                entry.unfinishedReason === 'started'
                  ? 'bg-teal-500/20 text-teal-200'
                  : 'bg-gray-700/80 text-gray-400'
              }`}
            >
              {entry.unfinishedReason === 'started' ? 'Started' : 'Skipped'}
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-400">{entry.detail}</span>
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDismiss}
        className="shrink-0 rounded-lg border border-gray-700 px-2 text-[10px] text-gray-500 hover:bg-gray-800 hover:text-gray-300 disabled:opacity-40"
        title="Dismiss from unfinished list"
        aria-label="Dismiss unfinished item"
      >
        ✕
      </button>
    </div>
  )
}

function QuickStartButton({
  row,
  disabled,
  onPick,
  variant,
}: {
  row: AdminAiQuickStart
  disabled?: boolean
  onPick: (start: AdminAiQuickStart) => void
  variant: 'priority' | 'creative'
}) {
  const base =
    variant === 'priority'
      ? 'border-amber-500/35 bg-amber-950/25 hover:bg-amber-900/35 text-amber-50'
      : 'border-violet-500/30 bg-violet-950/20 hover:bg-violet-900/30 text-gray-100'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(row)}
      className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-40 ${base}`}
    >
      <ImpactBadge score={row.priorityScore} variant={variant} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-snug">{row.label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed opacity-75">{row.detail}</span>
      </span>
    </button>
  )
}

'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FaChevronRight, FaGripVertical } from 'react-icons/fa'
import {
  LEDGER_COLUMN_LABELS,
  LEDGER_DEFAULT_COLUMN_ORDER,
  LEDGER_DEFAULT_COLUMN_WIDTHS,
  LEDGER_OPTIONAL_COLUMNS,
  clampLedgerColumnWidth,
  ledgerColumnAlign,
  loadLedgerColumnOrder,
  loadLedgerColumnVisibility,
  loadLedgerColumnWidths,
  reorderLedgerColumns,
  saveLedgerColumnOrder,
  saveLedgerColumnVisibility,
  saveLedgerColumnWidths,
  visibleLedgerColumns,
  type LedgerColumnKey,
  type LedgerOptionalColumn,
} from '@/lib/studio/royalties/ledger-columns'
import {
  sortLedgerGroupsBy,
  type LedgerSortDir,
  type LedgerSortField,
  type LedgerTrackGroup,
} from '@/lib/studio/royalties/ledger-groups'
import type { RoyaltyLedgerEntry } from '@/lib/studio/royalties/types'
import { studioReleaseHref } from '@/lib/studio/studio-ia'

const SORT_KEY = 'sergik-royalties-ledger-sort'
const SORT_FIELDS = new Set<LedgerSortField>(LEDGER_DEFAULT_COLUMN_ORDER)

type TableSort = { field: string; dir: LedgerSortDir }

type ColumnSlot =
  | { kind: 'column'; key: LedgerColumnKey }
  | { kind: 'platform'; id: string; label: string }

function platformCents(group: LedgerTrackGroup, id: string): number {
  return group.platforms.find((item) => item.id === id)?.cents || 0
}

type LineSortField = 'payee' | 'store' | 'split' | 'amount' | 'status'

const LINE_COLUMNS: { field: LineSortField; label: string; align: 'left' | 'right' }[] = [
  { field: 'payee', label: 'Payee', align: 'left' },
  { field: 'store', label: 'Store', align: 'left' },
  { field: 'split', label: 'Split', align: 'right' },
  { field: 'amount', label: 'Amount', align: 'right' },
  { field: 'status', label: 'Status', align: 'left' },
]

function moneyClass(cents: number): string {
  if (cents > 0) return 'text-emerald-300'
  if (cents < 0) return 'text-amber-300'
  return 'text-zinc-400'
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'paid'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'voided'
        ? 'bg-zinc-700/40 text-zinc-500'
        : 'bg-amber-500/15 text-amber-200'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  )
}

function sortLines(rows: RoyaltyLedgerEntry[], field: LineSortField, dir: LedgerSortDir): RoyaltyLedgerEntry[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    switch (field) {
      case 'payee':
        return a.payeeName.localeCompare(b.payeeName) * (dir === 'asc' ? 1 : -1)
      case 'store':
        return (a.store || '').localeCompare(b.store || '') * (dir === 'asc' ? 1 : -1)
      case 'split':
        return (a.splitPercent - b.splitPercent) * sign
      case 'amount':
        return (a.amountCents - b.amountCents) * sign
      case 'status':
        return a.status.localeCompare(b.status) * (dir === 'asc' ? 1 : -1)
    }
  })
}

export default function RoyaltyLedgerTable({ groups }: { groups: LedgerTrackGroup[] }) {
  const [order, setOrder] = useState<LedgerColumnKey[]>(LEDGER_DEFAULT_COLUMN_ORDER)
  const [visible, setVisible] = useState<Set<LedgerOptionalColumn>>(() => new Set(LEDGER_OPTIONAL_COLUMNS))
  const [widths, setWidths] = useState(LEDGER_DEFAULT_COLUMN_WIDTHS)
  const [sort, setSort] = useState<TableSort>({
    field: 'amount',
    dir: 'desc',
  })
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())
  const [lineSort, setLineSort] = useState<{ field: LineSortField; dir: LedgerSortDir } | null>(null)
  const [dragOver, setDragOver] = useState<LedgerColumnKey | null>(null)
  const [resizing, setResizing] = useState<LedgerColumnKey | null>(null)
  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number } | null>(null)
  const dragColumn = useRef<LedgerColumnKey | null>(null)
  const suppressHeaderClick = useRef(false)
  const widthsRef = useRef(widths)
  const menuRef = useRef<HTMLDivElement | null>(null)
  widthsRef.current = widths

  useEffect(() => {
    setOrder(loadLedgerColumnOrder())
    setVisible(loadLedgerColumnVisibility())
    setWidths(loadLedgerColumnWidths())
    try {
      const raw = localStorage.getItem(SORT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { field?: string; dir?: string }
      if (
        parsed.field &&
        (parsed.dir === 'asc' || parsed.dir === 'desc') &&
        (SORT_FIELDS.has(parsed.field as LedgerSortField) || /^platform:[a-z0-9_]+$/.test(parsed.field))
      ) {
        setSort({ field: parsed.field, dir: parsed.dir })
      }
    } catch {
      /* keep the default */
    }
  }, [])

  useEffect(() => {
    if (!columnMenu) return
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setColumnMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [columnMenu])

  const columns = useMemo(() => visibleLedgerColumns(order, visible), [order, visible])
  const platformColumns = useMemo(() => {
    const totals = new Map<string, { id: string; label: string; cents: number }>()
    for (const group of groups) {
      for (const platform of group.platforms) {
        const current = totals.get(platform.id) || { id: platform.id, label: platform.label, cents: 0 }
        current.cents += platform.cents
        totals.set(platform.id, current)
      }
    }
    return Array.from(totals.values()).sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label))
  }, [groups])
  const slots = useMemo(() => {
    const next: ColumnSlot[] = []
    let placed = false
    for (const column of columns) {
      next.push({ kind: 'column', key: column })
      if (column === 'amount') {
        placed = true
        for (const platform of platformColumns) next.push({ kind: 'platform', ...platform })
      }
    }
    if (!placed) {
      for (const platform of platformColumns) next.push({ kind: 'platform', ...platform })
    }
    return next
  }, [columns, platformColumns])
  const sorted = useMemo(() => {
    if (sort.field.startsWith('platform:')) {
      const id = sort.field.slice('platform:'.length)
      const sign = sort.dir === 'asc' ? 1 : -1
      return [...groups].sort(
        (a, b) => (platformCents(a, id) - platformCents(b, id)) * sign || a.title.localeCompare(b.title),
      )
    }
    if (SORT_FIELDS.has(sort.field as LedgerSortField)) {
      return sortLedgerGroupsBy(groups, sort.field as LedgerSortField, sort.dir)
    }
    return sortLedgerGroupsBy(groups, 'amount', 'desc')
  }, [groups, sort])

  function applySort(field: LedgerSortField) {
    if (sort.field === field) {
      saveSort({ field, dir: sort.dir === 'asc' ? 'desc' : 'asc' })
      return
    }
    const descFirst =
      field === 'amount' || field === 'lines' || field === 'youtubeAmount' || field === 'instagramAmount'
    saveSort({ field, dir: descFirst ? 'desc' : 'asc' })
  }

  function applyPlatformSort(id: string) {
    const field = `platform:${id}`
    if (sort.field === field) {
      saveSort({ field, dir: sort.dir === 'asc' ? 'desc' : 'asc' })
      return
    }
    saveSort({ field, dir: 'desc' })
  }

  function saveSort(next: TableSort) {
    setSort(next)
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function toggleColumn(key: LedgerOptionalColumn) {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size <= 1) return prev
        next.delete(key)
      } else {
        next.add(key)
      }
      saveLedgerColumnVisibility(next)
      return next
    })
  }

  function onColumnDrop(target: LedgerColumnKey) {
    const from = dragColumn.current
    dragColumn.current = null
    setDragOver(null)
    if (!from) return
    setOrder((prev) => {
      const next = reorderLedgerColumns(prev, from, target)
      saveLedgerColumnOrder(next)
      return next
    })
  }

  function onResizeStart(column: LedgerColumnKey, event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = widthsRef.current[column]
    setResizing(column)
    const move = (moveEvent: PointerEvent) => {
      const nextWidth = clampLedgerColumnWidth(startWidth + (moveEvent.clientX - startX))
      setWidths((prev) => {
        const next = { ...prev, [column]: nextWidth }
        widthsRef.current = next
        return next
      })
    }
    const up = () => {
      setResizing(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      saveLedgerColumnWidths(widthsRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function toggleOpen(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function applyLineSort(field: LineSortField) {
    setLineSort((current) => {
      if (current?.field === field) {
        return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { field, dir: field === 'amount' || field === 'split' ? 'desc' : 'asc' }
    })
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
      <table className="w-full table-fixed text-sm" data-testid="royalties-ledger-table">
        <colgroup>
          <col style={{ width: 32 }} />
          {slots.map((slot) => (
            <col
              key={slot.kind === 'column' ? slot.key : slot.id}
              style={{ width: slot.kind === 'column' ? widths[slot.key] : 112 }}
            />
          ))}
        </colgroup>
        <thead>
          <tr
            className="border-b border-zinc-800 text-zinc-500"
            title="Drag headers to reorder · Drag column right edge to resize · Click to sort · Right-click columns"
            onContextMenu={(event) => {
              event.preventDefault()
              setColumnMenu({ x: event.clientX, y: event.clientY })
            }}
          >
            <th className="w-8 py-2 px-1" aria-label="Expand" />
            {slots.map((slot) => {
              if (slot.kind === 'platform') {
                const field = `platform:${slot.id}`
                const active = sort.field === field
                return (
                  <th
                    key={field}
                    data-testid={`royalties-ledger-col-${slot.id}`}
                    className="relative py-2 px-2 text-right cursor-pointer hover:text-white"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    onClick={() => applyPlatformSort(slot.id)}
                  >
                    <span className={`inline-flex items-center gap-1 select-none ${active ? 'text-violet-300' : ''}`}>
                      <span className="truncate">{slot.label}</span>
                      {active ? <span className="text-violet-400">{sort.dir === 'asc' ? '↑' : '↓'}</span> : null}
                    </span>
                  </th>
                )
              }
              const column = slot.key
              const align = ledgerColumnAlign(column)
              const active = sort.field === column
              const label = LEDGER_COLUMN_LABELS[column]
              return (
                <th
                  key={column}
                  draggable={!resizing}
                  data-testid={`royalties-ledger-col-${column}`}
                  style={{ width: widths[column], minWidth: widths[column], maxWidth: widths[column] }}
                  className={`relative py-2 px-2 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer hover:text-white ${
                    dragOver === column ? 'bg-violet-900/30 ring-1 ring-inset ring-violet-500/40' : ''
                  } ${resizing === column ? 'bg-violet-900/20' : ''}`}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => {
                    if (suppressHeaderClick.current) {
                      suppressHeaderClick.current = false
                      return
                    }
                    applySort(column)
                  }}
                  onDragStart={() => {
                    dragColumn.current = column
                    suppressHeaderClick.current = true
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOver(column)
                  }}
                  onDragLeave={() => setDragOver((current) => (current === column ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault()
                    onColumnDrop(column)
                  }}
                  onDragEnd={() => {
                    dragColumn.current = null
                    setDragOver(null)
                  }}
                >
                  <span
                    className={`inline-flex max-w-full items-center gap-1 select-none ${
                      align === 'right' ? 'flex-row-reverse' : ''
                    } ${active ? 'text-violet-300' : ''}`}
                  >
                    <FaGripVertical
                      className="h-3 w-3 shrink-0 cursor-grab opacity-30"
                      aria-hidden
                      onClick={(event) => event.stopPropagation()}
                    />
                    <span className="truncate">{label}</span>
                    {active ? <span className="text-violet-400">{sort.dir === 'asc' ? '↑' : '↓'}</span> : null}
                  </span>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${label} column`}
                    title="Drag to resize column"
                    className={`absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize touch-none ${
                      resizing === column ? 'bg-violet-500/50' : 'hover:bg-violet-500/30'
                    }`}
                    onPointerDown={(event) => onResizeStart(column, event)}
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => event.preventDefault()}
                  />
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((group) => {
            const open = openKeys.has(group.key)
            const lines = lineSort ? sortLines(group.rows, lineSort.field, lineSort.dir) : group.rows
            return (
              <Fragment key={group.key}>
                <tr
                  className="border-b border-zinc-800/80 cursor-pointer hover:bg-zinc-800/30"
                  onClick={() => toggleOpen(group.key)}
                >
                  <td className="py-2 px-1 text-center text-zinc-500">
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 hover:text-white"
                      aria-expanded={open}
                      aria-label={open ? `Collapse ${group.title}` : `Expand ${group.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleOpen(group.key)
                      }}
                    >
                      <FaChevronRight
                        className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
                        aria-hidden
                      />
                    </button>
                  </td>
                  {slots.map((slot) =>
                    slot.kind === 'platform' ? (
                      <td key={slot.id} className="py-2 px-2 text-right">
                        <MoneyCell cents={platformCents(group, slot.id)} />
                      </td>
                    ) : (
                      <td
                        key={slot.key}
                        className={`py-2 px-2 ${
                          slot.key === 'youtube' || slot.key === 'instagram' ? '' : 'truncate'
                        } ${ledgerColumnAlign(slot.key) === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        <TrackCell group={group} column={slot.key} />
                      </td>
                    ),
                  )}
                </tr>
                {open && (
                  <tr className="border-b border-zinc-800 bg-black/30">
                    <td colSpan={slots.length + 1} className="px-3 py-3">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-zinc-500">
                            {LINE_COLUMNS.map((column) => {
                              const active = lineSort?.field === column.field
                              return (
                                <th
                                  key={column.field}
                                  className={`px-3 py-2 font-medium cursor-pointer hover:text-white ${
                                    column.align === 'right' ? 'text-right' : 'text-left'
                                  } ${active ? 'text-violet-300' : ''}`}
                                  onClick={() => applyLineSort(column.field)}
                                >
                                  <span className="inline-flex items-center gap-1 select-none">
                                    {column.label}
                                    {active ? (
                                      <span className="text-violet-400">{lineSort?.dir === 'asc' ? '↑' : '↓'}</span>
                                    ) : null}
                                  </span>
                                </th>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {lines.map((row) => (
                            <tr key={row.id} className="text-zinc-300">
                              <td className="px-3 py-2">{row.payeeName}</td>
                              <td className="px-3 py-2 text-zinc-500">{row.store || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono text-xs">{row.splitPercent}%</td>
                              <td className={`px-3 py-2 text-right font-mono ${moneyClass(row.amountCents)}`}>
                                {formatCents(row.amountCents)}
                              </td>
                              <td className="px-3 py-2">
                                <StatusPill status={row.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {columnMenu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Choose visible columns"
          className="fixed z-50 min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-900 py-2 shadow-xl"
          style={{
            top: Math.max(8, Math.min(columnMenu.y, window.innerHeight - 280)),
            left: Math.max(8, Math.min(columnMenu.x, window.innerWidth - 220)),
          }}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <p className="px-3 pb-2 text-[10px] leading-snug text-zinc-500">
            Drag headers to reorder · Drag the right edge to resize · Click a header to sort
          </p>
          <div className="border-t border-zinc-800 pt-1">
            {LEDGER_OPTIONAL_COLUMNS.slice()
              .sort((a, b) => order.indexOf(a) - order.indexOf(b))
              .map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/80"
                >
                  <input
                    type="checkbox"
                    checked={visible.has(key)}
                    disabled={visible.has(key) && visible.size <= 1}
                    onChange={() => toggleColumn(key)}
                    className="rounded border-zinc-600 bg-zinc-800 text-violet-500 focus:ring-violet-500"
                  />
                  <span>{LEDGER_COLUMN_LABELS[key]}</span>
                </label>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MoneyCell({ cents }: { cents: number }) {
  if (cents === 0) return <span className="text-zinc-600">—</span>
  return <span className={`font-mono ${moneyClass(cents)}`}>{formatCents(cents)}</span>
}

function TrackCell({ group, column }: { group: LedgerTrackGroup; column: LedgerColumnKey }) {
  if (column === 'title') {
    return group.releaseId ? (
      <Link
        href={studioReleaseHref(group.releaseId, 'rights')}
        className="text-violet-300 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {group.title}
      </Link>
    ) : (
      <span className="font-medium text-zinc-100">{group.title}</span>
    )
  }
  if (column === 'lines') return <span className="font-mono text-xs text-zinc-400">{group.rows.length}</span>
  if (column === 'amount') {
    return <span className={`font-mono ${moneyClass(group.amountCents)}`}>{formatCents(group.amountCents)}</span>
  }
  if (column === 'youtube' || column === 'instagram') {
    const ids = column === 'youtube' ? group.youtubeIds : group.instagramIds
    const hrefFor =
      column === 'youtube'
        ? (id: string) => `https://www.youtube.com/watch?v=${id}`
        : (id: string) => `https://www.instagram.com/p/${id}/`
    if (!ids.length) return <span className="text-zinc-600">—</span>
    return (
      <span className="inline-flex max-w-full flex-wrap gap-x-2 gap-y-1">
        {ids.slice(0, 3).map((id) => (
          <a
            key={id}
            href={hrefFor(id)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-zinc-300 hover:text-violet-300"
            onClick={(event) => event.stopPropagation()}
          >
            {id}
          </a>
        ))}
        {ids.length > 3 ? <span className="text-zinc-500">+{ids.length - 3}</span> : null}
      </span>
    )
  }
  const cents = column === 'youtubeAmount' ? group.youtubeCents : group.instagramCents
  if (cents === 0) return <span className="text-zinc-600">—</span>
  return <span className={`font-mono ${moneyClass(cents)}`}>{formatCents(cents)}</span>
}

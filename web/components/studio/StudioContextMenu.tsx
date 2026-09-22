'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import PopupMenuDragHeader from '@/components/ui/PopupMenuDragHeader'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'

export type StudioContextMenuCommand = {
  id: string
  label: string
  icon?: ReactNode
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export type StudioContextMenuEntry =
  | { type: 'command'; command: StudioContextMenuCommand }
  | { type: 'separator' }
  | { type: 'heading'; label: string }

type Props = {
  open: boolean
  x: number
  y: number
  title: string
  items: StudioContextMenuEntry[]
  onClose: () => void
}

function isEnabledCommand(
  entry: StudioContextMenuEntry
): entry is { type: 'command'; command: StudioContextMenuCommand } {
  return entry.type === 'command' && !entry.command.disabled
}

export default function StudioContextMenu({ open, x, y, title, items, onClose }: Props) {
  const labelId = useId()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const clamp = useClampedFixedMenuPosition(open, open ? { x, y } : null, {
    width: 268,
    height: 420,
  }, { externalRef: menuRef })

  const enabledIds = useMemo(
    () => items.filter(isEnabledCommand).map((entry) => entry.command.id),
    [items]
  )

  useEffect(() => {
    if (!open) {
      setActiveId(null)
      return
    }
    setActiveId(enabledIds[0] ?? null)
  }, [open, enabledIds])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (menuRef.current && target && menuRef.current.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (!enabledIds.length) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const current = activeId ? enabledIds.indexOf(activeId) : -1
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const next =
          current < 0
            ? event.key === 'ArrowDown'
              ? 0
              : enabledIds.length - 1
            : (current + delta + enabledIds.length) % enabledIds.length
        setActiveId(enabledIds[next])
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const command = items.find(
          (entry): entry is { type: 'command'; command: StudioContextMenuCommand } =>
            entry.type === 'command' && entry.command.id === activeId
        )?.command
        if (!command || command.disabled) return
        event.preventDefault()
        command.onSelect()
        onClose()
      }
    }

    const onScroll = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return
      }
      onClose()
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [activeId, enabledIds, items, onClose, open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={clamp.ref}
      {...clamp.rootProps}
      role="menu"
      aria-labelledby={labelId}
      className="fixed w-[268px] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
      style={clamp.style}
      onContextMenu={(event) => event.preventDefault()}
    >
      <PopupMenuDragHeader
        title={<span id={labelId}>{title}</span>}
        headerProps={clamp.headerProps}
      />
      <div className="py-1">
        {items.map((entry, index) => {
          if (entry.type === 'separator') {
            return <div key={`sep-${index}`} className="my-1 border-t border-zinc-800" />
          }
          if (entry.type === 'heading') {
            return (
              <p
                key={`heading-${entry.label}-${index}`}
                className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
              >
                {entry.label}
              </p>
            )
          }
          const { command } = entry
          const active = command.id === activeId
          return (
            <button
              key={command.id}
              type="button"
              role="menuitem"
              disabled={command.disabled}
              aria-disabled={command.disabled || undefined}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                command.danger
                  ? 'text-red-400 hover:bg-red-950/40'
                  : 'text-zinc-200 hover:bg-zinc-800/90'
              } ${active ? (command.danger ? 'bg-red-950/40' : 'bg-zinc-800') : ''}`}
              onMouseEnter={() => {
                if (!command.disabled) setActiveId(command.id)
              }}
              onClick={() => {
                if (command.disabled) return
                command.onSelect()
                onClose()
              }}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">
                {command.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{command.label}</span>
              {command.shortcut ? (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
                  {command.shortcut}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

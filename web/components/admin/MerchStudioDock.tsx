'use client'

import type { ReactNode } from 'react'
import type { BlankColor } from '@/lib/merch/blanks'

export type StudioDockTool = 'color' | 'edit' | 'guide' | 'photo'

type DockProps = {
  colors: BlankColor[]
  sellColors: string[]
  previewHex: string
  onPreviewColor: (hex: string, name: string) => void
  activeTool: StudioDockTool | null
  onToggleTool: (tool: StudioDockTool) => void
  guidePinned: boolean
  canFlip: boolean
  onFlip: () => void
  canSpin: boolean
  onSpin: () => void
  canCopyToBack: boolean
  onCopyToBack: () => void
  onResetLayer: () => void
  onAddArt: () => void
  hasLayer: boolean
  hasPhoto: boolean
  photoMode: boolean
  onTogglePhoto: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

function DockIcon({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition ${
        disabled ? 'opacity-35' : active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">{children}</span>
      <span className="text-[9px] font-medium tracking-wide uppercase">{label}</span>
    </button>
  )
}

export default function MerchStudioDock({
  colors,
  sellColors,
  previewHex,
  onPreviewColor,
  activeTool,
  onToggleTool,
  guidePinned,
  onFlip,
  canFlip,
  canSpin,
  onSpin,
  canCopyToBack,
  onCopyToBack,
  onResetLayer,
  onAddArt,
  hasLayer,
  hasPhoto,
  photoMode,
  onTogglePhoto,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: DockProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
      {activeTool === 'color' && (
        <div className="pointer-events-auto flex max-w-md flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-black/75 px-4 py-3 backdrop-blur-md">
          {colors.map((color) => {
            const onSale = sellColors.includes(color.name)
            const previewing = color.hex === previewHex
            return (
              <button
                key={color.name}
                type="button"
                title={color.name}
                onClick={() => onPreviewColor(color.hex, color.name)}
                className={`relative h-9 w-9 rounded-full border-2 ${
                  previewing ? 'border-white scale-105' : onSale ? 'border-white/50' : 'border-transparent'
                }`}
                style={{ background: color.hex }}
              >
                {previewing && (
                  <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-white/90" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="pointer-events-auto flex max-w-[min(100%,920px)] items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/80 px-2 py-1.5 shadow-lg backdrop-blur-md">
        <DockIcon label="Color" active={activeTool === 'color'} onClick={() => onToggleTool('color')}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3c-4 0-7 2.5-7 6.5 0 2.2 1.2 4 3 5.2V19a2 2 0 002 2h4a2 2 0 002-2v-4.3c1.8-1.2 3-3 3-5.2C19 5.5 16 3 12 3z" />
          </svg>
        </DockIcon>
        <DockIcon label="Add" onClick={onAddArt}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </DockIcon>
        <DockIcon
          label="Edit"
          active={activeTool === 'edit'}
          disabled={!hasLayer}
          onClick={() => onToggleTool('edit')}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 20h4l10-10-4-4L4 16v4z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
        </DockIcon>
        <DockIcon label="Spin" disabled={!canSpin} onClick={onSpin}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 4a8 8 0 108 8" />
            <path d="M12 4v3M12 4l2 2" />
          </svg>
        </DockIcon>
        <DockIcon label="Flip" disabled={!canFlip} onClick={onFlip}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M7 7h10v10H7z" opacity="0.35" />
            <path d="M8 4h8M8 20h8M4 12H2M22 12h-2" />
          </svg>
        </DockIcon>
        <DockIcon label="Copy" disabled={!canCopyToBack} onClick={onCopyToBack}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="8" y="8" width="11" height="11" rx="1" />
            <path d="M6 16V6a2 2 0 012-2h10" />
          </svg>
        </DockIcon>
        <DockIcon label="Reset" disabled={!hasLayer} onClick={onResetLayer}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 12a8 8 0 0114-5" />
            <path d="M18 4v4h-4" />
          </svg>
        </DockIcon>
        <DockIcon label="Guide" active={activeTool === 'guide' || guidePinned} onClick={() => onToggleTool('guide')}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="3 2" />
            <rect x="8" y="8" width="8" height="8" rx="0.5" opacity="0.5" />
          </svg>
        </DockIcon>
        {hasPhoto && (
          <DockIcon label="Photo" active={photoMode} onClick={onTogglePhoto}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="4" y="6" width="16" height="12" rx="2" />
              <circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none" />
              <path d="M4 16l4-4 3 3 2-2 7 7" />
            </svg>
          </DockIcon>
        )}
        <span className="mx-1 h-8 w-px bg-white/15" aria-hidden />
        <DockIcon label="Undo" disabled={!canUndo} onClick={onUndo}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9 7H5v4" />
            <path d="M5 11a7 7 0 107 7" />
          </svg>
        </DockIcon>
        <DockIcon label="Redo" disabled={!canRedo} onClick={onRedo}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M15 7h4v4" />
            <path d="M19 11a7 7 0 11-7 7" />
          </svg>
        </DockIcon>
      </div>
    </div>
  )
}

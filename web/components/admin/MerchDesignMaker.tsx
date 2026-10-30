'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  type WheelEvent,
} from 'react'
import type { BlankColor, BlankPlacement, GarmentFamily } from '@/lib/merch/blanks'
import { sameMerchArt } from '@/lib/merch/art-url'
import type { CatalogAddOnRow } from '@/lib/merch/catalog-add-ons'
import type { CatalogPrintFile, CatalogProductDetail, CatalogTechnique } from '@/lib/merch/printful-catalog-types'
import {
  mitigationGuidelines,
  scalePlacementAboutCenter,
  type ArtPlacement,
  type DesignStatus,
} from '@/lib/merch/design'
import { dpiGradeRingClass, type DpiGrade } from '@/lib/merch/design'
import { rotationAlignAxis, snapRotation, type RotationAlignAxis } from '@/lib/merch/placement-snap'
import { MERCH_ART_ACCEPT, useMerchArtDropUpload } from '@/lib/merch/art-upload-drop'
import { EMBROIDERY_THREADS, embroideryThreadByHex } from '@/lib/merch/embroidery-threads'
import GarmentMatImage from '@/components/shop/GarmentMatImage'

export function RotationAlignGuides({
  cx,
  cy,
  rotation,
}: {
  cx: number
  cy: number
  rotation: number
}) {
  const active = rotationAlignAxis(rotation)
  const axes: RotationAlignAxis[] = [0, 45, 90, 135]
  return (
    <div className="pointer-events-none absolute inset-0 z-[7] overflow-hidden" aria-hidden>
      {axes.map((angle) => {
        const on = active === angle
        return (
          <div
            key={angle}
            className={`absolute h-px w-[220%] ${
              on ? 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]' : 'bg-cyan-300/40'
            }`}
            style={{
              left: `${cx * 100}%`,
              top: `${cy * 100}%`,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
              animation: 'rotation-guide-in 140ms ease-out',
            }}
          />
        )
      })}
      <style>{`@keyframes rotation-guide-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  )
}

export function PrintAreaSnapGuides({ vertical, horizontal }: { vertical: number[]; horizontal: number[] }) {
  if (vertical.length === 0 && horizontal.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" aria-hidden>
      {vertical.map((line) => (
        <div
          key={`snap-v-${line}`}
          className="absolute top-0 bottom-0 w-0 border-l-2 border-dotted border-cyan-300/90 shadow-[0_0_8px_rgba(103,232,249,0.35)]"
          style={{ left: `${line * 100}%` }}
        />
      ))}
      {horizontal.map((line) => (
        <div
          key={`snap-h-${line}`}
          className="absolute left-0 right-0 h-0 border-t-2 border-dotted border-cyan-300/90 shadow-[0_0_8px_rgba(103,232,249,0.35)]"
          style={{ top: `${line * 100}%` }}
        />
      ))}
    </div>
  )
}

export function DpiQualityHint({ grade }: { grade: DpiGrade }) {
  return (
    <p className="mx-auto mt-2 max-w-[440px] text-center text-[11px] text-white/55">
      Print quality:{' '}
      <span
        className={
          grade === 'good' ? 'text-sky-300' : grade === 'fair' ? 'text-amber-300' : 'text-red-300'
        }
      >
        {grade === 'good' ? '150+ DPI' : grade === 'fair' ? '100–149 DPI' : 'Under 100 DPI'}
      </span>
      {' · '}
      Blue ≥150, yellow ≥100, red below 100
    </p>
  )
}
import { printfulProductUrl } from '@/lib/merch/catalog-studio'
import { sortSizes } from '@/lib/merch/sizes'
import MerchMannequin from '@/components/admin/MerchMannequin'
import MerchProductSpecs from '@/components/admin/MerchProductSpecs'
import MerchAiArtPanel from '@/components/admin/MerchAiArtPanel'
import MerchTextDesigner from '@/components/admin/MerchTextDesigner'

export type StageView = 'preview' | 'design'

export type DesignNavId =
  | 'product'
  | 'uploads'
  | 'text'
  | 'saved'
  | 'clipart'
  | 'quick'
  | 'premium'
  | 'fill'
  | 'layers'
  | 'help'

export type DesignTab = { id: string; label: string }

export type DesignStageToolbarProps = {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  busy: string | null
  onSaveDesign: () => void
  onSaveHidden: () => void
}

function StageIconButton({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-black/30 text-sm text-white/80 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}

export function DesignSaveRow({ toolbar }: { toolbar: DesignStageToolbarProps }) {
  const saving = Boolean(toolbar.busy)
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={toolbar.onSaveHidden}
        disabled={saving}
        className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs text-white/85 hover:bg-white/10 disabled:text-white/35"
      >
        {saving && toolbar.busy === 'Saving hidden' ? 'Saving…' : 'Save hidden'}
      </button>
      <button
        type="button"
        onClick={toolbar.onSaveDesign}
        disabled={saving}
        className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs text-white/85 hover:bg-white/10 disabled:text-white/35"
      >
        {saving && toolbar.busy === 'Saving' ? 'Saving…' : 'Save design'}
      </button>
    </div>
  )
}

export function PlacementViewTabs({
  tabs,
  activeTabId,
  onTab,
  toolbar,
  underTabs,
}: {
  tabs: DesignTab[]
  activeTabId: string
  onTab: (id: string) => void
  toolbar?: DesignStageToolbarProps
  underTabs?: ReactNode
}) {
  if (tabs.length === 0) return null
  const saving = Boolean(toolbar?.busy)
  return (
    <nav aria-label="Placements" className="relative z-20 shrink-0 px-4 pb-3 pt-4">
      <div className="flex items-center gap-2">
        {toolbar ? (
          <StageIconButton
            label="Undo"
            title="Undo (⌘Z)"
            disabled={!toolbar.canUndo || saving}
            onClick={toolbar.onUndo}
          >
            ↶
          </StageIconButton>
        ) : (
          <span className="w-9 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="mx-auto flex w-max gap-1">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTab(tab.id)}
                  className={`relative shrink-0 px-4 py-2 text-sm ${
                    active
                      ? 'bg-white/10 text-white after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-x-[7px] after:border-t-[7px] after:border-x-transparent after:border-t-white/10'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
        {toolbar ? (
          <StageIconButton
            label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={!toolbar.canRedo || saving}
            onClick={toolbar.onRedo}
          >
            ↷
          </StageIconButton>
        ) : (
          <span className="w-9 shrink-0" aria-hidden />
        )}
      </div>
      {underTabs ? <div className="mt-2">{underTabs}</div> : null}
    </nav>
  )
}

type ArtUpload = { id: string; label: string; url: string; origin?: 'user' | 'printful' }

type PlacedLayer = { id: string; label: string; url: string }

type SavedDesignRow = { id: string; name: string; status: string }

const NAV: Array<{ id: DesignNavId; label: string }> = [
  { id: 'product', label: 'Product' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'text', label: 'Text' },
  { id: 'saved', label: 'Saved designs' },
  { id: 'layers', label: 'Layers' },
  { id: 'quick', label: 'AI Art' },
  { id: 'help', label: 'Help' },
]

const DESIGN_NAV_SCROLL =
  'overflow-x-auto [scrollbar-width:thin] [scrollbar-color:transparent_transparent] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent'

function DesignMakerNavBar({ nav, onNav }: { nav: DesignNavId; onNav: (id: DesignNavId) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })

  const updateScrollEdges = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setScrollEdges({
      left: el.scrollLeft > 2,
      right: maxScroll > 2 && el.scrollLeft < maxScroll - 2,
    })
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScrollEdges()
    el.addEventListener('scroll', updateScrollEdges, { passive: true })
    const observer = new ResizeObserver(updateScrollEdges)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollEdges)
      observer.disconnect()
    }
  }, [updateScrollEdges])

  const scrollNav = (direction: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.55), behavior: 'smooth' })
  }

  return (
    <nav aria-label="Design Maker sidebar" className="relative flex h-[45px] shrink-0 items-center border-b border-white/10 bg-black/30">
      {scrollEdges.left ? (
        <button
          type="button"
          aria-label="Show earlier tools"
          onClick={() => scrollNav(-1)}
          className="absolute left-0 top-0 z-10 flex h-full w-8 items-center justify-center bg-gradient-to-r from-[#141414] via-[#141414]/90 to-transparent text-lg leading-none text-white/80 hover:text-white"
        >
          ‹
        </button>
      ) : null}
      {scrollEdges.right ? (
        <button
          type="button"
          aria-label="Show more tools"
          onClick={() => scrollNav(1)}
          className="absolute right-0 top-0 z-10 flex h-full w-8 items-center justify-center bg-gradient-to-l from-[#141414] via-[#141414]/90 to-transparent text-lg leading-none text-white/80 hover:text-white"
        >
          ›
        </button>
      ) : null}
      <div
        ref={scrollerRef}
        className={`flex gap-1 px-2 ${DESIGN_NAV_SCROLL} ${scrollEdges.left ? 'pl-7' : ''} ${scrollEdges.right ? 'pr-7' : ''}`}
      >
        {NAV.map((item) => {
          const active = nav === item.id
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNav(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left ${
                active ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <NavIcon id={item.id} />
              <span className="whitespace-nowrap text-[11px] font-medium leading-none">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function StageModeSwitch({
  view,
  onChange,
  zoom,
  onZoom,
}: {
  view: StageView
  onChange: (view: StageView) => void
  /** Preview view zoom, 1–2.5. Shown under the mode buttons. */
  zoom?: number
  onZoom?: (value: number) => void
}) {
  return (
    <div>
      <div className="flex justify-center gap-2">
        <ModeButton active={view === 'preview'} onClick={() => onChange('preview')}>
          Preview
        </ModeButton>
        <ModeButton active={view === 'design'} onClick={() => onChange('design')}>
          Design
        </ModeButton>
      </div>
      {onZoom ? (
        <label
          className="mx-auto mt-2 flex w-48 items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/60"
          title="Zoom the preview. Double-click to reset. Does not change the print size."
          onDoubleClick={(event) => {
            event.preventDefault()
            onZoom(1)
          }}
        >
          Zoom
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.01}
            value={zoom ?? 1}
            aria-label="Zoom preview"
            onChange={(event) => onZoom(Number(event.target.value))}
            className="w-full accent-white"
          />
        </label>
      ) : null}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        active ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function fittedFrame(containerWidth: number, containerHeight: number, aspect: number) {
  if (containerWidth <= 0 || containerHeight <= 0 || aspect <= 0) return null
  let width = containerWidth
  let height = width / aspect
  if (height > containerHeight) {
    height = containerHeight
    width = height * aspect
  }
  return { width, height }
}

function artHeightFraction(layer: ArtPlacement | undefined, area: BlankPlacement) {
  if (!layer || area.printWidth <= 0 || layer.assetWidth <= 0) return layer?.scale || 0
  return (layer.scale * area.printWidth * (layer.assetHeight / layer.assetWidth)) / area.printHeight
}

function normalizeRotation(degrees: number): number {
  let rotation = degrees
  while (rotation > 180) rotation -= 360
  while (rotation < -180) rotation += 360
  return rotation
}

function pointerAngleDeg(clientX: number, clientY: number, originX: number, originY: number): number {
  return (Math.atan2(clientY - originY, clientX - originX) * 180) / Math.PI
}

function primaryPointerHeld(event: { buttons: number }): boolean {
  return (event.buttons & 1) === 1
}

const ART_HANDLE_BASE =
  'absolute z-10 flex h-5 w-5 touch-none select-none items-center justify-center rounded-full border border-white/85 bg-black/75 text-[10px] font-bold text-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] hover:bg-black/90'

export function PlacedArtLayer({
  layer,
  heightFraction,
  activeDpiGrade,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  onWheel,
  onContextMenu,
  onAdjust,
  onAdjustStart,
  onAdjustEnd,
  onRotationGuide,
}: {
  layer: ArtPlacement
  heightFraction: number
  activeDpiGrade: DpiGrade | null
  onMovePointerDown: (event: PointerEvent<HTMLImageElement>) => void
  onMovePointerMove: (event: PointerEvent<HTMLImageElement>) => void
  onMovePointerUp: (event: PointerEvent<HTMLImageElement>) => void
  onWheel: (event: WheelEvent<HTMLImageElement>) => void
  onContextMenu: (event: MouseEvent) => void
  onAdjust: (patch: Partial<ArtPlacement>) => void
  onAdjustStart: () => void
  onAdjustEnd: () => void
  onRotationGuide?: (active: boolean) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const transformModeRef = useRef<'rotate' | 'scale' | null>(null)
  const rotateSnapRef = useRef<{ startRotation: number; startPointerAngle: number } | null>(null)
  const scaleSnapRef = useRef<{
    start: { x: number; y: number; scale: number }
    startHeight: number
    startDistance: number
    anchorX: number
    anchorY: number
  } | null>(null)
  const transformSessionRef = useRef(false)
  const alignHoldRef = useRef<number | null>(null)
  const onRotationGuideRef = useRef(onRotationGuide)
  onRotationGuideRef.current = onRotationGuide
  const onAdjustRef = useRef(onAdjust)
  onAdjustRef.current = onAdjust
  const onAdjustEndRef = useRef(onAdjustEnd)
  onAdjustEndRef.current = onAdjustEnd
  const [activeHandle, setActiveHandle] = useState<'rotate' | 'scale' | null>(null)

  const endTransform = useCallback(() => {
    const hadSession = transformSessionRef.current
    transformModeRef.current = null
    rotateSnapRef.current = null
    scaleSnapRef.current = null
    transformSessionRef.current = false
    alignHoldRef.current = null
    setActiveHandle(null)
    onRotationGuideRef.current?.(false)
    if (hadSession) onAdjustEndRef.current()
  }, [])

  useEffect(() => {
    if (activeHandle === null) return

    const onWindowMove = (event: globalThis.PointerEvent) => {
      if (!primaryPointerHeld(event)) {
        endTransform()
        return
      }
      const mode = transformModeRef.current
      if (mode === 'rotate' && rotateSnapRef.current) {
        const box = boxRef.current?.getBoundingClientRect()
        if (!box) return
        const cx = box.left + box.width / 2
        const cy = box.top + box.height / 2
        const angle = pointerAngleDeg(event.clientX, event.clientY, cx, cy)
        const delta = angle - rotateSnapRef.current.startPointerAngle
        const raw = normalizeRotation(rotateSnapRef.current.startRotation + delta)
        const snapped = snapRotation(raw, alignHoldRef.current)
        alignHoldRef.current = snapped.held
        onAdjustRef.current({ rotation: snapped.rotation })
        return
      }
      if (mode === 'scale' && scaleSnapRef.current) {
        const snap = scaleSnapRef.current
        const distance = Math.hypot(event.clientX - snap.anchorX, event.clientY - snap.anchorY)
        const ratio = distance / snap.startDistance
        onAdjustRef.current(scalePlacementAboutCenter(snap.start, snap.startHeight, snap.start.scale * ratio))
      }
    }

    const onWindowEnd = () => endTransform()

    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowEnd)
    window.addEventListener('pointercancel', onWindowEnd)
    return () => {
      window.removeEventListener('pointermove', onWindowMove)
      window.removeEventListener('pointerup', onWindowEnd)
      window.removeEventListener('pointercancel', onWindowEnd)
    }
  }, [activeHandle, endTransform])

  const onRotatePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.preventDefault()
    if (event.button !== 0) return
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    onAdjustStart()
    transformSessionRef.current = true
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    rotateSnapRef.current = {
      startRotation: layer.rotation,
      startPointerAngle: pointerAngleDeg(event.clientX, event.clientY, cx, cy),
    }
    transformModeRef.current = 'rotate'
    alignHoldRef.current = null
    onRotationGuideRef.current?.(true)
    setActiveHandle('rotate')
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Window listeners still end the gesture if capture fails.
    }
  }

  const onScalePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.preventDefault()
    if (event.button !== 0) return
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    const anchorX = box.left + box.width / 2
    const anchorY = box.top + box.height / 2
    const startDistance = Math.hypot(event.clientX - anchorX, event.clientY - anchorY)
    if (startDistance < 4) return
    onAdjustStart()
    transformSessionRef.current = true
    scaleSnapRef.current = {
      start: { x: layer.x, y: layer.y, scale: layer.scale },
      startHeight: heightFraction,
      startDistance,
      anchorX,
      anchorY,
    }
    transformModeRef.current = 'scale'
    setActiveHandle('scale')
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Window listeners still end the gesture if capture fails.
    }
  }

  return (
    <div
      ref={boxRef}
      data-art-layer=""
      className="absolute touch-none select-none"
      style={{
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        width: `${layer.scale * 100}%`,
        height: `${heightFraction * 100}%`,
        transform: `rotate(${layer.rotation}deg)`,
        transformOrigin: 'center',
      }}
    >
      <img
        src={layer.assetUrl}
        alt=""
        draggable={false}
        title="Drag to move. Right-click for options."
        onPointerDown={onMovePointerDown}
        onPointerMove={onMovePointerMove}
        onPointerUp={onMovePointerUp}
        onPointerCancel={onMovePointerUp}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
        className={`absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing ${
          activeDpiGrade ? dpiGradeRingClass(activeDpiGrade) : ''
        }`}
      />
      <button
        type="button"
        aria-label="Drag to rotate"
        title="Drag to rotate. Guides appear every 45°."
        onPointerDown={onRotatePointerDown}
        onLostPointerCapture={endTransform}
        className={`${ART_HANDLE_BASE} -right-2.5 -top-2.5 cursor-grab ${
          activeHandle === 'rotate' ? 'bg-white/25 ring-1 ring-white/50' : ''
        }`}
      >
        ↻
      </button>
      <button
        type="button"
        aria-label="Drag to resize"
        title="Click and drag to resize"
        onPointerDown={onScalePointerDown}
        onLostPointerCapture={endTransform}
        className={`${ART_HANDLE_BASE} -bottom-2.5 -right-2.5 cursor-nwse-resize ${
          activeHandle === 'scale' ? 'bg-white/25 ring-1 ring-white/50' : ''
        }`}
      >
        ⤡
      </button>
    </div>
  )
}

export function MerchDesignCanvas({
  tabs,
  activeTabId,
  onTab,
  colorName,
  colorHex,
  garmentUrl,
  garmentBackground = null,
  patternUrl = null,
  useTemplateMockup = false,
  garmentAspect = null,
  family,
  placementId,
  area,
  areaRef,
  layer,
  outside,
  onDropFile,
  onUploadClick,
  onArtPointerDown,
  onArtPointerMove,
  onArtPointerUp,
  onArtWheel,
  onArtContextMenu,
  onArtAdjust,
  onArtAdjustStart,
  onArtAdjustEnd,
  onOptimizeForPrint,
  onRotationGuide,
  showRotationGuides = false,
  showPrintGuide,
  printInsetX,
  printInsetY,
  boundToInset = false,
  activeDpiGrade,
  snapGuides,
  stageToolbar,
  underTabs,
  matColor,
  onStageBackdropContextMenu,
}: {
  tabs: DesignTab[]
  activeTabId: string
  onTab: (id: string) => void
  stageToolbar?: DesignStageToolbarProps
  underTabs?: ReactNode
  colorName: string
  colorHex: string
  garmentUrl: string | null
  /** Printful `background_color` for a transparent ghost template. */
  garmentBackground?: string | null
  /** Color photo drawn through a positioning silhouette. */
  patternUrl?: string | null
  /** Printful positioning template — skip 3D back flip; placement is per template. */
  useTemplateMockup?: boolean
  /** Width / height of the garment image, known before it loads (template_width / template_height). */
  garmentAspect?: number | null
  family: GarmentFamily
  placementId: string
  area: BlankPlacement
  areaRef: RefObject<HTMLDivElement | null>
  layer: ArtPlacement | undefined
  outside: boolean
  onDropFile: (file: File) => void
  onUploadClick: () => void
  onArtPointerDown: (event: PointerEvent<HTMLImageElement>) => void
  onArtPointerMove: (event: PointerEvent<HTMLImageElement>) => void
  onArtPointerUp: (event: PointerEvent<HTMLImageElement>) => void
  onArtWheel: (event: WheelEvent<HTMLImageElement>) => void
  onArtContextMenu: (event: MouseEvent) => void
  onArtAdjust: (patch: Partial<ArtPlacement>) => void
  onArtAdjustStart: () => void
  onArtAdjustEnd: () => void
  /** Size the active art inside the stitch or print edge. */
  onOptimizeForPrint?: () => void
  onRotationGuide?: (active: boolean) => void
  /** 45° lines through the art, shown while a rotate gesture is active. */
  showRotationGuides?: boolean
  showPrintGuide: boolean
  printInsetX: number
  printInsetY: number
  /** Embroidery stitch margin is the design limit. The band outside it is not stitched. */
  boundToInset?: boolean
  activeDpiGrade: DpiGrade | null
  snapGuides?: { vertical: number[]; horizontal: number[] }
  /** Flat color behind the cut-out product. Does not recolor the garment image. */
  matColor?: string | null
  onStageBackdropContextMenu?: (event: MouseEvent) => void
}) {
  const height = artHeightFraction(layer, area)
  /** Match preview stand-in: back uses rotateY(180) on the card plus scaleX(-1) on the photo — not flip alone. */
  const showBackGarment = !useTemplateMockup && placementId === 'back'
  const viewportRef = useRef<HTMLDivElement>(null)
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null)
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null)
  const metaAspect = useTemplateMockup && garmentAspect && garmentAspect > 0 ? garmentAspect : null
  const frameAspect = naturalAspect || metaAspect || 3 / 4

  useEffect(() => {
    setNaturalAspect(null)
  }, [garmentUrl])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const measure = () => {
      const style = getComputedStyle(node)
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      setFrame(fittedFrame(node.clientWidth - padX, node.clientHeight - padY, frameAspect))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [frameAspect])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PlacementViewTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTab={onTab}
        toolbar={stageToolbar}
        underTabs={underTabs}
      />
      <div
        ref={viewportRef}
        className="relative z-0 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-4"
        onContextMenu={(event) => {
          const target = event.target
          if (!(target instanceof Element) || target.closest('button, [data-art-layer]')) return
          event.preventDefault()
          onStageBackdropContextMenu?.(event)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files?.[0]
          if (file) onDropFile(file)
        }}
      >
        <div
          data-stage-garment=""
          className="relative max-h-full max-w-full"
          style={{
            width: frame?.width,
            height: frame?.height,
            aspectRatio: String(frameAspect),
            ...(showBackGarment ? { perspective: '1280px' } : {}),
          }}
        >
          <div
            className="relative h-full w-full"
            style={{
              ...(showBackGarment
                ? { transformStyle: 'preserve-3d' as const, transform: 'rotateY(180deg)' }
                : {}),
              backgroundColor: garmentUrl ? undefined : matColor || undefined,
            }}
          >
            {garmentUrl ? (
              <GarmentMatImage
                src={garmentUrl}
                matColor={matColor}
                garmentColor={patternUrl ? null : garmentBackground}
                patternUrl={patternUrl}
                className="pointer-events-none absolute inset-0"
                imgClassName={`absolute inset-0 h-full w-full ${
                  useTemplateMockup ? 'object-fill' : 'object-contain'
                }`}
                imgStyle={showBackGarment ? { transform: 'scaleX(-1)' } : undefined}
                onLoad={(event) => {
                  const image = event.currentTarget
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setNaturalAspect(image.naturalWidth / image.naturalHeight)
                  }
                }}
              />
            ) : (
              <MerchMannequin
                family={family}
                color={colorHex}
                placement={showBackGarment ? 'back' : 'front'}
                idPrefix="design"
              />
            )}
            <div
              ref={areaRef as Ref<HTMLDivElement>}
              className="absolute"
              style={{
                left: `${area.stage.x * 100}%`,
                top: `${area.stage.y * 100}%`,
                width: `${area.stage.w * 100}%`,
                height: `${area.stage.h * 100}%`,
              }}
            >
              {boundToInset && (printInsetX > 0 || printInsetY > 0) ? (
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-0 border border-dashed border-white/20" />
                  <div
                    className={`absolute border border-dashed ${
                      outside ? 'border-red-400/90' : showPrintGuide ? 'border-white' : 'border-white/90'
                    }`}
                    style={{
                      left: `${printInsetX * 100}%`,
                      top: `${printInsetY * 100}%`,
                      right: `${printInsetX * 100}%`,
                      bottom: `${printInsetY * 100}%`,
                      boxShadow: '0 0 0 999px rgba(0,0,0,0.42)',
                    }}
                  />
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className={`absolute inset-0 border border-dashed ${
                      outside ? 'border-red-400/90' : showPrintGuide ? 'border-white' : 'border-white/90'
                    }`}
                  />
                  {printInsetX > 0 || printInsetY > 0 ? (
                    <div
                      className="absolute border border-dashed border-white/25"
                      style={{
                        left: `${printInsetX * 100}%`,
                        top: `${printInsetY * 100}%`,
                        right: `${printInsetX * 100}%`,
                        bottom: `${printInsetY * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
              )}
              {snapGuides ? (
                <PrintAreaSnapGuides vertical={snapGuides.vertical} horizontal={snapGuides.horizontal} />
              ) : null}
              {showRotationGuides && layer?.assetUrl ? (
                <RotationAlignGuides
                  cx={layer.x + layer.scale / 2}
                  cy={layer.y + height / 2}
                  rotation={layer.rotation}
                />
              ) : null}
              {layer?.assetUrl ? (
                <PlacedArtLayer
                  layer={layer}
                  heightFraction={height}
                  activeDpiGrade={activeDpiGrade}
                  onMovePointerDown={onArtPointerDown}
                  onMovePointerMove={onArtPointerMove}
                  onMovePointerUp={onArtPointerUp}
                  onWheel={onArtWheel}
                  onContextMenu={onArtContextMenu}
                  onAdjust={onArtAdjust}
                  onAdjustStart={onArtAdjustStart}
                  onAdjustEnd={onArtAdjustEnd}
                  onRotationGuide={onRotationGuide}
                />
              ) : (
                <button
                  type="button"
                  onClick={onUploadClick}
                  className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] leading-snug text-white/80 hover:text-white"
                >
                  Upload or drop your design here
                </button>
              )}
            </div>
          </div>
          {layer?.assetUrl && onOptimizeForPrint ? (
            <button
              type="button"
              onClick={onOptimizeForPrint}
              title="Size this art inside the stitch or print area without stretching it"
              className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white ring-1 ring-white/25 backdrop-blur-md hover:bg-black"
            >
              Optimize for print
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function mitigationPlacementLabel(file: CatalogPrintFile): string {
  const text = `${file.type} ${file.title}`.toLowerCase()
  const wideFront = text.includes('front') && /(?:^|[^a-z])(?:large|wide)(?:[^a-z]|$)/.test(text)
  if (wideFront) return 'Front Wide'
  return placementTabLabel(file.title || file.type)
}

function PlacementTools({
  file,
  hasArt,
  scale,
  scaleMax,
  rotation,
  onFit,
  onCenter,
  onOptimizeForPrint,
  onScale,
  onRotate,
  onResetScale,
  onResetRotation,
  onGestureStart,
  onGestureEnd,
  onRotatePointerDown,
  onRotatePointerUp,
}: {
  file: CatalogPrintFile | undefined
  hasArt: boolean
  scale: number
  scaleMax: number
  rotation: number
  onFit?: () => void
  onCenter?: () => void
  onOptimizeForPrint?: () => void
  onScale?: (value: number) => void
  onRotate?: (value: number) => void
  onResetScale?: () => void
  onResetRotation?: () => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
  onRotatePointerDown?: () => void
  onRotatePointerUp?: () => void
}) {
  const label = file ? mitigationPlacementLabel(file) : 'This placement'
  const max = Math.max(0.05, scaleMax || 1)
  const min = Math.min(0.15, max)
  const facts = mitigationGuidelines({
    printfulType: file?.type,
    label,
    printWidth: file?.printWidth || 0,
    printHeight: file?.printHeight || 0,
    dpi: file?.dpi ?? null,
  }).filter((line) => line.id === 'print-file' || line.id === 'stitch' || line.id === 'print-edge')
  return (
    <section aria-label="Placement tools" className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">{label}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onFit}
          disabled={!hasArt || !onFit}
          className="flex-1 rounded-lg bg-white/10 py-1.5 text-[10px] uppercase tracking-[0.14em] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={onCenter}
          disabled={!hasArt || !onCenter}
          className="flex-1 rounded-lg bg-white/10 py-1.5 text-[10px] uppercase tracking-[0.14em] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Center
        </button>
      </div>
      <button
        type="button"
        onClick={onOptimizeForPrint}
        disabled={!hasArt || !onOptimizeForPrint}
        title="Size this art inside the stitch or print area without stretching it"
        className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-[10px] uppercase tracking-[0.14em] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Optimize for print
      </button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label
          className="text-[10px] uppercase tracking-[0.12em] text-white/45"
          title="Double-click to reset scale"
          onDoubleClick={(event) => {
            event.preventDefault()
            onResetScale?.()
          }}
        >
          Scale
          <input
            type="range"
            min={min}
            max={max}
            step={0.01}
            value={Math.min(Math.max(scale, min), max)}
            disabled={!hasArt || !onScale}
            onPointerDown={onGestureStart}
            onPointerUp={onGestureEnd}
            onChange={(event) => onScale?.(Number(event.target.value))}
            className="mt-1 w-full accent-white disabled:opacity-40"
          />
        </label>
        <label
          className="text-[10px] uppercase tracking-[0.12em] text-white/45"
          title="Double-click to reset rotation"
          onDoubleClick={(event) => {
            event.preventDefault()
            onResetRotation?.()
          }}
        >
          Rotate
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={rotation}
            disabled={!hasArt || !onRotate}
            onPointerDown={() => {
              onGestureStart?.()
              onRotatePointerDown?.()
            }}
            onPointerUp={() => {
              onRotatePointerUp?.()
              onGestureEnd?.()
            }}
            onChange={(event) => onRotate?.(Number(event.target.value))}
            className="mt-1 w-full accent-white disabled:opacity-40"
          />
        </label>
      </div>
      {facts.length > 0 ? (
        <dl className="mt-3 space-y-1.5 border-t border-white/10 pt-2">
          {facts.map((line) => (
            <div key={line.id}>
              <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">{line.label}</dt>
              <dd className="text-[11px] leading-snug text-white/75">{line.detail}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

function MitigationGuidelines({ file }: { file: CatalogPrintFile | undefined }) {
  const [open, setOpen] = useState(false)
  const lines = mitigationGuidelines({
    printfulType: file?.type,
    label: file ? mitigationPlacementLabel(file) : undefined,
    printWidth: file?.printWidth || 0,
    printHeight: file?.printHeight || 0,
    dpi: file?.dpi,
  })
  return (
    <section aria-label="Mitigation" className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex w-full items-center justify-center text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 hover:text-white/70"
      >
        Mitigation
        <span aria-hidden className={`absolute right-0 top-1/2 -translate-y-1/2 transition ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open ? (
        <ul className="mt-2 space-y-1.5">
          {lines.map((line) => (
            <li key={line.id} className="text-[11px] leading-relaxed text-white/70">
              <span className="font-medium text-white/90">{line.label}. </span>
              {line.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function MerchDesignSidebar({
  nav,
  onNav,
  detail,
  technique,
  techniques,
  onTechnique,
  printFiles,
  activePrintFileType,
  embroideryUnlimitedColor,
  onEmbroideryUnlimitedColor,
  embroideryThreadNote,
  embroideryThreadColors,
  onEmbroideryThreadColor,
  onPullStitchFile,
  onPhotographColor,
  productName,
  onProductName,
  previewColorName,
  swatchColors,
  onPreviewColor,
  previewSize,
  onPreviewSize,
  sizes,
  onToggleSize,
  onSetSizes,
  uploadInputRef,
  onUploadFile,
  uploads,
  activeLayerUrl,
  onPlaceArt,
  onArtCreated,
  onRemoveBackground,
  onUploadContextMenu,
  placed,
  onFocusLayer,
  saved,
  onOpenSaved,
  addOnRows,
  wholesale,
  costLive,
  price,
  onPrice,
  keep,
  note,
  busy,
  uploadProgress,
  publishProgress,
  status,
  designId,
  canPutOut,
  onPutItOut,
  onSaveDraft,
  onVisibility,
  guidelinesOpen,
  onToggleGuidelines,
  activeDpiGrade,
  onOptimizeQuality,
  placementScale = 1,
  placementScaleMax = 1,
  placementRotation = 0,
  onFitPlacement,
  onCenterPlacement,
  onOptimizeForPrint,
  onPlacementScale,
  onPlacementRotate,
  onResetPlacementScale,
  onResetPlacementRotation,
  onPlacementGestureStart,
  onPlacementGestureEnd,
  onPlacementRotateStart,
  onPlacementRotateEnd,
}: {
  addOnRows: CatalogAddOnRow[]
  nav: DesignNavId
  onNav: (id: DesignNavId) => void
  detail: CatalogProductDetail
  technique: string
  techniques: CatalogTechnique[]
  onTechnique: (key: string) => void
  printFiles: CatalogProductDetail['printFiles']
  activePrintFileType?: string
  embroideryUnlimitedColor: boolean
  onEmbroideryUnlimitedColor: (value: boolean) => void
  /** Why the current thread colors or unlimited option were chosen. */
  embroideryThreadNote?: string | null
  /** Selected standard threads for the active embroidery placement. */
  embroideryThreadColors: string[]
  onEmbroideryThreadColor: (hex: string) => void
  /** Bake the stitch file and store it on this product. */
  onPullStitchFile?: () => void
  /** Ask Printful for angle photos of the color on the stage. */
  onPhotographColor?: () => void
  productName: string
  onProductName: (value: string) => void
  previewColorName: string
  swatchColors: BlankColor[]
  onPreviewColor: (hex: string, name: string) => void
  previewSize: string
  onPreviewSize: (size: string) => void
  sizes: string[]
  onToggleSize: (size: string) => void
  /** Replace the whole sell list (All / None). */
  onSetSizes?: (sizes: string[]) => void
  uploadInputRef: RefObject<HTMLInputElement | null>
  onUploadFile: (file: File) => void
  uploads: ArtUpload[]
  activeLayerUrl?: string
  onPlaceArt: (url: string) => void
  /** Store-backed art just created (AI/text): refresh the library and drop it on the stage. */
  onArtCreated: (url: string) => void
  /** Lift a solid background off a piece of art, re-store it, and re-place it. */
  onRemoveBackground?: (url: string) => void | Promise<void>
  onUploadContextMenu: (event: MouseEvent, upload: ArtUpload) => void
  placed: PlacedLayer[]
  onFocusLayer: (id: string) => void
  saved: SavedDesignRow[]
  onOpenSaved: (id: string) => void
  wholesale: number
  costLive: boolean
  price: number
  onPrice: (value: number) => void
  keep: number
  note: string | null
  busy: string | null
  /** 0–100 while an art file is uploading. Null hides the bar. */
  uploadProgress?: number | null
  /** Shown under the status note while a design is going out and photos are rendering. */
  publishProgress?: { value: number; label: string } | null
  status: DesignStatus
  designId: string | null
  canPutOut: boolean
  onPutItOut: () => void
  onSaveDraft: () => void
  onVisibility: () => void
  guidelinesOpen: boolean
  onToggleGuidelines: () => void
  /** DPI grade of the active placement's art, shown at the bottom of the panel. */
  activeDpiGrade?: DpiGrade | null
  /** Upscale the active art so it clears the 150 DPI print threshold. */
  onOptimizeQuality?: () => void | Promise<void>
  placementScale?: number
  placementScaleMax?: number
  placementRotation?: number
  onFitPlacement?: () => void
  onCenterPlacement?: () => void
  onOptimizeForPrint?: () => void
  onPlacementScale?: (value: number) => void
  onPlacementRotate?: (value: number) => void
  onResetPlacementScale?: () => void
  onResetPlacementRotation?: () => void
  onPlacementGestureStart?: () => void
  onPlacementGestureEnd?: () => void
  onPlacementRotateStart?: () => void
  onPlacementRotateEnd?: () => void
}) {
  const { product } = detail
  const techniqueLabel = techniques.find((item) => item.key === technique)?.label || technique
  const activeFile = printFiles.find((file) => file.type === activePrintFileType) || printFiles[0]
  const activeIsEmbroidery =
    technique.trim().toUpperCase() === 'EMBROIDERY' || Boolean(activeFile && /embroidery/i.test(activeFile.type))
  const activeSupportsUnlimited = Boolean(activeFile?.options.some((option) => option.id === 'full_color'))
  const embroideryOption =
    (activeSupportsUnlimited ? activeFile?.options.find((option) => option.id === 'full_color') : null) ||
    printFiles
      .find((file) => file.options.some((option) => option.id === 'full_color'))
      ?.options.find((option) => option.id === 'full_color')
  const showThreadColors = activeIsEmbroidery && (!embroideryUnlimitedColor || !activeSupportsUnlimited)
  const selectedThreadNames = (embroideryThreadColors.length > 0 ? embroideryThreadColors : ['#000000']).map(
    (hex) => embroideryThreadByHex(hex).name,
  )
  const myUploads = uploads.filter((item) => item.origin !== 'printful')
  const { dragOver, dropHint, dropZoneProps } = useMerchArtDropUpload(onUploadFile)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <input
        ref={uploadInputRef as Ref<HTMLInputElement>}
        type="file"
        accept={MERCH_ART_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUploadFile(file)
          event.target.value = ''
        }}
      />
      <DesignMakerNavBar nav={nav} onNav={onNav} />
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 transition-colors ${
          dragOver ? 'bg-white/[0.06] ring-2 ring-inset ring-white/35' : ''
        }`}
        {...dropZoneProps}
      >
        {uploadProgress != null ? (
          <div
            className="sticky top-0 z-10 -mx-4 -mt-4 shrink-0 border-b border-white/10 bg-black/80 px-4 py-2.5 backdrop-blur-sm"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
            aria-label="Upload progress"
          >
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-white/70">
              <span>{uploadProgress >= 100 ? 'Placing design' : 'Uploading'}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-150 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}
        {dropHint ? <p className="text-[11px] text-amber-300/90">{dropHint}</p> : null}
        {nav === 'product' && (
          <>
            <div>
              <p className="text-sm font-semibold leading-snug">{product.title}</p>
              <label className="mt-3 block text-xs text-white/55">
                Product name
                <input
                  value={productName}
                  onChange={(event) => onProductName(event.target.value)}
                  placeholder={product.title}
                  className="mt-1 w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35"
                />
              </label>
            </div>
            <PlacementTools
              file={activeFile}
              hasArt={Boolean(activeLayerUrl)}
              scale={placementScale}
              scaleMax={placementScaleMax}
              rotation={placementRotation}
              onFit={onFitPlacement}
              onCenter={onCenterPlacement}
              onOptimizeForPrint={onOptimizeForPrint}
              onScale={onPlacementScale}
              onRotate={onPlacementRotate}
              onResetScale={onResetPlacementScale}
              onResetRotation={onResetPlacementRotation}
              onGestureStart={onPlacementGestureStart}
              onGestureEnd={onPlacementGestureEnd}
              onRotatePointerDown={onPlacementRotateStart}
              onRotatePointerUp={onPlacementRotateEnd}
            />
            <MitigationGuidelines file={activeFile} />
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Technique</p>
              <p className="text-sm">{techniqueLabel}</p>
              {techniques.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {techniques.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onTechnique(item.key)}
                      className={`rounded-full px-2.5 py-1 text-[10px] ${
                        technique === item.key ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {activeIsEmbroidery ? (
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
                {embroideryOption ? (
                  <>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Embroidery color option</p>
                <p className="text-[11px] text-white/55">Which embroidery color option to choose?</p>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => onEmbroideryUnlimitedColor(false)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-[11px] ${
                      !embroideryUnlimitedColor
                        ? 'border-white bg-white text-black'
                        : 'border-white/15 text-white/75 hover:border-white/30'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => onEmbroideryUnlimitedColor(true)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-[11px] ${
                      embroideryUnlimitedColor
                        ? 'border-white bg-white text-black'
                        : 'border-white/15 text-white/75 hover:border-white/30'
                    }`}
                  >
                    {embroideryOption.title}
                    {embroideryOption.additionalPrice != null && embroideryOption.additionalPrice > 0
                      ? ` (+$${embroideryOption.additionalPrice.toFixed(2)})`
                      : ''}
                  </button>
                </div>
                {!showThreadColors && embroideryThreadNote ? (
                  <p className="text-[11px] leading-snug text-white/70">{embroideryThreadNote}</p>
                ) : null}
                  </>
                ) : null}
                {showThreadColors ? (
                  <div className={embroideryOption ? 'border-t border-white/10 pt-2' : ''}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Thread colors</p>
                    <p className="mt-1 text-[11px] leading-snug text-white/55">
                      {embroideryThreadNote || 'Select every stitch. Black and white means both. Up to 6.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {EMBROIDERY_THREADS.map((thread) => {
                        const selected = embroideryThreadColors.some((hex) => hex.toUpperCase() === thread.hex)
                        return (
                          <button
                            key={thread.hex}
                            type="button"
                            title={thread.name}
                            aria-label={thread.name}
                            aria-pressed={selected}
                            onClick={() => onEmbroideryThreadColor(thread.hex)}
                            className={`h-7 w-7 rounded-full border ${
                              selected ? 'border-white ring-2 ring-white/80' : 'border-white/30 hover:border-white/60'
                            }`}
                            style={{ backgroundColor: thread.hex }}
                          />
                        )
                      })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-white/80">{selectedThreadNames.join(', ')}</p>
                    <button
                      type="button"
                      onClick={onPullStitchFile}
                      disabled={!onPullStitchFile || Boolean(busy) || !activeLayerUrl}
                      title="Bake this stitch file and save it on the product"
                      className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-[10px] uppercase tracking-[0.14em] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === 'Pulling stitch file' ? 'Saving stitch file' : 'Pull stitch file'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Color</p>
              <p className="mb-2 text-sm">{previewColorName}</p>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {swatchColors.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    title={color.name}
                    aria-pressed={previewColorName === color.name}
                    onClick={() => onPreviewColor(color.hex, color.name)}
                    className={`h-7 w-7 rounded-full border ${
                      previewColorName === color.name ? 'border-white ring-2 ring-white/50' : 'border-white/20'
                    }`}
                    style={{
                      background: color.hex2
                        ? `linear-gradient(135deg, ${color.hex} 50%, ${color.hex2} 50%)`
                        : color.hex,
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={onPhotographColor}
                disabled={!onPhotographColor || Boolean(busy) || !activeLayerUrl}
                title="Ask Printful for photos of this color only. Other colors stay on the garment template."
                className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-[10px] uppercase tracking-[0.14em] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === 'Photographing' ? 'Photographing this color' : 'Photograph this color'}
              </button>
            </div>
            <SizesBlock
              options={detail.sizes.length > 0 ? detail.sizes : sizes}
              selling={sizes}
              onToggleSize={onToggleSize}
              onSetSizes={onSetSizes}
              previewSize={previewSize}
              onPreviewSize={onPreviewSize}
            >
              <button
                type="button"
                onClick={onToggleGuidelines}
                className="mt-3 text-xs text-white/70 underline-offset-2 hover:text-white hover:underline"
              >
                Pricing & file guidelines
              </button>
              {guidelinesOpen ? (
                <div className="mt-3">
                  <MerchProductSpecs detail={detail} printFiles={printFiles} technique={technique} layout="rail" />
                </div>
              ) : null}
            </SizesBlock>
            <PublishBlock
              addOnRows={addOnRows}
              wholesale={wholesale}
              costLive={costLive}
              price={price}
              onPrice={onPrice}
              keep={keep}
              note={note}
              busy={busy}
              publishProgress={publishProgress}
              status={status}
              designId={designId}
              canPutOut={canPutOut}
              onPutItOut={onPutItOut}
              onSaveDraft={onSaveDraft}
              onVisibility={onVisibility}
            />
          </>
        )}

        {nav === 'uploads' && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">My uploads</p>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className={`mt-3 block w-full rounded-xl border border-dashed py-3.5 text-center text-sm font-medium transition-colors ${
                dragOver
                  ? 'border-white/55 bg-white/10 text-white'
                  : 'border-white/25 bg-black/25 hover:border-white/40'
              }`}
            >
              <span className="block">Upload design</span>
              <span className="mt-1 block text-[11px] font-normal text-white/50">Click or drop PNG / JPEG anywhere in this panel</span>
            </button>
            {myUploads.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {myUploads.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPlaceArt(item.url)}
                    onContextMenu={(event) => onUploadContextMenu(event, item)}
                    title="Place on the active area. Right-click for library actions."
                    className={`aspect-square overflow-hidden rounded bg-black/40 hover:ring-1 hover:ring-white/40 ${
                      activeLayerUrl && sameMerchArt(activeLayerUrl, item.url) ? 'ring-1 ring-white' : ''
                    }`}
                  >
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-white/45">PNG or JPEG artwork for this placement.</p>
            )}
            {note ? (
              <p className="mt-2 rounded border border-white/10 bg-black/30 p-2 text-xs text-white/80">{note}</p>
            ) : null}
          </div>
        )}

        {nav === 'layers' && (
          <LayerList placed={placed} onFocus={onFocusLayer} />
        )}

        {nav === 'saved' && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Saved designs</p>
            {saved.length === 0 ? (
              <p className="text-xs text-white/50">No saved designs yet. Save a draft from Product.</p>
            ) : (
              saved.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenSaved(item.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-left text-xs hover:border-white/25"
                >
                  <span className="truncate">{item.name}</span>
                  <span className="ml-2 shrink-0 uppercase tracking-wide text-white/40">{item.status}</span>
                </button>
              ))
            )}
          </div>
        )}

        {nav === 'help' && (
          <div className="space-y-2 text-xs leading-relaxed text-white/70">
            <p className="text-sm font-semibold text-white">Help</p>
            <p>Drop a PNG on the product, or use Uploads. Drag the art to move it. Scroll to scale it. Fit, Center, Scale, and Rotate on Product stay inside the print file. Embroidery stays inside the stitch box. Optimize for print sizes the art to that edge and does not stretch it past its own pixels.</p>
            <p>F fits the art. C centers it. Arrow keys nudge it. Right-click the art for rotate, copy, and remove.</p>
            <p>Keys 1–4 switch Front, Back, right sleeve, and left sleeve. ⌘Z / ⌘⇧Z undo and redo.</p>
            <p>Preview shows mockups and the stage dock. Design is the placement workspace (Printful-style tabs).</p>
          </div>
        )}

        {nav === 'quick' && (
          <MerchAiArtPanel
            productId={product.id}
            onArtCreated={onArtCreated}
            onRemoveBackground={onRemoveBackground}
          />
        )}

        {nav === 'text' && <MerchTextDesigner onArtCreated={onArtCreated} />}

        {(nav === 'clipart' || nav === 'premium' || nav === 'fill') && (
          <OutsideTool
            title={NAV.find((item) => item.id === nav)?.label || 'Tool'}
            productId={product.id}
          />
        )}

        {activeDpiGrade ? (
          <div className="mt-auto border-t border-white/10 pt-3">
            {activeDpiGrade !== 'good' && onOptimizeQuality ? (
              <button
                type="button"
                onClick={() => void onOptimizeQuality()}
                disabled={Boolean(busy)}
                className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 transition-colors hover:border-sky-300/70 hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden>✦</span>
                Optimize print quality
              </button>
            ) : null}
            <DpiQualityHint grade={activeDpiGrade} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * One block for sizes: which ones to sell (toggle chips, in wearable order)
 * and which one the preview shows (compact select). Replaces the two look-alike
 * "Size" / "Sell" rows that were easy to mix up.
 */
function SizesBlock({
  options,
  selling,
  onToggleSize,
  onSetSizes,
  previewSize,
  onPreviewSize,
  children,
}: {
  options: string[]
  selling: string[]
  onToggleSize: (size: string) => void
  onSetSizes?: (sizes: string[]) => void
  previewSize: string
  onPreviewSize: (size: string) => void
  children?: ReactNode
}) {
  const ordered = sortSizes(options)
  const sellingSet = new Set(selling)
  const count = ordered.filter((size) => sellingSet.has(size)).length
  const allOn = count === ordered.length
  const previewValue = ordered.includes(previewSize) ? previewSize : ordered[0] || ''

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Sizes</p>
        {onSetSizes && ordered.length > 1 && (
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide">
            <button
              type="button"
              onClick={() => onSetSizes(ordered)}
              disabled={allOn}
              className="rounded px-1.5 py-0.5 text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
            >
              All
            </button>
            <span className="text-white/25">·</span>
            <button
              type="button"
              onClick={() => onSetSizes(ordered.slice(0, 1))}
              disabled={count <= 1}
              className="rounded px-1.5 py-0.5 text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
            >
              None
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sizes to sell">
        {ordered.map((size) => {
          const on = sellingSet.has(size)
          return (
            <button
              key={size}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleSize(size)}
              className={`min-w-[2.5rem] rounded-md border px-2 py-1 text-xs transition-colors ${
                on
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 bg-transparent text-white/50 hover:border-white/35 hover:text-white/80'
              }`}
            >
              {size}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/50">
        <span>
          Selling {count} of {ordered.length}
        </span>
        {ordered.length > 1 && (
          <label className="flex items-center gap-1.5">
            <span>Preview</span>
            <select
              value={previewValue}
              onChange={(event) => onPreviewSize(event.target.value)}
              className="rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-[11px] text-white"
            >
              {ordered.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {children}
    </div>
  )
}

function PublishBlock({
  addOnRows,
  wholesale,
  costLive,
  price,
  onPrice,
  keep,
  note,
  busy,
  publishProgress,
  status,
  designId,
  canPutOut,
  onPutItOut,
  onSaveDraft,
  onVisibility,
}: {
  addOnRows: CatalogAddOnRow[]
  wholesale: number
  costLive: boolean
  price: number
  onPrice: (value: number) => void
  keep: number
  note: string | null
  busy: string | null
  publishProgress?: { value: number; label: string } | null
  status: DesignStatus
  designId: string | null
  canPutOut: boolean
  onPutItOut: () => void
  onSaveDraft: () => void
  onVisibility: () => void
}) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      {addOnRows.length > 0 ? (
        <div className="space-y-1.5 pb-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Add-ons</p>
          <ul className="space-y-1">
            {addOnRows.map((row) => (
              <li key={row.id} className="flex justify-between gap-3 text-xs text-white/55">
                <span className="min-w-0 leading-snug">{row.label}</span>
                <span className="shrink-0 tabular-nums text-white/75">+${row.price.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex justify-between text-xs text-white/50">
        <span>{costLive ? 'Printful cost' : 'Blank estimate'}</span>
        <span>${wholesale.toFixed(2)}</span>
      </div>
      <label className="flex items-center justify-between text-sm">
        Your price
        <input
          type="number"
          min={1}
          step={1}
          value={price}
          onChange={(event) => onPrice(Number(event.target.value))}
          className="w-24 rounded border border-white/10 bg-black/30 px-2 py-1 text-right"
        />
      </label>
      <div className="flex justify-between text-sm text-emerald-400/90">
        <span>You keep</span>
        <span>${keep.toFixed(2)}</span>
      </div>
      {note && <p className="rounded border border-white/10 bg-black/30 p-2 text-xs text-white/80">{note}</p>}
      {publishProgress != null ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={publishProgress.value}
          aria-label={publishProgress.label}
        >
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-white/70">
            <span>{publishProgress.label}</span>
            <span>{publishProgress.value}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-300 ease-out"
              style={{ width: `${publishProgress.value}%` }}
            />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onPutItOut}
        disabled={Boolean(busy) || !canPutOut}
        className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black disabled:bg-white/15 disabled:text-white/40"
      >
        {busy === 'Putting it out' ? 'Putting it out…' : 'Put it out'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={Boolean(busy)}
          className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs hover:bg-white/10"
        >
          Save draft
        </button>
        <button
          type="button"
          onClick={onVisibility}
          disabled={Boolean(busy) || !designId || status === 'draft'}
          className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs hover:bg-white/10 disabled:text-white/35"
        >
          {status === 'live' ? 'Hide from shop' : 'Make public'}
        </button>
      </div>
    </div>
  )
}

function LayerList({ placed, onFocus }: { placed: PlacedLayer[]; onFocus: (id: string) => void }) {
  if (placed.length === 0) {
    return <p className="text-xs text-white/50">Nothing placed yet. Drop art on the shirt.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Layers</p>
      {placed.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onFocus(item.id)}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-2 py-2 text-left text-xs hover:border-white/25"
        >
          <img src={item.url} alt="" className="h-10 w-10 rounded object-cover" />
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

function OutsideTool({ title, productId }: { title: string; productId: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs leading-relaxed text-white/55">
        This studio places your own PNG or JPEG. {title} stays in Printful Design Maker.
      </p>
      <a
        href={printfulProductUrl(productId)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs text-white/80 underline-offset-2 hover:underline"
      >
        Open in Printful Design Maker
      </a>
    </div>
  )
}

function NavIcon({ id }: { id: DesignNavId }) {
  const common = 'h-4 w-4'
  if (id === 'product') {
    return (
      <svg viewBox="0 0 16 16" className={common} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <path d="M3 6.5 8 3l5 3.5V13H3V6.5Z" />
      </svg>
    )
  }
  if (id === 'uploads') {
    return (
      <svg viewBox="0 0 16 16" className={common} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <path d="M8 11V4M5.5 6.5 8 4l2.5 2.5M3 12.5h10" />
      </svg>
    )
  }
  if (id === 'text') {
    return (
      <svg viewBox="0 0 16 16" className={common} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <path d="M3 4h10M8 4v8M5.5 12h5" />
      </svg>
    )
  }
  if (id === 'quick') {
    return (
      <svg viewBox="0 0 16 16" className={common} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <path d="M8 2.5 9.1 6 12.5 7l-3.4 1L8 11.5 6.9 8 3.5 7l3.4-1L8 2.5Z" />
        <path d="M12.5 11.5 13 13l1.5.5-1.5.5-.5 1.5-.5-1.5L10.5 13l1.5-.5.5-1Z" />
      </svg>
    )
  }
  if (id === 'layers') {
    return (
      <svg viewBox="0 0 16 16" className={common} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <path d="M8 2.5 13 5.5 8 8.5 3 5.5 8 2.5ZM3 8.5 8 11.5 13 8.5M3 11.5 8 14.5 13 11.5" />
      </svg>
    )
  }
  if (id === 'help') {
    return (
      <svg viewBox="0 0 16 16" className={common} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <circle cx="8" cy="8" r="5.25" />
        <path d="M6.4 6.3a1.6 1.6 0 1 1 2.3 1.4c-.5.3-.7.6-.7 1.1V9.2" />
        <path d="M8 11.2h.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={common} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="3" y="3" width="10" height="10" rx="2" />
    </svg>
  )
}

export function placementTabLabel(title: string): string {
  const trimmed = title.replace(/\s+print$/i, '').trim()
  return trimmed || title
}

/** Printful design-maker views. Priced variants and the inside label stay off this bar. */
export const PLACEMENT_VIEWS = ['Front', 'Back', 'Right sleeve', 'Left sleeve'] as const

export type PlacementView = (typeof PLACEMENT_VIEWS)[number]

export function placementViewName(type: string, title: string): PlacementView | null {
  const text = `${type} ${title}`.toLowerCase()
  if (text.includes('label') || text.includes('inside') || text.includes('neck')) return null
  if (text.includes('sleeve') || text.includes('side')) {
    if (text.includes('right')) return 'Right sleeve'
    if (text.includes('left')) return 'Left sleeve'
  }
  if (text.includes('back')) return 'Back'
  if (text.includes('front') || text.includes('chest') || text.includes('default')) return 'Front'
  return null
}

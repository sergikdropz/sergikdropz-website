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
import type { CatalogProductDetail, CatalogTechnique } from '@/lib/merch/printful-catalog-types'
import { scalePlacementAboutCenter, type ArtPlacement, type DesignStatus } from '@/lib/merch/design'
import { dpiGradeRingClass, type DpiGrade } from '@/lib/merch/design'
import { MERCH_ART_ACCEPT, useMerchArtDropUpload } from '@/lib/merch/art-upload-drop'

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

type ArtUpload = { id: string; label: string; url: string }

type PlacedLayer = { id: string; label: string; url: string }

type SavedDesignRow = { id: string; name: string; status: string }

const NAV: Array<{ id: DesignNavId; label: string }> = [
  { id: 'product', label: 'Product' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'quick', label: 'AI Art' },
  { id: 'text', label: 'Text' },
  { id: 'saved', label: 'Saved designs' },
  { id: 'layers', label: 'Layers' },
  { id: 'help', label: 'Help' },
]

export function StageModeSwitch({
  view,
  onChange,
}: {
  view: StageView
  onChange: (view: StageView) => void
}) {
  return (
    <div className="flex justify-center gap-2">
      <ModeButton active={view === 'design'} onClick={() => onChange('design')}>
        Design
      </ModeButton>
      <ModeButton active={view === 'preview'} onClick={() => onChange('preview')}>
        Preview
      </ModeButton>
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
    setActiveHandle(null)
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
        onAdjustRef.current({
          rotation: normalizeRotation(rotateSnapRef.current.startRotation + delta),
        })
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
        title="Click and drag to rotate"
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
  showPrintGuide,
  printInsetX,
  printInsetY,
  activeDpiGrade,
  snapGuides,
  stageToolbar,
  underTabs,
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
  showPrintGuide: boolean
  printInsetX: number
  printInsetY: number
  activeDpiGrade: DpiGrade | null
  snapGuides?: { vertical: number[]; horizontal: number[] }
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
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files?.[0]
          if (file) onDropFile(file)
        }}
      >
        <div
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
              backgroundColor: garmentBackground || undefined,
            }}
          >
            {garmentUrl ? (
              <img
                src={garmentUrl}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setNaturalAspect(image.naturalWidth / image.naturalHeight)
                  }
                }}
                className={`pointer-events-none absolute inset-0 h-full w-full ${
                  useTemplateMockup ? 'object-fill' : 'object-contain'
                }`}
                style={showBackGarment ? { transform: 'scaleX(-1)' } : undefined}
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
              {showPrintGuide && (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className={`absolute inset-0 border border-dashed ${
                      outside ? 'border-red-400/90' : 'border-white/70'
                    }`}
                  />
                  <div
                    className="absolute border border-dashed border-white/25"
                    style={{
                      left: `${printInsetX * 100}%`,
                      top: `${printInsetY * 100}%`,
                      right: `${printInsetX * 100}%`,
                      bottom: `${printInsetY * 100}%`,
                    }}
                  />
                </div>
              )}
              {!showPrintGuide && (
                <div
                  className={`pointer-events-none absolute inset-0 border border-dashed ${
                    outside ? 'border-red-400/90' : 'border-white/70'
                  }`}
                />
              )}
              {snapGuides ? (
                <PrintAreaSnapGuides vertical={snapGuides.vertical} horizontal={snapGuides.horizontal} />
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
        </div>
        {activeDpiGrade ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <DpiQualityHint grade={activeDpiGrade} />
          </div>
        ) : null}
      </div>
    </div>
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
  wholesale,
  costLive,
  price,
  onPrice,
  keep,
  note,
  busy,
  status,
  designId,
  canPutOut,
  onPutItOut,
  onSaveDraft,
  onVisibility,
  guidelinesOpen,
  onToggleGuidelines,
}: {
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
  status: DesignStatus
  designId: string | null
  canPutOut: boolean
  onPutItOut: () => void
  onSaveDraft: () => void
  onVisibility: () => void
  guidelinesOpen: boolean
  onToggleGuidelines: () => void
}) {
  const { product } = detail
  const techniqueLabel = techniques.find((item) => item.key === technique)?.label || technique
  const activeFile = printFiles.find((file) => file.type === activePrintFileType) || printFiles[0]
  const embroideryOption = activeFile?.options.find((option) => option.id === 'full_color')
  const { dragOver, dropHint, dropZoneProps } = useMerchArtDropUpload(onUploadFile)

  return (
    <div className="flex min-h-0 flex-1">
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
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 transition-colors ${
          dragOver ? 'bg-white/[0.06] ring-2 ring-inset ring-white/35' : ''
        }`}
        {...dropZoneProps}
      >
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
            {embroideryOption ? (
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
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
              wholesale={wholesale}
              costLive={costLive}
              price={price}
              onPrice={onPrice}
              keep={keep}
              note={note}
              busy={busy}
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
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className={`block w-full rounded-xl border border-dashed py-3.5 text-center text-sm font-medium transition-colors ${
                dragOver
                  ? 'border-white/55 bg-white/10 text-white'
                  : 'border-white/25 bg-black/25 hover:border-white/40'
              }`}
            >
              <span className="block">Upload design</span>
              <span className="mt-1 block text-[11px] font-normal text-white/50">Click or drop PNG / JPEG anywhere in this panel</span>
            </button>
            {uploads.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {uploads.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPlaceArt(item.url)}
                    onContextMenu={(event) => onUploadContextMenu(event, item)}
                    title="Place on the active area"
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
            <p>Drop a PNG on the shirt, or use Uploads. Drag the art to move it. Scroll to scale it.</p>
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
      </div>
      <aside
        aria-label="Design Maker sidebar"
        className="flex w-[84px] shrink-0 flex-col gap-0.5 overflow-y-auto border-l border-white/10 bg-black/30 py-2"
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
              className={`mx-1 flex shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center ${
                active ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <NavIcon id={item.id} />
              <span className="line-clamp-2 text-[9px] font-medium leading-[1.05]">{item.label}</span>
            </button>
          )
        })}
      </aside>
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
  wholesale,
  costLive,
  price,
  onPrice,
  keep,
  note,
  busy,
  status,
  designId,
  canPutOut,
  onPutItOut,
  onSaveDraft,
  onVisibility,
}: {
  wholesale: number
  costLive: boolean
  price: number
  onPrice: (value: number) => void
  keep: number
  note: string | null
  busy: string | null
  status: DesignStatus
  designId: string | null
  canPutOut: boolean
  onPutItOut: () => void
  onSaveDraft: () => void
  onVisibility: () => void
}) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
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

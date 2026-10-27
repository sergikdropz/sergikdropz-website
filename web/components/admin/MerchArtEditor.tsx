'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  applyArtEdit,
  applyEffect,
  autoTone,
  clampCrop,
  cloneArtEdit,
  defaultArtEdit,
  displayToSource,
  orientedPixelSourceIndexes,
  previewMagicWandMask,
  scaleImageData,
  type ArtEdit,
  type ArtView,
  type CropRect,
  type CurvePoint,
  type FitMode,
  type Rgb,
} from '@/lib/merch/art-adjust'
import type { ImageDataLike } from '@/lib/merch/remove-background'
import { brushDiameterPx } from '@/lib/editor/brush'
import { BrushCursor, BrushSizeControl, useBrushCursor } from '@/components/editor/BrushTools'
import { clampStagePan, clampStageZoom, panForZoom } from '@/lib/editor/stage-view'

type SaveMode = 'replace' | 'copy'
type ToolId = 'adjust' | 'curves' | 'crop' | 'cutout' | 'fit' | 'effects'
type EditorHistorySnap = { edit: ArtEdit; effect: EffectName }

const EDITOR_HISTORY_MAX = 60
const EDITOR_HISTORY_DEBOUNCE_MS = 280

function historySnapKey(snap: EditorHistorySnap): string {
  return `${snap.effect}:${JSON.stringify(snap.edit)}`
}
type CurveChannel = 'rgb' | 'r' | 'g' | 'b'
type EffectName = 'none' | 'bw' | 'film' | 'blur'

type Props = {
  url: string
  busy?: boolean
  onClose: () => void
  onApply: (blob: Blob, mode: SaveMode) => Promise<void>
}

const TOOLS: Array<[ToolId, string]> = [
  ['adjust', 'Adjust'],
  ['curves', 'Curves'],
  ['crop', 'Crop'],
  ['cutout', 'Cutout'],
  ['fit', 'Fit'],
  ['effects', 'Effects'],
]

const CHANNELS: Array<[CurveChannel, string]> = [
  ['rgb', 'RGB'],
  ['r', 'Red'],
  ['g', 'Green'],
  ['b', 'Blue'],
]

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load artwork'))
    image.src = url
  })
}

function readImage(image: HTMLImageElement): ImageDataLike {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not prepare the editor')
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data: pixels.data, width: pixels.width, height: pixels.height }
}

function rgbToHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  onReset,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onReset: () => void
}) {
  return (
    <label className="block space-y-1">
      <span
        title="Double-click to reset"
        onDoubleClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onReset()
        }}
        className="flex cursor-default select-none items-center justify-between text-[11px] text-white/70"
      >
        {label}
        <span className="tabular-nums text-white/40">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-white"
      />
    </label>
  )
}

function CurvePad({ points, onChange }: { points: CurvePoint[]; onChange: (points: CurvePoint[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<number | null>(null)
  const [selected, setSelected] = useState(0)
  const sorted = [...points].sort((a, b) => a.x - b.x)

  function locate(event: ReactPointerEvent) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return {
      x: Math.min(255, Math.max(0, ((event.clientX - rect.left) / rect.width) * 255)),
      y: Math.min(255, Math.max(0, (1 - (event.clientY - rect.top) / rect.height) * 255)),
    }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const point = locate(event)
    const hit = sorted.findIndex((item) => Math.hypot(item.x - point.x, item.y - point.y) < 16)
    if (hit >= 0) {
      drag.current = hit
      setSelected(hit)
    } else {
      const next = [...sorted, point].sort((a, b) => a.x - b.x)
      drag.current = next.findIndex((item) => item.x === point.x && item.y === point.y)
      setSelected(drag.current)
      onChange(next)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const index = drag.current
    if (index == null) return
    const point = locate(event)
    const next = sorted.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const left = itemIndex === 0 ? 0 : sorted[itemIndex - 1].x + 2
      const right = itemIndex === sorted.length - 1 ? 255 : sorted[itemIndex + 1].x - 2
      const x = itemIndex === 0 ? 0 : itemIndex === sorted.length - 1 ? 255 : Math.min(right, Math.max(left, point.x))
      return { x, y: point.y }
    })
    onChange(next)
  }

  const path = sorted.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${255 - point.y}`).join(' ')

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox="0 0 255 255"
        className="h-44 w-full touch-none rounded-lg bg-black"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <path d="M0 255 L255 0" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <path d={path} fill="none" stroke="white" strokeWidth="2" />
        {sorted.map((point, index) => (
          <circle key={`${point.x}-${index}`} cx={point.x} cy={255 - point.y} r={selected === index ? 7 : 5} fill="white" />
        ))}
      </svg>
      <button
        type="button"
        disabled={selected <= 0 || selected >= sorted.length - 1}
        onClick={() => onChange(sorted.filter((_, index) => index !== selected))}
        className="text-xs text-white/55 hover:text-white disabled:text-white/25"
      >
        Remove point
      </button>
    </div>
  )
}

function CropOverlay({ crop, onChange }: { crop: CropRect; onChange: (crop: CropRect) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: string; x: number; y: number; crop: CropRect } | null>(null)

  function start(mode: string, event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    drag.current = { mode, x: event.clientX, y: event.clientY, crop }
    rootRef.current?.setPointerCapture(event.pointerId)
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current
    if (!active) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    const dx = (event.clientX - active.x) / bounds.width
    const dy = (event.clientY - active.y) / bounds.height
    let { x, y, w, h } = active.crop
    if (active.mode === 'move') {
      x += dx
      y += dy
    }
    if (active.mode.includes('e')) w += dx
    if (active.mode.includes('s')) h += dy
    if (active.mode.includes('w')) {
      x += dx
      w -= dx
    }
    if (active.mode.includes('n')) {
      y += dy
      h -= dy
    }
    onChange(clampCrop({ x, y, w, h }))
  }

  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null
      }}
    >
      <div
        className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
        onPointerDown={(event) => start('move', event)}
      >
        {handles.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-label={`Crop ${mode}`}
            onPointerDown={(event) => start(mode, event)}
            className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white ${
              mode.includes('n') ? 'top-0' : mode.includes('s') ? 'top-full' : 'top-1/2'
            } ${mode.includes('w') ? 'left-0' : mode.includes('e') ? 'left-full' : 'left-1/2'}`}
          />
        ))}
      </div>
    </div>
  )
}

function nestedScroller(target: EventTarget | null, root: HTMLElement) {
  let node = target instanceof Element ? target : null
  while (node && root.contains(node)) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node)
      const scrollsY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1
      const scrollsX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1
      if (scrollsY || scrollsX) return node
    }
    if (node === root) break
    node = node.parentElement
  }
  return null
}

export default function MerchArtEditor({ url, busy = false, onClose, onApply }: Props) {
  const [edit, setEdit] = useState<ArtEdit>(defaultArtEdit)
  const [baseline, setBaseline] = useState<ArtEdit>(defaultArtEdit)
  const [baselineEffect, setBaselineEffect] = useState<EffectName>('none')
  const [baselineBrush, setBaselineBrush] = useState(0.04)
  const [tool, setTool] = useState<ToolId>('adjust')
  const [channel, setChannel] = useState<CurveChannel>('rgb')
  const [effect, setEffect] = useState<EffectName>('none')
  const [brushSize, setBrushSize] = useState(0.04)
  const [brushRestore, setBrushRestore] = useState(true)
  const [cutoutPaintMode, setCutoutPaintMode] = useState<'brush' | 'wand'>('brush')
  const [wandTolerance, setWandTolerance] = useState(28)
  const [wandEdgeGuard, setWandEdgeGuard] = useState(62)
  const [backdropMode, setBackdropMode] = useState<'checkers' | 'solid'>('checkers')
  const [backdropGray, setBackdropGray] = useState(22)
  const [backdropMenu, setBackdropMenu] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<SaveMode | null>(null)
  const [baking, setBaking] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [frame, setFrame] = useState({ width: 960, height: 720 })
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 })
  const [ready, setReady] = useState(0)
  const fullRef = useRef<ImageDataLike | null>(null)
  const scaledRef = useRef<{ token: number; image: ImageDataLike } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wandOverlayRef = useRef<HTMLCanvasElement>(null)
  const canvasPixelSizeRef = useRef({ orientedW: 0, orientedH: 0, sourceW: 0, sourceH: 0 })
  const orientIndexRef = useRef<{ key: string; map: Int32Array } | null>(null)
  const wandHoverRef = useRef<{ x: number; y: number } | null>(null)
  const wandPreviewRaf = useRef<number | null>(null)
  const resizeDrag = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const lastBrush = useRef<{ x: number; y: number } | null>(null)
  const cutoutBeforeClean = useRef<boolean | null>(null)
  const brush = useBrushCursor(brushDiameterPx(brushSize, viewSize.width))
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const viewSizeRef = useRef(viewSize)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number; pan: { x: number; y: number }; midX: number; midY: number } | null>(null)
  const panDrag = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null)
  const cutoutEditFloor = useRef({ strokes: 0, wand: 0 })
  const undoStackRef = useRef<EditorHistorySnap[]>([])
  const redoStackRef = useRef<EditorHistorySnap[]>([])
  const lastCommittedRef = useRef<EditorHistorySnap | null>(null)
  const applyingHistoryRef = useRef(false)
  const historyDebounceRef = useRef<number | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  zoomRef.current = zoom
  panRef.current = pan
  viewSizeRef.current = viewSize

  function syncHistoryButtons() {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }

  const editHistoryRef = useRef(edit)
  const effectHistoryRef = useRef(effect)
  editHistoryRef.current = edit
  effectHistoryRef.current = effect

  function snapshotEditorState(): EditorHistorySnap {
    return { edit: cloneArtEdit(editHistoryRef.current), effect: effectHistoryRef.current }
  }

  function applyEditorSnapshot(snap: EditorHistorySnap) {
    applyingHistoryRef.current = true
    cutoutBeforeClean.current = null
    lastCommittedRef.current = { edit: cloneArtEdit(snap.edit), effect: snap.effect }
    setEdit(cloneArtEdit(snap.edit))
    setEffect(snap.effect)
    syncHistoryButtons()
  }

  function undoEditor() {
    const past = undoStackRef.current
    if (past.length === 0) return
    const current = snapshotEditorState()
    redoStackRef.current.push(current)
    const previous = past.pop() as EditorHistorySnap
    applyEditorSnapshot(previous)
  }

  function redoEditor() {
    const future = redoStackRef.current
    if (future.length === 0) return
    const current = snapshotEditorState()
    undoStackRef.current.push(current)
    const next = future.pop() as EditorHistorySnap
    applyEditorSnapshot(next)
  }

  function resetEditorHistory(initial?: EditorHistorySnap) {
    undoStackRef.current = []
    redoStackRef.current = []
    lastCommittedRef.current = initial ? { edit: cloneArtEdit(initial.edit), effect: initial.effect } : null
    syncHistoryButtons()
  }

  useEffect(() => {
    if (!fullRef.current || applyingHistoryRef.current) {
      applyingHistoryRef.current = false
      return
    }
    if (historyDebounceRef.current != null) window.clearTimeout(historyDebounceRef.current)
    historyDebounceRef.current = window.setTimeout(() => {
      historyDebounceRef.current = null
      const current = snapshotEditorState()
      const last = lastCommittedRef.current
      if (!last) {
        lastCommittedRef.current = { edit: cloneArtEdit(current.edit), effect: current.effect }
        return
      }
      if (historySnapKey(last) === historySnapKey(current)) return
      undoStackRef.current.push(last)
      if (undoStackRef.current.length > EDITOR_HISTORY_MAX) undoStackRef.current.shift()
      redoStackRef.current = []
      lastCommittedRef.current = { edit: cloneArtEdit(current.edit), effect: current.effect }
      syncHistoryButtons()
    }, EDITOR_HISTORY_DEBOUNCE_MS)
    return () => {
      if (historyDebounceRef.current != null) window.clearTimeout(historyDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced snapshot of edit + effect
  }, [edit, effect, ready])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        redoEditor()
      } else if (key === 'z') {
        event.preventDefault()
        undoEditor()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable undo/redo handlers
  }, [])

  useEffect(() => {
    if (!backdropMenu) return
    const close = (event: PointerEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[aria-label="Preview background"]')) return
      setBackdropMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBackdropMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [backdropMenu])

  useEffect(() => {
    const fresh = defaultArtEdit()
    cutoutBeforeClean.current = null
    resetEditorHistory()
    setEdit(fresh)
    setBaseline(fresh)
    setBaselineEffect('none')
    setBaselineBrush(0.04)
    setTool('adjust')
    setEffect('none')
    setError(null)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setLeaving(false)
    fullRef.current = null
    let cancelled = false
    void loadImage(url)
      .then((image) => {
        if (cancelled) return
        fullRef.current = readImage(image)
        const snap = { edit: cloneArtEdit(fresh), effect: 'none' as EffectName }
        lastCommittedRef.current = snap
        setReady((value) => value + 1)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load artwork')
      })
    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (leaving) setLeaving(false)
      else setLeaving(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leaving])

  const bindStage = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node
    setStageNode((current) => (current === node ? current : node))
  }, [])

  useEffect(() => {
    const stage = stageNode
    if (!stage) return
    const measure = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      setStageBox((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    const centerOf = () => {
      const rect = stage.getBoundingClientRect()
      const padL = Number.parseFloat(getComputedStyle(stage).paddingLeft) || 0
      const padT = Number.parseFloat(getComputedStyle(stage).paddingTop) || 0
      return { x: rect.left + padL + stage.clientWidth / 2, y: rect.top + padT + stage.clientHeight / 2 }
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1
      if (event.ctrlKey) {
        const center = centerOf()
        const nextZoom = clampStageZoom(zoomRef.current * Math.exp(-event.deltaY * unit * 0.0016))
        const moved = panForZoom(panRef.current, zoomRef.current, nextZoom, event.clientX - center.x, event.clientY - center.y)
        const nextPan = clampStagePan(moved, nextZoom, viewSizeRef.current, { width: stage.clientWidth, height: stage.clientHeight })
        zoomRef.current = nextZoom
        panRef.current = nextPan
        setZoom(nextZoom)
        setPan(nextPan)
        return
      }
      const nextPan = clampStagePan(
        { x: panRef.current.x - event.deltaX * unit, y: panRef.current.y - event.deltaY * unit },
        zoomRef.current,
        viewSizeRef.current,
        { width: stage.clientWidth, height: stage.clientHeight },
      )
      panRef.current = nextPan
      setPan(nextPan)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      stage.removeEventListener('wheel', onWheel)
    }
  }, [stageNode])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const onWheel = (event: WheelEvent) => {
      if (nestedScroller(event.target, overlay)) return
      event.preventDefault()
    }
    overlay.addEventListener('wheel', onWheel, { passive: false })
    return () => overlay.removeEventListener('wheel', onWheel)
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const full = fullRef.current
    if (!canvas || !full || stageBox.width < 8 || stageBox.height < 8) return
    if (!scaledRef.current || scaledRef.current.token !== ready) {
      scaledRef.current = { token: ready, image: scaleImageData(full, 640) }
    }
    const view: ArtView = tool === 'crop' || tool === 'cutout' ? 'crop' : 'final'
    try {
      const edited = applyArtEdit(scaledRef.current.image, edit, view)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      if (canvas.width !== edited.width || canvas.height !== edited.height) {
        canvas.width = edited.width
        canvas.height = edited.height
      }
      ctx.putImageData(new ImageData(new Uint8ClampedArray(edited.data), edited.width, edited.height), 0, 0)
      canvasPixelSizeRef.current = {
        orientedW: edited.width,
        orientedH: edited.height,
        sourceW: scaledRef.current.image.width,
        sourceH: scaledRef.current.image.height,
      }
      orientIndexRef.current = null
      const scale = Math.min(stageBox.width / edited.width, stageBox.height / edited.height)
      const width = Math.max(1, Math.round(edited.width * scale))
      const height = Math.max(1, Math.round(edited.height * scale))
      setViewSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview the edit')
    }
  }, [edit, tool, ready, stageBox])

  useEffect(() => {
    if (tool !== 'cutout' || cutoutPaintMode !== 'wand') {
      scheduleWandPreview(null)
      return
    }
    if (wandHoverRef.current) scheduleWandPreview(wandHoverRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw preview when matte inputs change
  }, [edit, wandTolerance, wandEdgeGuard, brushRestore, cutoutPaintMode, tool])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || viewSize.width < 1) return
    const next = clampStagePan(panRef.current, zoomRef.current, viewSize, {
      width: stage.clientWidth,
      height: stage.clientHeight,
    })
    if (next.x === panRef.current.x && next.y === panRef.current.y) return
    panRef.current = next
    setPan(next)
  }, [viewSize, stageBox, zoom])

  function setMatte(partial: Partial<Pick<ArtEdit, 'edgeClean' | 'shave' | 'crisp'>>) {
    setEdit((current) => {
      const next = { ...current, ...partial }
      const engaged = (next.edgeClean || 0) > 0 || (next.shave || 0) > 0 || (next.crisp || 0) > 0
      const wasEngaged = (current.edgeClean || 0) > 0 || (current.shave || 0) > 0 || (current.crisp || 0) > 0
      if (engaged && !wasEngaged && cutoutBeforeClean.current === null) cutoutBeforeClean.current = current.cutout
      if (!engaged && cutoutBeforeClean.current !== null) {
        const cutout = cutoutBeforeClean.current
        cutoutBeforeClean.current = null
        return { ...next, cutout }
      }
      return engaged ? { ...next, cutout: true } : next
    })
  }

  function patchTone(partial: Partial<ArtEdit['tone']>) {
    setEffect('none')
    setEdit((current) => ({ ...current, tone: { ...current.tone, ...partial } }))
  }

  function restoreTone(key: keyof ArtEdit['tone']) {
    setEdit((current) => ({ ...current, tone: { ...current.tone, [key]: baseline.tone[key] } }))
  }

  function restoreCurves() {
    setEffect(baselineEffect)
    setEdit((current) => ({
      ...current,
      tone: { ...baseline.tone },
      curves: {
        rgb: baseline.curves.rgb.map((point) => ({ ...point })),
        r: baseline.curves.r.map((point) => ({ ...point })),
        g: baseline.curves.g.map((point) => ({ ...point })),
        b: baseline.curves.b.map((point) => ({ ...point })),
      },
    }))
  }

  function pointerSourcePoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return null
    const displayed = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    }
    return displayToSource(displayed.x, displayed.y, edit.flipX, edit.flipY, edit.rotate)
  }

  function paintStroke(event: ReactPointerEvent<HTMLDivElement>) {
    if (!edit.cutout || cutoutPaintMode !== 'brush') return
    const source = pointerSourcePoint(event)
    if (!source) return
    const previous = lastBrush.current
    if (previous && Math.hypot(previous.x - source.x, previous.y - source.y) < brushSize * 0.35) return
    lastBrush.current = source
    setEdit((current) => ({
      ...current,
      strokes: [...current.strokes, { ...source, radius: brushSize, restore: brushRestore }],
    }))
  }

  function paintWand(event: ReactPointerEvent<HTMLDivElement>) {
    if (cutoutPaintMode !== 'wand') return
    const source = pointerSourcePoint(event)
    if (!source) return
    setEdit((current) => ({
      ...current,
      cutout: true,
      wandFills: [
        ...current.wandFills,
        {
          x: source.x,
          y: source.y,
          tolerance: wandTolerance,
          edgeGuard: wandEdgeGuard,
          restore: brushRestore,
        },
      ],
    }))
    wandHoverRef.current = null
    clearWandOverlay()
  }

  function clearWandOverlay() {
    const overlay = wandOverlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)
  }

  function drawWandHoverPreview(source: { x: number; y: number } | null) {
    wandHoverRef.current = source
    const overlay = wandOverlayRef.current
    const scaled = scaledRef.current?.image
    const { orientedW, orientedH, sourceW, sourceH } = canvasPixelSizeRef.current
    if (!overlay || !scaled || orientedW < 1 || orientedH < 1) {
      clearWandOverlay()
      return
    }
    if (!source) {
      clearWandOverlay()
      return
    }
    const forceCutout = !edit.cutout
    const mask = previewMagicWandMask(
      scaled,
      edit,
      source.x,
      source.y,
      wandTolerance,
      wandEdgeGuard,
      forceCutout,
    )
    if (!mask) {
      clearWandOverlay()
      return
    }
    const indexKey = `${ready}-${edit.flipX}-${edit.flipY}-${edit.rotate}-${sourceW}x${sourceH}-${orientedW}x${orientedH}`
    if (!orientIndexRef.current || orientIndexRef.current.key !== indexKey) {
      orientIndexRef.current = {
        key: indexKey,
        map: orientedPixelSourceIndexes(sourceW, sourceH, orientedW, orientedH, edit.flipX, edit.flipY, edit.rotate),
      }
    }
    const indexMap = orientIndexRef.current.map
    if (overlay.width !== orientedW || overlay.height !== orientedH) {
      overlay.width = orientedW
      overlay.height = orientedH
    }
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    const tint = brushRestore
      ? { r: 52, g: 211, b: 153 }
      : { r: 250, g: 204, b: 21 }
    const pixels = ctx.createImageData(orientedW, orientedH)
    for (let p = 0; p < indexMap.length; p++) {
      const src = indexMap[p]
      if (src < 0 || !mask[src]) continue
      const i = p * 4
      pixels.data[i] = tint.r
      pixels.data[i + 1] = tint.g
      pixels.data[i + 2] = tint.b
      pixels.data[i + 3] = 130
    }
    ctx.putImageData(pixels, 0, 0)
  }

  function scheduleWandPreview(source: { x: number; y: number } | null) {
    wandHoverRef.current = source
    if (wandPreviewRaf.current != null) cancelAnimationFrame(wandPreviewRaf.current)
    wandPreviewRaf.current = requestAnimationFrame(() => {
      wandPreviewRaf.current = null
      drawWandHoverPreview(wandHoverRef.current)
    })
  }

  function stageCenter() {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const rect = stage.getBoundingClientRect()
    const padL = Number.parseFloat(getComputedStyle(stage).paddingLeft) || 0
    const padT = Number.parseFloat(getComputedStyle(stage).paddingTop) || 0
    return { x: rect.left + padL + stage.clientWidth / 2, y: rect.top + padT + stage.clientHeight / 2 }
  }

  function commitView(nextZoom: number, nextPan: { x: number; y: number }) {
    const zoomValue = clampStageZoom(nextZoom)
    const stage = stageRef.current
    const panValue = clampStagePan(
      nextPan,
      zoomValue,
      viewSizeRef.current,
      stage ? { width: stage.clientWidth, height: stage.clientHeight } : undefined,
    )
    zoomRef.current = zoomValue
    panRef.current = panValue
    setZoom(zoomValue)
    setPan(panValue)
  }

  function fitView() {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function pointHitsArtwork(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas || canvas.width < 1 || canvas.height < 1) return false
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return false
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * canvas.width)))
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * canvas.height)))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    return ctx.getImageData(x, y, 1, 1).data[3] > 16
  }

  function onStageContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    if (pointHitsArtwork(event.clientX, event.clientY)) {
      setBackdropMenu(null)
      return
    }
    const menuWidth = 220
    const menuHeight = 148
    setBackdropMenu({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    })
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button === 2) return
    if (pointers.current.size === 0) {
      cutoutEditFloor.current = { strokes: edit.strokes.length, wand: edit.wandFills.length }
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size >= 2) {
      panDrag.current = null
      const points = [...pointers.current.values()]
      pinchRef.current = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1,
        zoom: zoomRef.current,
        pan: { ...panRef.current },
        midX: (points[0].x + points[1].x) / 2,
        midY: (points[0].y + points[1].y) / 2,
      }
      for (const id of pointers.current.keys()) {
        try {
          event.currentTarget.setPointerCapture(id)
        } catch {
          /* a pointer can already be captured by the brush */
        }
      }
      setEdit((current) => {
        const floor = cutoutEditFloor.current
        const trimStrokes = current.strokes.length > floor.strokes
        const trimWand = current.wandFills.length > floor.wand
        if (!trimStrokes && !trimWand) return current
        return {
          ...current,
          strokes: trimStrokes ? current.strokes.slice(0, floor.strokes) : current.strokes,
          wandFills: trimWand ? current.wandFills.slice(0, floor.wand) : current.wandFills,
        }
      })
      return
    }
    const painting =
      tool === 'cutout' &&
      edit.cutout &&
      event.button === 0 &&
      !event.altKey &&
      (event.pointerType === 'touch' || event.target !== event.currentTarget)
    if (event.button === 1 || event.altKey || !painting) {
      panDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: panRef.current.x, panY: panRef.current.y }
      if (!painting) event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size >= 2) {
      const points = [...pointers.current.values()]
      const midX = (points[0].x + points[1].x) / 2
      const midY = (points[0].y + points[1].y) / 2
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1
      const center = stageCenter()
      const start = pinchRef.current ?? {
        distance,
        zoom: zoomRef.current,
        pan: { ...panRef.current },
        midX,
        midY,
      }
      if (!pinchRef.current) pinchRef.current = start
      const nextZoom = clampStageZoom(start.zoom * (distance / start.distance))
      const localX = (start.midX - center.x - start.pan.x) / (start.zoom || 1)
      const localY = (start.midY - center.y - start.pan.y) / (start.zoom || 1)
      commitView(nextZoom, {
        x: midX - center.x - localX * nextZoom,
        y: midY - center.y - localY * nextZoom,
      })
      return
    }
    const drag = panDrag.current
    if (!drag || drag.id !== event.pointerId) return
    commitView(zoomRef.current, {
      x: drag.panX + event.clientX - drag.x,
      y: drag.panY + event.clientY - drag.y,
    })
  }

  function onStagePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    if (panDrag.current?.id === event.pointerId) panDrag.current = null
  }

  function bakeEdit() {
    const full = fullRef.current
    if (!full || baking || applying) return
    setBaking(true)
    setError(null)
    window.setTimeout(() => {
      try {
        fullRef.current = applyArtEdit(full, edit, 'final')
        const cleared = defaultArtEdit()
        cutoutBeforeClean.current = null
        setEdit(cleared)
        setBaseline(cleared)
        setEffect('none')
        setBaselineEffect('none')
        setBaselineBrush(brushSize)
        setReady((value) => value + 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not apply the edit')
      } finally {
        setBaking(false)
      }
    }, 0)
  }

  async function apply(mode: SaveMode) {
    const full = fullRef.current
    if (!full || applying || busy) return
    setApplying(mode)
    setError(null)
    try {
      const edited = applyArtEdit(full, edit, 'final')
      const canvas = document.createElement('canvas')
      canvas.width = edited.width
      canvas.height = edited.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not export the edit')
      ctx.putImageData(new ImageData(new Uint8ClampedArray(edited.data), edited.width, edited.height), 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not export the edit')
      await onApply(blob, mode)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the edit')
    } finally {
      setApplying(null)
    }
  }

  function onResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    resizeDrag.current = { x: event.clientX, y: event.clientY, width: frame.width, height: frame.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = resizeDrag.current
    if (!drag) return
    const maxWidth = Math.max(640, window.innerWidth - 32)
    const maxHeight = Math.max(520, window.innerHeight - 32)
    setFrame({
      width: Math.min(maxWidth, Math.max(640, drag.width + (event.clientX - drag.x) * 2)),
      height: Math.min(maxHeight, Math.max(520, drag.height + (event.clientY - drag.y) * 2)),
    })
  }

  function onResizePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    resizeDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const shortSide = Math.max(1, Math.min(fullRef.current?.width || 1, fullRef.current?.height || 1))
  const borderPx = Math.round(edit.border * shortSide)
  const checkerContrast = 24
  const checkerDark = Math.round((backdropGray * (255 - checkerContrast)) / 255)
  const checkerLight = Math.min(255, checkerDark + checkerContrast)

  return (
    <div ref={overlayRef} className={`fixed inset-0 z-[85] flex items-center justify-center overscroll-contain bg-black/75 ${expanded ? 'p-0' : 'p-4'}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merch-art-editor-title"
        className={`relative flex flex-col overflow-hidden border border-white/15 bg-zinc-950 text-white shadow-2xl ${
          expanded ? 'h-full w-full rounded-none' : 'rounded-2xl'
        }`}
        style={expanded ? undefined : { width: frame.width, height: frame.height }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 id="merch-art-editor-title" className="text-sm font-semibold">
              Edit artwork
            </h2>
            <p className="text-[11px] text-white/50">Adjust the image, then save it back to the library.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Save edit"
              title="Save edit"
              disabled={!fullRef.current || Boolean(applying) || busy}
              onClick={() => void apply('replace')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white hover:text-black disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M3 2.5h7.2L13.5 5.8V13.5H3z" />
                <path d="M5.5 2.5V6h4" />
                <path d="M5.5 13.5V10h5v3.5" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Save as new art"
              title="Save as new art"
              disabled={!fullRef.current || Boolean(applying) || busy}
              onClick={() => void apply('copy')}
              className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white hover:text-black disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M3 2.5h7.2L13.5 5.8V13.5H3z" />
                <path d="M5.5 2.5V6h4" />
                <path d="M5.5 13.5V10h5v3.5" />
              </svg>
              <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-sm font-bold leading-none text-black group-hover:bg-black group-hover:text-white">
                +
              </span>
            </button>
            <button
              type="button"
              aria-label={expanded ? 'Restore editor size' : 'Expand editor'}
              aria-pressed={expanded}
              onClick={() => setExpanded((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white hover:text-black"
            >
              {expanded ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M6 2.5H2.5V6M10 13.5h3.5V10M2.5 10v3.5H6M13.5 6V2.5H10" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5M13.5 9.5V13.5H9.5M2.5 6.5V2.5H6.5" />
                </svg>
              )}
            </button>
            <button
              type="button"
              aria-label="Close editor"
              onClick={() => setLeaving(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-lg leading-none hover:bg-white hover:text-black"
            >
              ×
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] md:grid-rows-[minmax(0,1fr)]">
          <div className="flex h-full min-h-0 flex-col">
          <div
            ref={bindStage}
            className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
            style={
              backdropMode === 'solid'
                ? { backgroundColor: `rgb(${backdropGray},${backdropGray},${backdropGray})` }
                : {
                    background: `radial-gradient(ellipse at center, rgb(${checkerLight},${checkerLight},${checkerLight}) 0%, rgb(${checkerDark},${checkerDark},${checkerDark}) 70%)`,
                  }
            }
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerEnd}
            onPointerCancel={onStagePointerEnd}
            onContextMenu={onStageContextMenu}
          >
            <div
              className="relative"
              style={
                viewSize.width > 0
                  ? {
                      width: viewSize.width,
                      height: viewSize.height,
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      ...(backdropMode === 'solid'
                        ? { backgroundColor: `rgb(${backdropGray},${backdropGray},${backdropGray})`, backgroundImage: 'none' }
                        : {
                            backgroundColor: `rgb(${checkerDark},${checkerDark},${checkerDark})`,
                            backgroundImage: `linear-gradient(45deg, rgb(${checkerLight},${checkerLight},${checkerLight}) 25%, transparent 25%), linear-gradient(-45deg, rgb(${checkerLight},${checkerLight},${checkerLight}) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(${checkerLight},${checkerLight},${checkerLight}) 75%), linear-gradient(-45deg, transparent 75%, rgb(${checkerLight},${checkerLight},${checkerLight}) 75%)`,
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
                          }),
                    }
                  : { width: 1, height: 1 }
              }
            >
              <canvas ref={canvasRef} className="block h-full w-full object-contain" />
              {tool === 'cutout' && cutoutPaintMode === 'wand' && viewSize.width > 0 ? (
                <canvas
                  ref={wandOverlayRef}
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  aria-hidden
                />
              ) : null}
              {tool === 'crop' && viewSize.width > 0 ? (
                <CropOverlay crop={edit.crop} onChange={(crop) => setEdit((current) => ({ ...current, crop }))} />
              ) : null}
              {tool === 'cutout' && viewSize.width > 0 && (edit.cutout || cutoutPaintMode === 'wand') ? (
                <div
                  className={`absolute inset-0 touch-none ${cutoutPaintMode === 'brush' ? 'cursor-none' : 'cursor-crosshair'}`}
                  onPointerDown={(event) => {
                    if (event.button === 2 || event.altKey || event.button === 1) return
                    if (pointers.current.size > 0) return
                    lastBrush.current = null
                    event.currentTarget.setPointerCapture(event.pointerId)
                    if (cutoutPaintMode === 'wand') {
                      paintWand(event)
                      return
                    }
                    if (!edit.cutout) return
                    if (event.pointerType === 'touch') return
                    brush.place(event)
                    paintStroke(event)
                  }}
                  onPointerMove={(event) => {
                    if (pointers.current.size > 1) return
                    if (cutoutPaintMode === 'wand') {
                      const source = pointerSourcePoint(event)
                      scheduleWandPreview(source)
                      return
                    }
                    if (!edit.cutout) return
                    brush.place(event)
                    if (event.buttons !== 1) return
                    if (event.pointerType === 'touch' && pointers.current.size !== 1) return
                    paintStroke(event)
                  }}
                  onPointerLeave={() => {
                    brush.hide()
                    scheduleWandPreview(null)
                  }}
                  onPointerEnter={(event) => {
                    if (cutoutPaintMode === 'wand') {
                      scheduleWandPreview(pointerSourcePoint(event))
                    }
                  }}
                >
                  {cutoutPaintMode === 'brush' && edit.cutout ? (
                    <BrushCursor ref={brush.ref} tone={brushRestore ? 'restore' : 'erase'} />
                  ) : null}
                </div>
              ) : null}
            </div>
            {viewSize.width > 0 ? null : <p className="absolute text-sm text-white/45">{error || 'Loading artwork…'}</p>}
            {backdropMenu ? (
              <div
                role="menu"
                aria-label="Preview background"
                className="fixed z-[90] w-[220px] space-y-3 rounded-xl border border-white/15 bg-zinc-950 p-3 text-white shadow-2xl"
                style={{ left: backdropMenu.x, top: backdropMenu.y }}
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                <div className="flex gap-1">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={backdropMode === 'checkers'}
                    onClick={() => setBackdropMode('checkers')}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] ${
                      backdropMode === 'checkers' ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'
                    }`}
                  >
                    Checkers
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={backdropMode === 'solid'}
                    onClick={() => setBackdropMode('solid')}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] ${
                      backdropMode === 'solid' ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'
                    }`}
                  >
                    Solid
                  </button>
                </div>
                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-[11px] text-white/70">
                    Tone
                    <span className="tabular-nums text-white/40">{backdropGray}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    aria-label="Background tone from black to white"
                    value={backdropGray}
                    onChange={(event) => setBackdropGray(Number(event.target.value))}
                    className="w-full accent-white"
                  />
                </label>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2">
            <span
              className="w-10 cursor-pointer text-[10px] uppercase tracking-wide text-white/45"
              title="Double-click to fit"
              onDoubleClick={fitView}
            >
              Zoom
            </span>
            <input
              type="range"
              min={100}
              max={800}
              step={1}
              aria-label="Zoom"
              aria-valuemin={100}
              aria-valuemax={800}
              aria-valuenow={Math.round(zoom * 100)}
              aria-valuetext={`${Math.round(zoom * 100)} percent. Pinch with two fingers or a trackpad to zoom, and drag or scroll with two fingers to move.`}
              value={Math.round(zoom * 100)}
              onChange={(event) => {
                const nextZoom = clampStageZoom(Number(event.target.value) / 100)
                commitView(nextZoom, panForZoom(panRef.current, zoomRef.current, nextZoom, 0, 0))
              }}
              onDoubleClick={fitView}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-white"
            />
            <span className="w-10 text-right text-[10px] tabular-nums text-white/55">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="flex items-center justify-center gap-1 overflow-x-auto overscroll-contain border-t border-white/10 px-3 py-2" role="toolbar" aria-label="Artwork tools">
            {TOOLS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  tool === id ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          </div>
          <div className="flex h-full min-h-0 flex-col overflow-hidden border-t border-white/10 md:border-l md:border-t-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            {tool === 'adjust' ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">Light</p>
                  <Slider label="Highlights" min={-100} max={100} value={edit.tone.highlights} onChange={(highlights) => patchTone({ highlights })} onReset={() => restoreTone('highlights')} />
                  <Slider label="Brightness" min={40} max={180} value={edit.tone.brightness} onChange={(brightness) => patchTone({ brightness })} onReset={() => restoreTone('brightness')} />
                  <Slider label="Contrast" min={40} max={180} value={edit.tone.contrast} onChange={(contrast) => patchTone({ contrast })} onReset={() => restoreTone('contrast')} />
                  <Slider label="Shadows" min={-100} max={100} value={edit.tone.shadows} onChange={(shadows) => patchTone({ shadows })} onReset={() => restoreTone('shadows')} />
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">Colors</p>
                  <Slider label="Saturation" min={0} max={200} value={edit.tone.saturation} onChange={(saturation) => patchTone({ saturation })} onReset={() => restoreTone('saturation')} />
                  <Slider label="Temperature" min={-100} max={100} value={edit.tone.temperature} onChange={(temperature) => patchTone({ temperature })} onReset={() => restoreTone('temperature')} />
                  <Slider label="Hue" min={-180} max={180} value={edit.tone.hue} onChange={(hue) => patchTone({ hue })} onReset={() => restoreTone('hue')} />
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">Clarity</p>
                  <Slider label="Clarity" min={-100} max={100} value={edit.tone.clarity} onChange={(clarity) => patchTone({ clarity })} onReset={() => restoreTone('clarity')} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const full = fullRef.current
                    if (!full) return
                    const tone = autoTone(scaleImageData(full, 240))
                    patchTone(tone)
                  }}
                  className="w-full rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10"
                >
                  Auto
                </button>
              </div>
            ) : null}

            {tool === 'curves' ? (
              <div className="space-y-3">
                <div className="flex gap-1">
                  {CHANNELS.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      title="Double-click to reset"
                      onClick={() => setChannel(id)}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        setEdit((current) => ({
                          ...current,
                          curves: {
                            ...current.curves,
                            [id]: baseline.curves[id].map((point) => ({ ...point })),
                          },
                        }))
                      }}
                      className={`rounded-full px-2.5 py-1 text-[11px] ${channel === id ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <CurvePad
                  key={channel}
                  points={edit.curves[channel]}
                  onChange={(points) => {
                    setEffect('none')
                    setEdit((current) => ({ ...current, curves: { ...current.curves, [channel]: points } }))
                  }}
                />
                <p className="text-[11px] text-white/45">Click the graph to add a point. Drag to reshape the tone.</p>
              </div>
            ) : null}

            {tool === 'crop' ? (
              <div className="space-y-3">
                <p className="text-[11px] text-white/45">Drag the frame to keep the part of the image you want.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    title="Double-click to reset"
                    onClick={() => setEdit((current) => ({ ...current, flipX: !current.flipX }))}
                    onDoubleClick={() => setEdit((current) => ({ ...current, flipX: baseline.flipX }))}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${edit.flipX ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Flip ↔
                  </button>
                  <button
                    type="button"
                    title="Double-click to reset"
                    onClick={() => setEdit((current) => ({ ...current, flipY: !current.flipY }))}
                    onDoubleClick={() => setEdit((current) => ({ ...current, flipY: baseline.flipY }))}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${edit.flipY ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Flip ↕
                  </button>
                  <button
                    type="button"
                    title="Double-click to reset"
                    onClick={() => setEdit((current) => ({ ...current, rotate: (current.rotate + 90) % 360 }))}
                    onDoubleClick={() => setEdit((current) => ({ ...current, rotate: baseline.rotate }))}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
                  >
                    Rotate 90°
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setEdit((current) => ({ ...current, crop: { ...baseline.crop } }))}
                  className="text-xs text-white/55 hover:text-white"
                >
                  Reset crop
                </button>
              </div>
            ) : null}

            {tool === 'cutout' ? (
              <div className="space-y-3">
                <button
                  type="button"
                  title="Double-click to reset"
                  onClick={() => setEdit((current) => ({ ...current, cutout: !current.cutout }))}
                  onDoubleClick={() => {
                    cutoutBeforeClean.current = null
                    setEdit((current) => ({
                      ...current,
                      cutout: baseline.cutout,
                      edgeClean: baseline.edgeClean,
                      shave: baseline.shave,
                      crisp: baseline.crisp,
                      strokes: baseline.strokes.map((stroke) => ({ ...stroke })),
                      wandFills: baseline.wandFills.map((fill) => ({ ...fill })),
                      invertMask: baseline.invertMask,
                      fillHoles: baseline.fillHoles,
                      maskExpand: baseline.maskExpand,
                    }))
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-xs ${
                    edit.cutout ? 'border-white bg-white text-black' : 'border-white/20 hover:bg-white/10'
                  }`}
                >
                  {edit.cutout ? 'Background removed' : 'Remove background'}
                </button>
                <Slider
                  label="Edge clean"
                  min={0}
                  max={100}
                  value={edit.edgeClean}
                  onChange={(edgeClean) => setMatte({ edgeClean })}
                  onReset={() => setMatte({ edgeClean: baseline.edgeClean })}
                />
                <Slider
                  label="Shave"
                  min={0}
                  max={100}
                  value={edit.shave ?? 0}
                  onChange={(shave) => setMatte({ shave })}
                  onReset={() => setMatte({ shave: baseline.shave })}
                />
                <Slider
                  label="Crisp"
                  min={0}
                  max={100}
                  value={edit.crisp ?? 0}
                  onChange={(crisp) => setMatte({ crisp })}
                  onReset={() => setMatte({ crisp: baseline.crisp })}
                />
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Local edits</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCutoutPaintMode('brush')}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${cutoutPaintMode === 'brush' ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Brush
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoutPaintMode('wand')}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${cutoutPaintMode === 'wand' ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Magic wand
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBrushRestore(true)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${brushRestore ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrushRestore(false)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${!brushRestore ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Erase
                  </button>
                </div>
                {cutoutPaintMode === 'brush' ? (
                  <BrushSizeControl
                    label="Brush"
                    radius={brushSize}
                    surfaceWidth={viewSize.width}
                    tone={brushRestore ? 'restore' : 'erase'}
                    onChange={setBrushSize}
                    onReset={() => setBrushSize(baselineBrush)}
                  />
                ) : (
                  <>
                    <Slider
                      label="Wand tolerance"
                      min={4}
                      max={72}
                      value={wandTolerance}
                      onChange={setWandTolerance}
                      onReset={() => setWandTolerance(28)}
                    />
                    <Slider
                      label="Edge guard"
                      min={0}
                      max={100}
                      value={wandEdgeGuard}
                      onChange={setWandEdgeGuard}
                      onReset={() => setWandEdgeGuard(62)}
                    />
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEdit((current) => ({ ...current, fillHoles: !current.fillHoles }))}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] ${edit.fillHoles ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Fill holes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdit((current) => ({ ...current, invertMask: !current.invertMask }))}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] ${edit.invertMask ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    Invert mask
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEdit((current) => ({
                        ...current,
                        maskExpand: Math.max(-6, (current.maskExpand ?? 0) - 1),
                      }))
                    }
                    className="rounded-lg border border-white/15 px-2 py-1.5 text-[11px] hover:bg-white/10"
                  >
                    Contract −
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEdit((current) => ({
                        ...current,
                        maskExpand: Math.min(6, (current.maskExpand ?? 0) + 1),
                      }))
                    }
                    className="rounded-lg border border-white/15 px-2 py-1.5 text-[11px] hover:bg-white/10"
                  >
                    Expand +
                  </button>
                </div>
                {(edit.maskExpand ?? 0) !== 0 ? (
                  <p className="text-[10px] text-white/45">
                    Mask {edit.maskExpand > 0 ? 'expanded' : 'contracted'} {Math.abs(edit.maskExpand)} px
                    <button
                      type="button"
                      onClick={() => setEdit((current) => ({ ...current, maskExpand: 0 }))}
                      className="ml-2 underline hover:text-white"
                    >
                      Reset
                    </button>
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEdit((current) => ({ ...current, strokes: [], wandFills: [] }))}
                  className="text-xs text-white/55 hover:text-white"
                >
                  Clear brush &amp; wand
                </button>
                <p className="text-[11px] text-white/45">
                  Lower tolerance selects less; higher edge guard stops bleed into nearby colours. Edge clean, shave, and crisp remove leftover fringe after the automatic cut.
                </p>
              </div>
            ) : null}

            {tool === 'fit' ? (
              <div className="space-y-3">
                <div className="flex gap-1">
                  {(
                    [
                      ['original', 'Original'],
                      ['square', 'Square'],
                      ['portrait', '4:5'],
                    ] as Array<[FitMode, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      title="Double-click to reset"
                      onClick={() => setEdit((current) => ({ ...current, fit: id }))}
                      onDoubleClick={() => setEdit((current) => ({ ...current, fit: baseline.fit }))}
                      className={`rounded-full px-2.5 py-1 text-[11px] ${edit.fit === id ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label
                  title="Double-click to reset"
                  onDoubleClick={() => setEdit((current) => ({ ...current, padColor: [...baseline.padColor] }))}
                  className="flex cursor-default select-none items-center justify-between text-[11px] text-white/70"
                >
                  Pad color
                  <input
                    type="color"
                    value={rgbToHex(edit.padColor)}
                    onChange={(event) => setEdit((current) => ({ ...current, padColor: hexToRgb(event.target.value) }))}
                    className="h-7 w-10 bg-transparent"
                  />
                </label>
                <Slider
                  label="Border"
                  min={0}
                  max={80}
                  value={borderPx}
                  onChange={(px) => setEdit((current) => ({ ...current, border: px / shortSide }))}
                  onReset={() => setEdit((current) => ({ ...current, border: baseline.border }))}
                />
                <label
                  title="Double-click to reset"
                  onDoubleClick={() => setEdit((current) => ({ ...current, borderColor: [...baseline.borderColor] }))}
                  className="flex cursor-default select-none items-center justify-between text-[11px] text-white/70"
                >
                  Border color
                  <input
                    type="color"
                    value={rgbToHex(edit.borderColor)}
                    onChange={(event) => setEdit((current) => ({ ...current, borderColor: hexToRgb(event.target.value) }))}
                    className="h-7 w-10 bg-transparent"
                  />
                </label>
              </div>
            ) : null}

            {tool === 'effects' ? (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['none', 'None'],
                    ['bw', 'Black & white'],
                    ['film', 'Film'],
                    ['blur', 'Soft blur'],
                  ] as Array<[EffectName, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    title="Double-click to reset"
                    onClick={() => {
                      setEffect(id)
                      setEdit((current) => applyEffect(current, id))
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault()
                      restoreCurves()
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs ${effect === id ? 'border-white bg-white text-black' : 'border-white/15 hover:bg-white/10'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {error ? <p className="text-xs text-amber-300">{error}</p> : null}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-white/10 px-4 py-2">
            <button
              type="button"
              disabled={!canUndo || baking || Boolean(applying)}
              onClick={undoEditor}
              title="Undo (⌘Z)"
              className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/30"
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!canRedo || baking || Boolean(applying)}
              onClick={redoEditor}
              title="Redo (⌘⇧Z)"
              className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/30"
            >
              Redo
            </button>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                cutoutBeforeClean.current = null
                const nextEdit = cloneArtEdit(baseline)
                applyingHistoryRef.current = true
                setEdit(nextEdit)
                setEffect(baselineEffect)
                setBrushSize(baselineBrush)
                setWandTolerance(28)
                setWandEdgeGuard(62)
                setCutoutPaintMode('brush')
                resetEditorHistory({ edit: nextEdit, effect: baselineEffect })
              }}
              className="rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white"
            >
              Reset
            </button>
            <button
              type="button"
              disabled={!fullRef.current || baking || Boolean(applying) || busy}
              onClick={bakeEdit}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:bg-white/20 disabled:text-white/40"
            >
              {baking ? 'Applying…' : 'Apply'}
            </button>
          </div>
          </div>
        </div>

        {leaving ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="merch-art-exit-title"
              className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-5 text-white shadow-2xl"
            >
              <h2 id="merch-art-exit-title" className="text-base font-semibold">
                Leave this edit?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Save the artwork, keep a separate copy, or discard these changes.
              </p>
              {error ? <p className="mt-3 text-xs text-amber-300">{error}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={Boolean(applying)}
                  onClick={() => setLeaving(false)}
                  className="rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={Boolean(applying) || busy}
                  onClick={onClose}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={!fullRef.current || Boolean(applying) || busy}
                  onClick={() => void apply('copy')}
                  className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white hover:text-black disabled:border-white/10 disabled:text-white/40 disabled:hover:bg-transparent"
                >
                  {applying === 'copy' ? 'Saving…' : 'Save as new art'}
                </button>
                <button
                  type="button"
                  disabled={!fullRef.current || Boolean(applying) || busy}
                  onClick={() => void apply('replace')}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:bg-white/20 disabled:text-white/40"
                >
                  {applying === 'replace' ? 'Saving…' : 'Save edit'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {expanded ? null : (
          <button
            type="button"
            aria-label="Resize editor"
            title="Drag to resize"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
            className="absolute bottom-0 right-0 z-10 h-6 w-6 cursor-nwse-resize touch-none"
          >
            <svg viewBox="0 0 16 16" className="h-full w-full text-white/50" aria-hidden>
              <path d="M14 6v8H6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M14 10v4h-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

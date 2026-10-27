'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  applyArtEdit,
  applyEffect,
  autoTone,
  clampCrop,
  defaultArtEdit,
  displayToSource,
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
  const strokeFloor = useRef(0)
  zoomRef.current = zoom
  panRef.current = pan
  viewSizeRef.current = viewSize

  useEffect(() => {
    const fresh = defaultArtEdit()
    cutoutBeforeClean.current = null
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
      const scale = Math.min(stageBox.width / edited.width, stageBox.height / edited.height)
      const width = Math.max(1, Math.round(edited.width * scale))
      const height = Math.max(1, Math.round(edited.height * scale))
      setViewSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview the edit')
    }
  }, [edit, tool, ready, stageBox])

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

  function paintStroke(event: ReactPointerEvent<HTMLDivElement>) {
    if (!edit.cutout) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    const displayed = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    }
    const source = displayToSource(displayed.x, displayed.y, edit.flipX, edit.flipY, edit.rotate)
    const previous = lastBrush.current
    if (previous && Math.hypot(previous.x - source.x, previous.y - source.y) < brushSize * 0.35) return
    lastBrush.current = source
    setEdit((current) => ({
      ...current,
      strokes: [...current.strokes, { ...source, radius: brushSize, restore: brushRestore }],
    }))
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

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointers.current.size === 0) strokeFloor.current = edit.strokes.length
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
      setEdit((current) =>
        current.strokes.length > strokeFloor.current
          ? { ...current, strokes: current.strokes.slice(0, strokeFloor.current) }
          : current,
      )
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
            className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,#2a2a2a_0%,#111_70%)]"
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerEnd}
            onPointerCancel={onStagePointerEnd}
          >
            <div
              className="relative"
              style={
                viewSize.width > 0
                  ? {
                      width: viewSize.width,
                      height: viewSize.height,
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      backgroundColor: '#141414',
                      backgroundImage:
                        'linear-gradient(45deg, #2c2c2c 25%, transparent 25%), linear-gradient(-45deg, #2c2c2c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2c2c2c 75%), linear-gradient(-45deg, transparent 75%, #2c2c2c 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
                    }
                  : { width: 1, height: 1 }
              }
            >
              <canvas ref={canvasRef} className="block h-full w-full object-contain" />
              {tool === 'crop' && viewSize.width > 0 ? (
                <CropOverlay crop={edit.crop} onChange={(crop) => setEdit((current) => ({ ...current, crop }))} />
              ) : null}
              {tool === 'cutout' && edit.cutout && viewSize.width > 0 ? (
                <div
                  className="absolute inset-0 cursor-none touch-none"
                  onPointerDown={(event) => {
                    if (event.altKey || event.button === 1) return
                    if (event.pointerType === 'touch') {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      return
                    }
                    if (pointers.current.size > 0) return
                    lastBrush.current = null
                    event.currentTarget.setPointerCapture(event.pointerId)
                    brush.place(event)
                    paintStroke(event)
                  }}
                  onPointerMove={(event) => {
                    if (pointers.current.size > 1) return
                    brush.place(event)
                    if (event.buttons !== 1) return
                    if (event.pointerType === 'touch' && pointers.current.size !== 1) return
                    paintStroke(event)
                  }}
                  onPointerLeave={brush.hide}
                >
                  <BrushCursor ref={brush.ref} tone={brushRestore ? 'restore' : 'erase'} />
                </div>
              ) : null}
            </div>
            {viewSize.width > 0 ? null : <p className="absolute text-sm text-white/45">{error || 'Loading artwork…'}</p>}
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
                <BrushSizeControl
                  label="Brush"
                  radius={brushSize}
                  surfaceWidth={viewSize.width}
                  tone={brushRestore ? 'restore' : 'erase'}
                  onChange={setBrushSize}
                  onReset={() => setBrushSize(baselineBrush)}
                />
                <button
                  type="button"
                  onClick={() => setEdit((current) => ({ ...current, strokes: [] }))}
                  className="text-xs text-white/55 hover:text-white"
                >
                  Clear brush
                </button>
                <p className="text-[11px] text-white/45">
                  Shave peels leftover pixels off the cut. Crisp snaps a soft edge and pulls background colour out of the rim. Paint to bring an edge back.
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
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                cutoutBeforeClean.current = null
                setEdit({
                  ...baseline,
                  tone: { ...baseline.tone },
                  curves: {
                    rgb: baseline.curves.rgb.map((point) => ({ ...point })),
                    r: baseline.curves.r.map((point) => ({ ...point })),
                    g: baseline.curves.g.map((point) => ({ ...point })),
                    b: baseline.curves.b.map((point) => ({ ...point })),
                  },
                  crop: { ...baseline.crop },
                  padColor: [...baseline.padColor],
                  borderColor: [...baseline.borderColor],
                  strokes: baseline.strokes.map((stroke) => ({ ...stroke })),
                })
                setEffect(baselineEffect)
                setBrushSize(baselineBrush)
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

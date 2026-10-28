'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { renderMerchText } from '@/lib/merch/text-render'
import {
  applyTextPreset,
  contrastPlate,
  DEFAULT_TEXT_STYLE,
  TEXT_PRESETS,
  type MerchTextStyle,
  type TextAlign,
  type TextCase,
  type TextPreset,
} from '@/lib/merch/text-style'
import {
  MERCH_FONT_CATEGORIES,
  loadMerchFont,
  loadMerchFonts,
  merchFontById,
  merchFontsIn,
  type MerchFontCategory,
} from '@/lib/merch/text-fonts'

const COLORS = ['#ffffff', '#000000', '#ff2d55', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2']
const PREVIEW_PX = 96
const BAKE_PX = 280

type TextPanel = 'font' | 'style' | 'color' | 'stroke' | 'shadow'

const PANELS: Array<{ id: TextPanel; label: string }> = [
  { id: 'font', label: 'Font' },
  { id: 'style', label: 'Style' },
  { id: 'color', label: 'Color' },
  { id: 'stroke', label: 'Stroke' },
  { id: 'shadow', label: 'Shadow' },
]

const CASES: Array<{ id: TextCase; label: string }> = [
  { id: 'as-typed', label: 'Aa' },
  { id: 'upper', label: 'AA' },
  { id: 'lower', label: 'aa' },
]

const ALIGNS: Array<{ id: TextAlign; label: string }> = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
]

function Chip({
  active,
  onClick,
  children,
  style,
}: {
  active: boolean
  onClick: () => void
  children: string
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`rounded-md px-2.5 py-1 text-xs ${
        active ? 'bg-white text-black' : 'bg-white/10 text-white/75 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-[11px] text-white/70">
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

function ColorRow({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (color: string) => void
  label: string
}) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLORS.map((color) => (
        <button
          key={`${label}-${color}`}
          type="button"
          title={color}
          aria-label={`${label} ${color}`}
          onClick={() => onChange(color)}
          className={`h-7 w-7 rounded-full border ${
            value.toLowerCase() === color ? 'border-white ring-2 ring-white/50' : 'border-white/20'
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
      <input
        type="color"
        aria-label={`${label} custom`}
        value={hex}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-7 cursor-pointer rounded-full border border-white/20 bg-transparent p-0"
      />
    </div>
  )
}

export default function MerchTextDesigner({
  onArtCreated,
}: {
  /** Called with the stored art URL so the room can refresh the library and place it. */
  onArtCreated: (url: string) => void
}) {
  const [text, setText] = useState('')
  const [fontId, setFontId] = useState('six-caps')
  const [fontCategory, setFontCategory] = useState<MerchFontCategory>('brand')
  const [style, setStyle] = useState<MerchTextStyle>(DEFAULT_TEXT_STYLE)
  const [preset, setPreset] = useState<TextPreset>('plain')
  const [panel, setPanel] = useState<TextPanel>('font')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)

  const fontChoice = merchFontById(fontId)
  const visibleFonts = merchFontsIn(fontCategory)

  useEffect(() => {
    void loadMerchFonts(merchFontsIn(fontCategory))
  }, [fontCategory])

  useLayoutEffect(() => {
    const node = previewRef.current
    if (!node) return
    let cancel = false
    const paint = () => {
      const canvas = previewRef.current
      if (!canvas || cancel) return
      renderMerchText(
        canvas,
        {
          text: text.trim() ? text : 'SERGIK',
          fontStack: fontChoice.stack,
          fontWeight: fontChoice.weight,
          style,
        },
        PREVIEW_PX
      )
      const maxW = canvas.parentElement?.clientWidth ?? 380
      const scale = Math.min(1, maxW / Math.max(1, canvas.width), 128 / Math.max(1, canvas.height))
      canvas.style.width = `${Math.round(canvas.width * scale)}px`
      canvas.style.height = `${Math.round(canvas.height * scale)}px`
    }
    paint()
    void loadMerchFont(fontChoice, PREVIEW_PX).then(() => paint())
    return () => {
      cancel = true
    }
  }, [text, style, fontChoice])

  function patch(partial: Partial<MerchTextStyle>) {
    setStyle((current) => ({ ...current, ...partial }))
  }

  function choosePreset(next: TextPreset) {
    setPreset(next)
    setStyle((current) => applyTextPreset(current, next))
  }

  async function addText() {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await Promise.race([
        loadMerchFont(fontChoice, BAKE_PX),
        new Promise((resolve) => window.setTimeout(resolve, 2500)),
      ])
      const canvas = canvasRef.current ?? document.createElement('canvas')
      renderMerchText(
        canvas,
        { text, fontStack: fontChoice.stack, fontWeight: fontChoice.weight, style },
        BAKE_PX
      )
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not export text')
      const body = new FormData()
      body.set('file', new File([blob], 'text.png', { type: 'image/png' }))
      const res = await fetch('/api/admin/merch/art', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save text art')
      onArtCreated(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add text')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Text</p>
        <p className="text-[11px] leading-relaxed text-white/55">
          Case, spacing, color, stroke, shadow, plate, and bend. Saved as a transparent PNG you can drag and scale.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        placeholder="SERGIK"
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 p-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
      />

      <div className="flex min-h-[88px] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[conic-gradient(#222_25%,#333_0_50%,#222_0_75%,#333_0)] bg-[length:16px_16px] p-2">
        <canvas ref={previewRef} aria-label="Text preview" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TEXT_PRESETS.map((item) => (
          <Chip key={item.id} active={preset === item.id} onClick={() => choosePreset(item.id)}>
            {item.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {PANELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPanel(item.id)}
            className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide ${
              panel === item.id ? 'bg-white text-black' : 'text-white/55 hover:bg-white/10'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {panel === 'font' ? (
        <div>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {MERCH_FONT_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setFontCategory(category.id)}
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  fontCategory === category.id ? 'bg-white text-black' : 'text-white/55 hover:bg-white/10'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleFonts.map((font) => (
              <Chip
                key={font.id}
                active={fontId === font.id}
                onClick={() => {
                  setFontId(font.id)
                  void loadMerchFont(font)
                }}
                style={{ fontFamily: font.stack, fontWeight: font.weight }}
              >
                {font.label}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {panel === 'style' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CASES.map((item) => (
              <Chip key={item.id} active={style.caseMode === item.id} onClick={() => patch({ caseMode: item.id })}>
                {item.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALIGNS.map((item) => (
              <Chip key={item.id} active={style.align === item.id} onClick={() => patch({ align: item.id })}>
                {item.label}
              </Chip>
            ))}
          </div>
          <Slider
            label="Letter spacing"
            min={-10}
            max={50}
            value={Math.round(style.letterSpacing * 100)}
            onChange={(value) => patch({ letterSpacing: value / 100 })}
          />
          <Slider
            label="Line spacing"
            min={70}
            max={180}
            value={Math.round(style.lineHeight * 100)}
            onChange={(value) => patch({ lineHeight: value / 100 })}
          />
          <Slider label="Bend" min={-100} max={100} value={style.bend} onChange={(value) => patch({ bend: value })} />
          <Slider
            label="Resize X"
            min={25}
            max={250}
            value={Math.round((Number.isFinite(style.scaleX) ? style.scaleX : 1) * 100)}
            onChange={(value) => patch({ scaleX: value / 100 })}
          />
          <Slider
            label="Resize Y"
            min={25}
            max={250}
            value={Math.round((Number.isFinite(style.scaleY) ? style.scaleY : 1) * 100)}
            onChange={(value) => patch({ scaleY: value / 100 })}
          />
          <Slider
            label="Opacity"
            min={10}
            max={100}
            value={Math.round(style.opacity * 100)}
            onChange={(value) => patch({ opacity: value / 100 })}
          />
          {Math.abs(style.bend) >= 2 ? (
            <p className="text-[10px] text-white/40">Bend centers each line on an arc. Alignment applies when bend is off.</p>
          ) : null}
        </div>
      ) : null}

      {panel === 'color' ? (
        <div className="space-y-3">
          <ColorRow label="Fill" value={style.fill} onChange={(fill) => patch({ fill })} />
          <Chip active={style.fillEnd !== null} onClick={() => patch({ fillEnd: style.fillEnd ? null : '#ff2d55' })}>
            {style.fillEnd ? 'Gradient on' : 'Gradient off'}
          </Chip>
          {style.fillEnd ? (
            <ColorRow label="Gradient end" value={style.fillEnd} onChange={(fillEnd) => patch({ fillEnd })} />
          ) : null}
        </div>
      ) : null}

      {panel === 'stroke' ? (
        <div className="space-y-3">
          <Slider
            label="Stroke"
            min={0}
            max={18}
            value={Math.round(style.strokeWidth * 100)}
            onChange={(value) => patch({ strokeWidth: value / 100 })}
          />
          <ColorRow label="Stroke" value={style.strokeColor} onChange={(strokeColor) => patch({ strokeColor })} />
        </div>
      ) : null}

      {panel === 'shadow' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={style.echo}
              onClick={() =>
                patch({
                  echo: !style.echo,
                  shadowDistance: !style.echo && style.shadowDistance < 0.04 ? 0.07 : style.shadowDistance,
                })
              }
            >
              {style.echo ? 'Echo on' : 'Echo off'}
            </Chip>
            <Chip
              active={style.background}
              onClick={() =>
                patch({
                  background: !style.background,
                  backgroundColor: style.background ? style.backgroundColor : contrastPlate(style.fill),
                })
              }
            >
              {style.background ? 'Plate on' : 'Plate off'}
            </Chip>
          </div>
          <Slider
            label="Depth"
            min={0}
            max={12}
            value={style.block}
            onChange={(value) => patch({ block: value })}
          />
          <Slider
            label="Blur"
            min={0}
            max={40}
            value={Math.round(style.shadowBlur * 100)}
            onChange={(value) => patch({ shadowBlur: value / 100 })}
          />
          <Slider
            label="Distance"
            min={0}
            max={24}
            value={Math.round(style.shadowDistance * 100)}
            onChange={(value) => patch({ shadowDistance: value / 100 })}
          />
          <Slider
            label="Angle"
            min={0}
            max={360}
            value={style.shadowAngle}
            onChange={(value) => patch({ shadowAngle: value })}
          />
          <Slider
            label="Shadow opacity"
            min={0}
            max={100}
            value={Math.round(style.shadowOpacity * 100)}
            onChange={(value) => patch({ shadowOpacity: value / 100 })}
          />
          <ColorRow label="Shadow" value={style.shadowColor} onChange={(shadowColor) => patch({ shadowColor })} />
          {style.background ? (
            <>
              <ColorRow
                label="Plate"
                value={style.backgroundColor}
                onChange={(backgroundColor) => patch({ backgroundColor })}
              />
              <Slider
                label="Plate opacity"
                min={10}
                max={100}
                value={Math.round(style.backgroundOpacity * 100)}
                onChange={(value) => patch({ backgroundOpacity: value / 100 })}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {error && <p className="text-[11px] text-amber-300">{error}</p>}

      <button
        type="button"
        onClick={() => void addText()}
        disabled={busy || text.trim().length === 0}
        className="sticky bottom-0 w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black disabled:bg-white/15 disabled:text-white/40"
      >
        {busy ? 'Adding…' : 'Add text to design'}
      </button>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

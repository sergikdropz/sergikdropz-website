'use client'

import { useMemo, useRef, useState } from 'react'

const FONTS = [
  { label: 'Six Caps', stack: '"Six Caps", Impact, sans-serif' },
  { label: 'Impact', stack: 'Impact, "Arial Black", sans-serif' },
  { label: 'Sans', stack: 'Helvetica, Arial, sans-serif' },
  { label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', stack: '"Courier New", monospace' },
]

const COLORS = ['#ffffff', '#000000', '#ff2d55', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2']

const RENDER_FONT_PX = 240 // bake large; the stage scales it down crisply

export default function MerchTextDesigner({
  onArtCreated,
}: {
  /** Called with the stored art URL so the room can refresh the library and place it. */
  onArtCreated: (url: string) => void
}) {
  const [text, setText] = useState('')
  const [fontStack, setFontStack] = useState(FONTS[0].stack)
  const [fill, setFill] = useState('#ffffff')
  const [outline, setOutline] = useState(false)
  const [outlineColor, setOutlineColor] = useState('#000000')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const lines = useMemo(() => text.split('\n'), [text])

  function render(): HTMLCanvasElement | null {
    const canvas = canvasRef.current ?? document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const font = `700 ${RENDER_FONT_PX}px ${fontStack}`
    ctx.font = font
    const pad = RENDER_FONT_PX * 0.3
    const lineHeight = RENDER_FONT_PX * 1.15
    const widths = lines.map((line) => ctx.measureText(line || ' ').width)
    const width = Math.ceil(Math.max(1, ...widths) + pad * 2)
    const height = Math.ceil(lineHeight * lines.length + pad * 2)
    canvas.width = width
    canvas.height = height

    ctx.clearRect(0, 0, width, height)
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    const cx = width / 2
    lines.forEach((line, i) => {
      const y = pad + lineHeight * (i + 0.5)
      if (outline) {
        ctx.strokeStyle = outlineColor
        ctx.lineWidth = RENDER_FONT_PX * 0.08
        ctx.strokeText(line, cx, y)
      }
      ctx.fillStyle = fill
      ctx.fillText(line, cx, y)
    })
    return canvas
  }

  async function addText() {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      // Make sure custom fonts are loaded before measuring/painting.
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try {
          await (document as Document).fonts.load(`700 ${RENDER_FONT_PX}px ${fontStack}`)
        } catch {
          /* fall back to whatever is available */
        }
      }
      const canvas = render()
      if (!canvas) throw new Error('Could not render text')
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
          Type it, style it, place it. Rendered as crisp transparent art you can drag and scale.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        placeholder="SERGIK"
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 p-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
      />

      {/* Live preview */}
      <div className="flex min-h-[64px] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[conic-gradient(#222_25%,#333_0_50%,#222_0_75%,#333_0)] bg-[length:16px_16px] p-2">
        <span
          className="max-w-full truncate text-center leading-tight"
          style={{
            fontFamily: fontStack,
            fontWeight: 700,
            color: fill,
            fontSize: 28,
            WebkitTextStroke: outline ? `1px ${outlineColor}` : undefined,
          }}
        >
          {text || 'Preview'}
        </span>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Font</p>
        <div className="flex flex-wrap gap-1.5">
          {FONTS.map((font) => (
            <button
              key={font.label}
              type="button"
              onClick={() => setFontStack(font.stack)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                fontStack === font.stack ? 'bg-white text-black' : 'bg-white/10 text-white/75 hover:bg-white/15'
              }`}
              style={{ fontFamily: font.stack }}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Color</p>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => setFill(color)}
              className={`h-7 w-7 rounded-full border ${
                fill === color ? 'border-white ring-2 ring-white/50' : 'border-white/20'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between text-sm">
        <span>Outline</span>
        <input type="checkbox" checked={outline} onChange={(event) => setOutline(event.target.checked)} />
      </label>
      {outline && (
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((color) => (
            <button
              key={`outline-${color}`}
              type="button"
              onClick={() => setOutlineColor(color)}
              className={`h-6 w-6 rounded-full border ${
                outlineColor === color ? 'border-white ring-2 ring-white/50' : 'border-white/20'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-amber-300">{error}</p>}

      <button
        type="button"
        onClick={() => void addText()}
        disabled={busy || text.trim().length === 0}
        className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black disabled:bg-white/15 disabled:text-white/40"
      >
        {busy ? 'Adding…' : 'Add text to design'}
      </button>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

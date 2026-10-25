'use client'

import { useState } from 'react'
import { printfulProductUrl } from '@/lib/merch/catalog-studio'

const PROMPT_IDEAS = [
  'Bold graffiti wildstyle "SERGIK" lettering, chrome fill, drip shadow',
  'Retro 80s synthwave sun and grid, neon magenta and cyan',
  'Minimal line-art skull wearing headphones, single weight stroke',
  'Vintage rave smiley with melting edges, acid house yellow',
]

type GenerateResult = { id: string; url: string; prompt: string; model: string }

export default function MerchAiArtPanel({
  productId,
  onArtCreated,
  onRemoveBackground,
}: {
  productId: number
  /** Called with the stored art URL so the room can refresh the library and drop it on the stage. */
  onArtCreated: (url: string) => void
  /** Optional: lift the background off a just-generated piece. */
  onRemoveBackground?: (url: string) => void | Promise<void>
}) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [strippingBg, setStrippingBg] = useState(false)

  async function generate() {
    const trimmed = prompt.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    setHint(null)
    try {
      const res = await fetch('/api/admin/merch/art/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Generation failed')
        if (data.hint) setHint(data.hint)
        return
      }
      setResult({ id: data.id, url: data.url, prompt: trimmed, model: data.model })
      onArtCreated(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function stripBackground() {
    if (!result || !onRemoveBackground || strippingBg) return
    setStrippingBg(true)
    try {
      await onRemoveBackground(result.url)
    } finally {
      setStrippingBg(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">AI Art</p>
        <p className="text-[11px] leading-relaxed text-white/55">
          Describe it. We generate print-ready art on a clean background and drop it on the garment.
        </p>
      </div>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void generate()
        }}
        rows={4}
        maxLength={2000}
        placeholder="e.g. bold graffiti SERGIK lettering with a chrome drip…"
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 p-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
      />

      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || prompt.trim().length === 0}
        className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black disabled:bg-white/15 disabled:text-white/40"
      >
        {busy ? 'Generating…' : 'Generate art'}
      </button>

      {!result && !busy && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Try</p>
          <div className="flex flex-col gap-1">
            {PROMPT_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setPrompt(idea)}
                className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-left text-[11px] text-white/70 hover:border-white/25 hover:text-white"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-[11px] text-amber-200">
          <p>{error}</p>
          {hint && <p className="text-amber-200/80">{hint}</p>}
          {hint && (
            <a
              href={printfulProductUrl(productId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block underline-offset-2 hover:underline"
            >
              Or design this product in Printful →
            </a>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
          <div className="overflow-hidden rounded-md bg-[conic-gradient(#222_25%,#333_0_50%,#222_0_75%,#333_0)] bg-[length:16px_16px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.url} alt={result.prompt} className="mx-auto max-h-40 w-auto object-contain" />
          </div>
          <p className="truncate text-[11px] text-white/55">Placed on the active area · {result.model}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onArtCreated(result.url)}
              className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs hover:bg-white/10"
            >
              Place again
            </button>
            {onRemoveBackground && (
              <button
                type="button"
                onClick={() => void stripBackground()}
                disabled={strippingBg}
                className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs hover:bg-white/10 disabled:text-white/35"
              >
                {strippingBg ? 'Removing…' : 'Remove background'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { FaDownload, FaSpinner } from 'react-icons/fa'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  PROMO_CARD_FORMATS,
  PROMO_CARD_LAYOUTS,
  PROMO_CARD_MODES,
  defaultPromoCardMode,
  promoCardFormatLabel,
  promoCardModeLabel,
  promoComingDateLabel,
  type PromoCardFormat,
  type PromoCardLayoutId,
  type PromoCardMode,
} from '@/lib/studio/promo-cards'
import {
  downloadPromoCard,
  loadPromoCardArtwork,
  renderPromoCardPreviewUrl,
} from '@/lib/studio/promo-card-render'
import { sampleArtworkAccent, sampleArtworkGradient } from '@/lib/studio/story-look-paint'

type CardAccent = 'none' | 'artwork' | 'gradient' | 'custom' | 'dual'

type Props = {
  artworkUrl?: string | null
  title: string
  artist?: string | null
  streetDate?: string | null
}

export default function PromoCardsGallery({ artworkUrl, title, artist, streetDate }: Props) {
  const { showNotification } = useNotifications()
  const [mode, setMode] = useState<PromoCardMode>(() => defaultPromoCardMode(streetDate))
  const [format, setFormat] = useState<PromoCardFormat>('square')
  const [comingDate, setComingDate] = useState('')
  const [accentKind, setAccentKind] = useState<CardAccent>('none')
  const [customHex, setCustomHex] = useState('#a78bfa')
  const [dualStart, setDualStart] = useState('#a78bfa')
  const [dualEnd, setDualEnd] = useState('#22d3ee')
  const [artworkHex, setArtworkHex] = useState<string | null>(null)
  const [artworkGradient, setArtworkGradient] = useState<{ start: string; end: string } | null>(null)
  const [previews, setPreviews] = useState<Partial<Record<PromoCardLayoutId, string>>>({})
  const [rendering, setRendering] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const previewsRef = useRef(previews)
  const comingDateInputRef = useRef<HTMLInputElement>(null)
  const comingDateTouched = useRef(false)
  previewsRef.current = previews

  useEffect(() => {
    setMode(defaultPromoCardMode(streetDate))
  }, [streetDate])

  useEffect(() => {
    if (comingDateTouched.current) return
    const raw = String(streetDate || '').trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) setComingDate(raw)
  }, [streetDate])

  const accent = cardAccent({ accentKind, artworkHex, artworkGradient, customHex, dualStart, dualEnd })

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    setRendering(true)
    async function paint() {
      const artwork = await loadPromoCardArtwork(artworkUrl)
      if (cancelled) return
      const sampled = artwork ? sampleArtworkAccent(artwork) : null
      const gradient = artwork ? sampleArtworkGradient(artwork) : null
      if (sampled) setArtworkHex(sampled)
      if (gradient) {
        setArtworkGradient((prev) =>
          prev?.start === gradient.start && prev?.end === gradient.end ? prev : gradient
        )
      }
      const next: Partial<Record<PromoCardLayoutId, string>> = {}
      for (const layout of PROMO_CARD_LAYOUTS) {
        const url = await renderPromoCardPreviewUrl({
          layout: layout.id,
          format,
          mode,
          artwork,
          title,
          artist: artist || 'SERGIK',
          comingDate: mode === 'coming' ? comingDate : null,
          ...cardAccent({
            accentKind,
            artworkHex: sampled || artworkHex,
            artworkGradient: gradient || artworkGradient,
            customHex,
            dualStart,
            dualEnd,
          }),
        })
        created.push(url)
        next[layout.id] = url
        if (cancelled) break
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url))
        return
      }
      setPreviews((prev) => {
        Object.values(prev).forEach((url) => {
          if (url) URL.revokeObjectURL(url)
        })
        return next
      })
      setRendering(false)
    }
    void paint().catch(() => {
      if (!cancelled) setRendering(false)
    })
    return () => {
      cancelled = true
    }
  }, [accentKind, artist, comingDate, customHex, dualEnd, dualStart, format, mode, title, artworkUrl])

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
    }
  }, [])

  async function downloadOne(layout: PromoCardLayoutId, label: string) {
    setBusy(layout)
    try {
      await downloadPromoCard({
        layout,
        format,
        mode,
        artworkUrl,
        title,
        artist: artist || 'SERGIK',
        comingDate: mode === 'coming' ? comingDate : null,
        ...accent,
      })
      showNotification(`${label} card downloaded`, 'success')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Download failed'
      showNotification(message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className="mb-5 rounded-xl border border-zinc-800 bg-black/40 p-4"
      data-testid="promo-cards"
    >
      <div className="mb-4 flex flex-col items-center gap-3 text-center">
        <div>
          <h5 className="text-sm font-semibold text-white">Promo cards</h5>
          <p className="mx-auto mt-1 max-w-xl text-xs text-zinc-500">
            Pick a design and post it. Cover, title, streaming logos, and sergikdropz.com are already
            on the image.
          </p>
        </div>
        <Segment
          value={format}
          options={PROMO_CARD_FORMATS.map((id) => ({ id, label: promoCardFormatLabel(id) }))}
          onChange={setFormat}
        />
        <div className="inline-flex rounded-lg border border-zinc-700 p-0.5" data-testid="promo-card-mode">
            {PROMO_CARD_MODES.map((id) => {
              const active = mode === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                    active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
                  }`}
                  aria-pressed={active}
                >
                  {promoCardModeLabel(id)}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setMode('coming')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                mode === 'coming' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
              aria-pressed={mode === 'coming'}
              data-testid="promo-card-mode-coming"
            >
              Coming soon
            </button>
            <button
              type="button"
              aria-label="Coming soon date"
              data-testid="promo-card-coming-date"
              onClick={() => {
                setMode('coming')
                const input = comingDateInputRef.current
                if (!input) return
                if (typeof input.showPicker === 'function') input.showPicker()
                else input.click()
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                mode === 'coming' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {promoComingDateLabel(comingDate) || 'Date'}
            </button>
            <input
              ref={comingDateInputRef}
              type="date"
              tabIndex={-1}
              aria-hidden
              value={comingDate}
              onChange={(event) => {
                comingDateTouched.current = true
                setComingDate(event.target.value)
                setMode('coming')
              }}
              className="sr-only"
            />
          </div>
          <div className="w-full">
          <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Accent</p>
          <div className="flex flex-wrap items-center justify-center gap-2" data-testid="promo-card-accent">
            <button
              type="button"
              title="Album artwork"
              aria-label="Album artwork accent"
              aria-pressed={accentKind === 'artwork'}
              onClick={() => setAccentKind('artwork')}
              className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${
                accentKind === 'artwork' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
              }`}
            >
              <span
                className="h-6 w-6 rounded-full border border-white/20"
                style={{
                  background: artworkHex
                    ? artworkHex
                    : 'conic-gradient(#fbbf24, #fb7185, #22d3ee, #a78bfa, #fbbf24)',
                }}
              />
              Artwork
            </button>
            <button
              type="button"
              title="Artwork gradient"
              aria-label="Artwork gradient"
              aria-pressed={accentKind === 'gradient'}
              data-testid="promo-card-accent-gradient"
              onClick={() => setAccentKind('gradient')}
              className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${
                accentKind === 'gradient' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
              }`}
            >
              <span
                className="h-6 w-6 rounded-full border border-white/20"
                style={{
                  background: artworkGradient
                    ? `linear-gradient(90deg, ${artworkGradient.start}, ${artworkGradient.end})`
                    : 'linear-gradient(90deg, #fbbf24, #22d3ee)',
                }}
              />
              Artwork gradient
            </button>
            <label
              className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${
                accentKind === 'custom' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
              }`}
            >
              <input
                type="color"
                aria-label="Custom accent"
                value={customHex}
                onChange={(event) => {
                  setCustomHex(event.target.value)
                  setAccentKind('custom')
                }}
                className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
              Custom color
            </label>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
                accentKind === 'dual' ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
              }`}
            >
              <input
                type="color"
                aria-label="Dual tone start"
                value={dualStart}
                onChange={(event) => {
                  setDualStart(event.target.value)
                  setAccentKind('dual')
                }}
                className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
              <button
                type="button"
                aria-label="Dual tone"
                aria-pressed={accentKind === 'dual'}
                onClick={() => setAccentKind('dual')}
                className="h-6 w-10 rounded-full border border-white/20"
                style={{ background: `linear-gradient(90deg, ${dualStart}, ${dualEnd})` }}
              />
              <input
                type="color"
                aria-label="Dual tone end"
                value={dualEnd}
                onChange={(event) => {
                  setDualEnd(event.target.value)
                  setAccentKind('dual')
                }}
                className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
              Dual tone
            </div>
          </div>
          </div>
      </div>

      <div
        className={`grid gap-3 ${format === 'story' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}
      >
        {PROMO_CARD_LAYOUTS.map((layout) => {
          const src = previews[layout.id]
          return (
            <button
              key={layout.id}
              type="button"
              disabled={Boolean(busy) || !src}
              onClick={() => void downloadOne(layout.id, layout.label)}
              className="group text-left disabled:opacity-60"
              aria-label={`Download ${layout.label} promo card`}
            >
              <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="block w-full h-auto" />
                ) : (
                  <div
                    className={`animate-pulse bg-zinc-800 ${format === 'story' ? 'aspect-[9/16]' : 'aspect-square'}`}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-950">
                    {busy === layout.id ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                    Download
                  </span>
                </div>
              </div>
              <span className="mt-1.5 block text-[11px] text-zinc-400">{layout.label}</span>
            </button>
          )
        })}
      </div>
      {rendering && Object.keys(previews).length === 0 ? (
        <p className="sr-only">Rendering promo cards</p>
      ) : null}
    </section>
  )
}

function cardAccent(input: {
  accentKind: CardAccent
  artworkHex: string | null
  artworkGradient: { start: string; end: string } | null
  customHex: string
  dualStart: string
  dualEnd: string
}): { accent?: string; accent2?: string } {
  if (input.accentKind === 'artwork' && input.artworkHex) return { accent: input.artworkHex }
  if (input.accentKind === 'gradient' && input.artworkGradient) {
    return { accent: input.artworkGradient.start, accent2: input.artworkGradient.end }
  }
  if (input.accentKind === 'custom') return { accent: input.customHex }
  if (input.accentKind === 'dual') return { accent: input.dualStart, accent2: input.dualEnd }
  return {}
}

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (next: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-700 p-0.5">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
              active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
            }`}
            aria-pressed={active}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

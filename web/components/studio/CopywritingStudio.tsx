'use client'

import { useMemo, useState } from 'react'
import AiField from '@/components/AiField'
import { COPY_TEMPLATES, type MarketingCopy } from '@/lib/studio/constants'
import {
  catalogCopyFacts,
  dnaCopyInputFromCatalog,
  marketingCopyFromDna,
  releaseDescriptionFromCatalog,
  type CatalogCopySourceTrack,
} from '@/lib/studio/vault-import'
import {
  FaBrain,
  FaCheck,
  FaCopy,
  FaEraser,
  FaMagic,
  FaPen,
  FaWaveSquare,
} from 'react-icons/fa'

type Props = {
  title: string
  type?: string | null
  genre?: string | null
  subgenre?: string | null
  description?: string | null
  releaseId?: string
  albumArtist?: string | null
  labelName?: string | null
  language?: string | null
  streetDate?: string | null
  year?: number | null
  artworkDesigner?: string | null
  artworkPhotographer?: string | null
  artworkIllustrator?: string | null
  tracks?: CatalogCopySourceTrack[]
  copy: MarketingCopy
  onChange: (copy: MarketingCopy) => void
  onDescriptionDraft?: (description: string) => void
  onSave: () => void
  saving?: boolean
}

const FIELD_ORDER = Object.keys(COPY_TEMPLATES) as (keyof MarketingCopy)[]

function fieldStatus(value: string | undefined, softMax?: number, hardMax?: number) {
  const text = (value || '').trim()
  const chars = text.length
  if (!chars) return { label: 'Empty', tone: 'empty' as const, chars }
  if (hardMax && chars > hardMax) return { label: 'Over limit', tone: 'over' as const, chars }
  if (softMax && chars > softMax) return { label: 'Long', tone: 'warn' as const, chars }
  if (chars < 12) return { label: 'Stub', tone: 'stub' as const, chars }
  return { label: 'Ready', tone: 'ready' as const, chars }
}

function toneClass(tone: 'empty' | 'stub' | 'ready' | 'warn' | 'over') {
  switch (tone) {
    case 'ready':
      return 'text-emerald-300'
    case 'warn':
      return 'text-amber-300'
    case 'over':
      return 'text-rose-300'
    case 'stub':
      return 'text-sky-300'
    default:
      return 'text-zinc-500'
  }
}

function meterClass(tone: 'empty' | 'stub' | 'ready' | 'warn' | 'over') {
  switch (tone) {
    case 'ready':
      return 'bg-emerald-500'
    case 'warn':
      return 'bg-amber-500'
    case 'over':
      return 'bg-rose-500'
    case 'stub':
      return 'bg-sky-500'
    default:
      return 'bg-zinc-700'
  }
}

export default function CopywritingStudio({
  title,
  type,
  genre,
  subgenre,
  description,
  releaseId,
  albumArtist,
  labelName,
  language,
  streetDate,
  year,
  artworkDesigner,
  artworkPhotographer,
  artworkIllustrator,
  tracks = [],
  copy,
  onChange,
  onDescriptionDraft,
  onSave,
  saving,
}: Props) {
  const [activeField, setActiveField] = useState<keyof MarketingCopy>('elevator_pitch')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true)
  const [refining, setRefining] = useState(false)

  const catalogInput = useMemo(
    () =>
      dnaCopyInputFromCatalog({
        title,
        type,
        genre,
        subgenre,
        description,
        artist: albumArtist,
        label: labelName,
        language,
        streetDate,
        year,
        tracks,
        artwork_designer: artworkDesigner,
        artwork_photographer: artworkPhotographer,
        artwork_illustrator: artworkIllustrator,
      }),
    [
      title,
      type,
      genre,
      subgenre,
      description,
      albumArtist,
      labelName,
      language,
      streetDate,
      year,
      tracks,
      artworkDesigner,
      artworkPhotographer,
      artworkIllustrator,
    ],
  )
  const facts = useMemo(() => catalogCopyFacts(catalogInput), [catalogInput])
  const generated = useMemo(() => marketingCopyFromDna(catalogInput), [catalogInput])

  const filledCount = FIELD_ORDER.filter((key) => (copy[key] || '').trim().length > 10).length
  const meta = COPY_TEMPLATES[activeField]
  const activeValue = copy[activeField] || ''
  const status = fieldStatus(activeValue, meta.softMax, meta.hardMax)
  const limit = meta.hardMax || meta.softMax || 0
  const meterPct = limit ? Math.min(100, Math.round((status.chars / limit) * 100)) : 0

  const sourceLine = facts.trackCount
    ? [
        `${facts.trackCount} track${facts.trackCount === 1 ? '' : 's'}`,
        facts.mood,
        facts.tempo,
        facts.keys,
        `${facts.pressNotes} press note${facts.pressNotes === 1 ? '' : 's'}`,
        'metadata + Sonic DNA',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Add tracks in Catalog to draft from metadata, Sonic DNA, press notes, and credits.'

  function updateField(key: keyof MarketingCopy, value: string) {
    const next = meta.hardMax && key === activeField ? value.slice(0, meta.hardMax) : value
    onChange({ ...copy, [key]: next })
  }

  function applyGenerated(partial: Partial<MarketingCopy>, emptyOnly: boolean) {
    const next = { ...copy }
    for (const key of FIELD_ORDER) {
      const value = partial[key]
      if (!value) continue
      if (emptyOnly && (next[key] || '').trim()) continue
      next[key] = value
    }
    onChange(next)
  }

  function fillFromCatalog() {
    setDraftError(null)
    if (!facts.trackCount) {
      setDraftError(
        'Add tracks in Catalog first — copy is drafted from metadata, Sonic DNA, press notes, and credits.',
      )
      return
    }
    applyGenerated(generated, fillEmptyOnly)
    const blurb = releaseDescriptionFromCatalog(catalogInput)
    if (blurb) onDescriptionDraft?.(blurb)
  }

  function fillActiveFromCatalog() {
    setDraftError(null)
    if (!facts.trackCount) {
      setDraftError('Add tracks in Catalog first.')
      return
    }
    const value = generated[activeField]
    if (!value) {
      setDraftError(`No catalog draft for ${meta.label.toLowerCase()} yet.`)
      return
    }
    updateField(activeField, value)
  }

  async function refineActiveField() {
    if (!releaseId) return
    setDraftError(null)
    setRefining(true)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/refine-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: activeField,
          draft: copy[activeField] || '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Refine failed')
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      if (!text) throw new Error('No refined copy returned')
      updateField(activeField, text)
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : 'Refine failed')
    } finally {
      setRefining(false)
    }
  }

  async function refineAllFields() {
    if (!releaseId) return
    setDraftError(null)
    setRefining(true)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/refine-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all: true,
          drafts: copy,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Refine failed')
      const next = data.copy && typeof data.copy === 'object' ? (data.copy as MarketingCopy) : null
      if (!next) throw new Error('No refined copy returned')
      applyGenerated(next, false)
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : 'Refine failed')
    } finally {
      setRefining(false)
    }
  }

  async function copyActive() {
    const text = copy[activeField] || ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  function clearActive() {
    if (!activeValue.trim()) return
    if (!confirm(`Clear ${meta.label.toLowerCase()}?`)) return
    updateField(activeField, '')
  }

  const preview =
    activeField === 'spotify_pitch'
      ? activeValue.slice(0, 500)
      : activeField === 'social_caption'
        ? activeValue.split('\n')[0]?.slice(0, 140) || ''
        : activeField === 'elevator_pitch'
          ? activeValue.slice(0, 160)
          : ''

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
      data-ai-scope={JSON.stringify({
        entityType: 'distribution_release',
        entityId: releaseId,
        entityLabel: title,
        formId: 'release_marketing_copy',
      })}
    >
      <div className="p-5 border-b border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FaPen className="text-violet-400 shrink-0" />
              <h3 className="text-lg font-semibold text-white">Copywriting studio</h3>
              <span className="text-[11px] text-zinc-500">
                {filledCount}/{FIELD_ORDER.length} ready
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{sourceLine}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 px-2">
              <input
                type="checkbox"
                checked={fillEmptyOnly}
                onChange={(e) => setFillEmptyOnly(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-violet-600"
              />
              Keep filled fields
            </label>
            <button
              type="button"
              onClick={fillFromCatalog}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/10 transition"
            >
              <FaWaveSquare />
              Draft from catalog
            </button>
            {releaseId ? (
              <button
                type="button"
                onClick={() => void refineAllFields()}
                disabled={refining}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-violet-500/50 text-violet-100 hover:bg-violet-500/15 transition disabled:opacity-50"
              >
                <FaBrain />
                {refining ? 'Refining…' : 'Refine all with AI'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="text-xs px-4 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row min-h-[320px]">
        <div className="md:w-56 border-b md:border-b-0 md:border-r border-zinc-800 p-2 flex md:flex-col gap-1 overflow-x-auto">
          {FIELD_ORDER.map((key) => {
            const item = COPY_TEMPLATES[key]
            const itemStatus = fieldStatus(copy[key], item.softMax, item.hardMax)
            const selected = activeField === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveField(key)}
                className={`text-left px-3 py-2.5 rounded-lg text-xs transition ${
                  selected
                    ? 'bg-violet-600/20 text-violet-100 ring-1 ring-violet-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[12px]">{item.label}</span>
                  <span className={`text-[10px] ${toneClass(itemStatus.tone)}`}>
                    {itemStatus.tone === 'ready' ? <FaCheck className="inline text-[9px]" /> : itemStatus.chars || '—'}
                  </span>
                </span>
                <span className="mt-0.5 block text-[10px] text-zinc-600 truncate">{item.channel}</span>
              </button>
            )
          })}
        </div>

        <div className="flex-1 p-5 space-y-4">
          {draftError ? <p className="text-xs text-amber-400">{draftError}</p> : null}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">{meta.channel}</p>
              <h4 className="text-base font-semibold text-white mt-0.5">{meta.label}</h4>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-2xl">
                {meta.hint} Refine uses Metadata description + Catalog press notes for a tight
                professional structure.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={fillActiveFromCatalog}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <FaMagic className="text-[10px]" />
                Draft this
              </button>
              {releaseId ? (
                <button
                  type="button"
                  onClick={() => void refineActiveField()}
                  disabled={refining}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 disabled:opacity-50"
                >
                  <FaBrain className="text-[10px]" />
                  {refining ? 'Refining…' : 'Refine this'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void copyActive()}
                disabled={!activeValue.trim()}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                <FaCopy className="text-[10px]" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={clearActive}
                disabled={!activeValue.trim()}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
              >
                <FaEraser className="text-[10px]" />
                Clear
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-[11px] text-zinc-400 leading-relaxed">
            {meta.tip}
          </div>

          {limit ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className={toneClass(status.tone)}>
                  {status.chars}
                  {meta.hardMax ? ` / ${meta.hardMax}` : meta.softMax ? ` · aim under ${meta.softMax}` : ''}
                  {' · '}
                  {status.label}
                </span>
                {meta.hardMax ? (
                  <span className="text-zinc-600">Spotify hard cap</span>
                ) : (
                  <span className="text-zinc-600">Soft target</span>
                )}
              </div>
              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all ${meterClass(status.tone)}`}
                  style={{ width: `${meterPct}%` }}
                />
              </div>
            </div>
          ) : null}

          <AiField
            as="textarea"
            fieldKey={`release.marketing_copy.${activeField}`}
            label={meta.label}
            entityType="distribution_release"
            entityId={releaseId}
            entityLabel={title}
            formId="release_marketing_copy"
            hint={meta.hint}
            value={activeValue}
            onChange={(e) => updateField(activeField, e.target.value)}
            placeholder={meta.placeholder}
            rows={meta.rows}
            maxLength={meta.hardMax}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-y min-h-[180px] leading-relaxed"
          />

          {preview ? (
            <div className="rounded-lg border border-zinc-800 bg-black/40 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">
                {activeField === 'spotify_pitch'
                  ? 'Editorial paste preview'
                  : activeField === 'social_caption'
                    ? 'First-line feed preview'
                    : 'SEO / card preview'}
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{preview || '—'}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

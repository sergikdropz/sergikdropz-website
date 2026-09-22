'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import AiField from '@/components/AiField'
import { generateInternalUpc } from '@/lib/studio/upc'
import { generateCatalogNumber, formatCopyrightNotice, formatPhonogramNotice, TRACK_LANGUAGES } from '@/lib/studio/dsp-package'
import {
  DSP_PRIMARY_GENRES,
  isDspPrimaryGenre,
  mapSonicGenreToDsp,
  secondaryGenresFor,
  streetDateHint,
} from '@/lib/studio/dsp-ingest'
import { FaImage, FaSpinner, FaMagic } from 'react-icons/fa'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import {
  dnaCopyInputFromCatalog,
  releaseDescriptionFromCatalog,
  type CatalogCopySourceTrack,
} from '@/lib/studio/vault-import'
import VaultImportPanel from './VaultImportPanel'
import type { RightsActionFocus } from '@/lib/studio/rights-action-target'

export type MetadataForm = {
  title: string
  type: string
  release_date: string
  original_release_date: string
  genre: string
  subgenre: string
  description: string
  explicit: boolean
  upc: string
  album_artist: string
  label_name: string
  catalog_number: string
  p_line_year: string
  c_line_year: string
  language: string
  previously_released: '' | 'no' | 'yes'
  previous_isrc: string
  previous_upc: string
  artwork_owned: boolean
  artwork_designer: string
  artwork_photographer: string
  artwork_illustrator: string
}

type Props = {
  releaseId: string
  artworkUrl: string | null
  form: MetadataForm
  onFormChange: (form: MetadataForm) => void
  onSave: () => Promise<void> | void
  onArtworkUploaded: (url: string) => Promise<void> | void
  /** Called after vault import fills this release — parent should reload. */
  onVaultImported?: () => void
  tracks?: CatalogCopySourceTrack[]
  saving?: boolean
  focusRequest?: RightsActionFocus | null
  onFocusHandled?: () => void
}

const MIN_EDGE = 1400
const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-violet-500'

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight
      URL.revokeObjectURL(url)
      resolve({ width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image dimensions'))
    }
    img.src = url
  })
}

export default function MetadataPanel({
  releaseId,
  artworkUrl,
  form,
  onFormChange,
  onSave,
  onArtworkUploaded,
  onVaultImported,
  tracks = [],
  saving,
  focusRequest = null,
  onFocusHandled,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [qaNote, setQaNote] = useState<string | null>(null)
  const autoJourney = useRef(false)
  const dspGenreMap = mapSonicGenreToDsp(form.genre, form.subgenre)

  useEffect(() => {
    if (!focusRequest || focusRequest.step !== 'metadata') return
    const map: Record<string, string> = {
      genre: 'genre',
      street_date: 'street-date',
      previously_released: 'previously-released',
      upc: 'upc',
      artwork: 'artwork',
    }
    const key = map[focusRequest.section]
    const el = key
      ? (document.querySelector(`[data-metadata-section="${key}"]`) as HTMLElement | null)
      : null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const input = el?.querySelector('input, select, textarea') as HTMLElement | null
    input?.focus?.({ preventScroll: true })
    onFocusHandled?.()
  }, [focusRequest, onFocusHandled])

  function setField<K extends keyof MetadataForm>(key: K, value: MetadataForm[K]) {
    onFormChange({ ...form, [key]: value })
  }

  function writeListeningJourney() {
    return releaseDescriptionFromCatalog(
      dnaCopyInputFromCatalog({
        title: form.title,
        type: form.type,
        genre: form.genre,
        subgenre: form.subgenre,
        artist: form.album_artist || form.label_name,
        tracks,
        artwork_designer: form.artwork_designer,
        artwork_photographer: form.artwork_photographer,
        artwork_illustrator: form.artwork_illustrator,
      }),
    )
  }

  useEffect(() => {
    if (autoJourney.current || form.description.trim() || tracks.length < 2) return
    const journey = writeListeningJourney()
    if (!journey) return
    autoJourney.current = true
    onFormChange({ ...form, description: journey })
    // Only seed an empty DSP blurb once from catalog DNA + press notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, form.description])

  async function handleArtwork(file: File) {
    setUploading(true)
    setQaNote(null)
    try {
      try {
        const { width, height } = await readImageDimensions(file)
        const notes: string[] = []
        if (width !== height) notes.push(`Not square (${width}×${height})`)
        if (width < MIN_EDGE || height < MIN_EDGE) {
          notes.push(`Below ${MIN_EDGE}px — DSPs prefer 3000×3000`)
        } else if (width < 3000 || height < 3000) {
          notes.push(`${width}×${height} — 3000×3000 recommended`)
        } else {
          notes.push(`${width}×${height} ✓`)
        }
        setQaNote(notes.join(' · '))
      } catch {
        setQaNote('Uploaded — dimension check skipped')
      }

      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/studio/upload/artwork', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }
      const data = await res.json()
      await onArtworkUploaded(data.url)
    } catch (e: unknown) {
      setQaNote(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
      data-ai-scope={JSON.stringify({
        entityType: 'distribution_release',
        entityId: releaseId,
        formId: 'release_metadata',
      })}
    >
      <div className="p-5 border-b border-zinc-800">
        <h3 className="text-lg font-semibold text-white">Metadata & artwork</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Cover, DSP genre, dates, and UPC — required before a clean go-live.
        </p>
      </div>

      {onVaultImported && (
        <div className="px-5 pt-5">
          <VaultImportPanel
            releaseId={releaseId}
            compact
            onImported={() => onVaultImported()}
          />
        </div>
      )}

      <div className="p-5 grid lg:grid-cols-[200px_1fr] gap-8">
        <div data-metadata-section="artwork">
          <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
            {artworkUrl ? (
              <Image
                src={artworkUrl}
                alt=""
                fill
                className="object-cover"
                sizes="200px"
                unoptimized={shouldUnoptimizeImage(artworkUrl)}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
                <FaImage className="text-2xl" />
                <span className="text-xs">No artwork</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleArtwork(file)
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-200 disabled:opacity-50"
          >
            {uploading ? <FaSpinner className="animate-spin" /> : <FaImage />}
            {uploading ? 'Uploading…' : artworkUrl ? 'Replace artwork' : 'Upload artwork'}
          </button>
          {qaNote && <p className="mt-2 text-xs text-zinc-500 leading-relaxed">{qaNote}</p>}
          <p className="mt-3 text-[11px] text-zinc-600 leading-relaxed">
            Stores reject covers with URLs, @handles, store logos, prices, pixelation, or art you
            do not own. Do not reuse the same artwork on multiple albums. 3000×3000 square JPG is
            the recommendation.
          </p>
          <label className="mt-3 inline-flex items-start gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={form.artwork_owned}
              onChange={(e) => setField('artwork_owned', e.target.checked)}
              className="mt-0.5 rounded border-zinc-600"
            />
            I own this artwork and it has no URLs, @handles, store logos, or prices.
          </label>

          <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
            <div>
              <p className="text-xs font-medium text-zinc-300">Artwork credits</p>
              <p className="mt-0.5 text-[11px] text-zinc-600 leading-relaxed">
                Credit cover artists separately from catalog track credits.
              </p>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Designer</label>
              <input
                value={form.artwork_designer}
                onChange={(e) => setField('artwork_designer', e.target.value)}
                placeholder="Cover design"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Photographer</label>
              <input
                value={form.artwork_photographer}
                onChange={(e) => setField('artwork_photographer', e.target.value)}
                placeholder="Photography"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Illustrator</label>
              <input
                value={form.artwork_illustrator}
                onChange={(e) => setField('artwork_illustrator', e.target.value)}
                placeholder="Illustration"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            {(form.artwork_designer.trim() ||
              form.artwork_photographer.trim() ||
              form.artwork_illustrator.trim()) && (
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {[
                  form.artwork_designer.trim() && `Design: ${form.artwork_designer.trim()}`,
                  form.artwork_photographer.trim() && `Photo: ${form.artwork_photographer.trim()}`,
                  form.artwork_illustrator.trim() && `Art: ${form.artwork_illustrator.trim()}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs text-zinc-500 block mb-1">Title</label>
              <AiField
                fieldKey="title"
                label="Title"
                entityType="distribution_release"
                entityId={releaseId}
                formId="release_metadata"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setField('type', e.target.value)}
                className={inputClass}
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
              </select>
            </div>
            <div data-metadata-section="street-date">
              <label className="text-xs text-zinc-500 block mb-1">Street date</label>
              <input
                type="date"
                value={form.release_date || ''}
                onChange={(e) => setField('release_date', e.target.value)}
                className={inputClass}
              />
              {streetDateHint(form.release_date).warning ? (
                <p className="text-[11px] text-amber-400/90 mt-1">
                  {streetDateHint(form.release_date).warning}
                </p>
              ) : (
                <p className="text-[11px] text-zinc-600 mt-1">
                  At least one week out improves playlist chances.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Original release date</label>
              <input
                type="date"
                value={form.original_release_date || ''}
                onChange={(e) => setField('original_release_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Album artist</label>
              <input
                value={form.album_artist}
                onChange={(e) => setField('album_artist', e.target.value)}
                placeholder="SERGIK"
                className={inputClass}
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                DSP billing name for the package. Track collabs live on Catalog.
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Label</label>
              <input
                value={form.label_name}
                onChange={(e) => setField('label_name', e.target.value)}
                placeholder="SERGIK"
                className={inputClass}
              />
            </div>
            <div data-metadata-section="genre">
              <label className="text-xs text-zinc-500 block mb-1">Primary genre</label>
              <select
                value={form.genre}
                onChange={(e) => {
                  const next = e.target.value
                  const allowed = secondaryGenresFor(next)
                  onFormChange({
                    ...form,
                    genre: next,
                    subgenre: allowed.includes(form.subgenre) ? form.subgenre : '',
                  })
                }}
                className={inputClass}
              >
                <option value="">Select DSP genre</option>
                {DSP_PRIMARY_GENRES.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
                {form.genre && !DSP_PRIMARY_GENRES.includes(form.genre as (typeof DSP_PRIMARY_GENRES)[number]) ? (
                  <option value={form.genre}>{form.genre} (map to DSP list)</option>
                ) : null}
              </select>
              {!isDspPrimaryGenre(form.genre) && dspGenreMap.mapped ? (
                <button
                  type="button"
                  onClick={() =>
                    onFormChange({
                      ...form,
                      genre: dspGenreMap.primary,
                      subgenre: dspGenreMap.secondary,
                    })
                  }
                  className="mt-1 text-[11px] text-violet-300 hover:text-violet-200"
                >
                  Use {dspGenreMap.primary}
                  {dspGenreMap.secondary ? ` / ${dspGenreMap.secondary}` : ''}
                </button>
              ) : null}
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Secondary genre</label>
              <select
                value={form.subgenre}
                onChange={(e) => setField('subgenre', e.target.value)}
                className={inputClass}
              >
                <option value="">Optional</option>
                {secondaryGenresFor(form.genre).map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
                {form.subgenre && !secondaryGenresFor(form.genre).includes(form.subgenre) ? (
                  <option value={form.subgenre}>{form.subgenre}</option>
                ) : null}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Language</label>
              <select
                value={form.language}
                onChange={(e) => setField('language', e.target.value)}
                className={inputClass}
              >
                {TRACK_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Catalog number</label>
              <div className="flex gap-2">
                <input
                  value={form.catalog_number}
                  onChange={(e) => setField('catalog_number', e.target.value)}
                  placeholder="SERGIK-TITLE-2026"
                  className={inputClass}
                />
                <button
                  type="button"
                  title="Generate catalog number"
                  onClick={() =>
                    setField(
                      'catalog_number',
                      generateCatalogNumber(
                        form.title,
                        Number(form.p_line_year || form.release_date.slice(0, 4)) || undefined,
                      ),
                    )
                  }
                  className="shrink-0 px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-white"
                >
                  <FaMagic />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">℗ year</label>
              <input
                type="number"
                min={1900}
                max={2100}
                value={form.p_line_year}
                onChange={(e) => setField('p_line_year', e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                {formatPhonogramNotice(
                  Number(form.p_line_year) || new Date().getFullYear(),
                  form.label_name || form.album_artist || 'SERGIK',
                )}
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">© year</label>
              <input
                type="number"
                min={1900}
                max={2100}
                value={form.c_line_year}
                onChange={(e) => setField('c_line_year', e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                {formatCopyrightNotice(
                  Number(form.c_line_year) || new Date().getFullYear(),
                  form.album_artist || form.label_name || 'SERGIK',
                )}
              </p>
            </div>
            <div className="sm:col-span-2" data-metadata-section="upc">
              <label className="text-xs text-zinc-500 block mb-1">UPC</label>
              <div className="flex gap-2">
                <input
                  value={form.upc}
                  onChange={(e) => setField('upc', e.target.value)}
                  placeholder="Internal or GS1 UPC"
                  className={inputClass}
                />
                <button
                  type="button"
                  title="Generate internal UPC"
                  onClick={() => setField('upc', generateInternalUpc())}
                  className="shrink-0 px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-white"
                >
                  <FaMagic />
                </button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs text-zinc-500">Description</label>
                {tracks.length ? (
                  <button
                    type="button"
                    onClick={() => setField('description', writeListeningJourney())}
                    className="text-[11px] text-violet-300 hover:text-violet-200"
                  >
                    Write listening journey
                  </button>
                ) : null}
              </div>
              <AiField
                as="textarea"
                fieldKey="description"
                label="Description"
                entityType="distribution_release"
                entityId={releaseId}
                formId="release_metadata"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                className={`${inputClass} min-h-[180px]`}
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                Start-to-finish listen from catalog press notes, then an ordered tracklist, contributor
                credits, and artwork credits (designer / photographer / illustrator). Save metadata to
                keep it.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.explicit}
                onChange={(e) => setField('explicit', e.target.checked)}
                className="rounded border-zinc-600"
              />
              Explicit content
            </label>
            <fieldset
              data-metadata-section="previously-released"
              className="sm:col-span-2 text-sm text-zinc-300 space-y-2"
            >
              <legend className="text-xs text-zinc-500 mb-1">Has this been previously released?</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="previously-released"
                  checked={form.previously_released === 'no'}
                  onChange={() => setField('previously_released', 'no')}
                />
                No — first time on stores
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="previously-released"
                  checked={form.previously_released === 'yes'}
                  onChange={() => setField('previously_released', 'yes')}
                />
                Yes — keep the existing ISRC/UPC (do not mint a new QTA53 code)
              </label>
              {form.previously_released === 'yes' && (
                <div className="grid sm:grid-cols-2 gap-3 pt-2">
                  <input
                    value={form.previous_isrc}
                    onChange={(e) => setField('previous_isrc', e.target.value.toUpperCase())}
                    placeholder="Existing ISRC"
                    className={inputClass}
                  />
                  <input
                    value={form.previous_upc}
                    onChange={(e) => setField('previous_upc', e.target.value)}
                    placeholder="Existing UPC"
                    className={inputClass}
                  />
                </div>
              )}
            </fieldset>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save metadata'}
          </button>
        </div>
      </div>
    </div>
  )
}

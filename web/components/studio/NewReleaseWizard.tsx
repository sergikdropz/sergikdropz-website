'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/contexts/NotificationContext'
import WizardStepBar, { type WizardStep } from './WizardStepBar'
import VaultImportPanel from './VaultImportPanel'
import { COPY_TEMPLATES, DEFAULT_LABEL_NAME, type MarketingCopy } from '@/lib/studio/constants'
import { DSP_PRIMARY_GENRES, secondaryGenresFor, streetDateHint } from '@/lib/studio/dsp-ingest'
import { TRACK_LANGUAGES } from '@/lib/studio/dsp-package'
import { FaArrowLeft, FaArrowRight, FaCheckCircle } from 'react-icons/fa'

const WIZARD_STEPS: WizardStep[] = [
  { id: 'basics', label: 'Basics', description: 'Title, type, dates' },
  { id: 'artwork', label: 'Artwork', description: 'Cover image' },
  { id: 'tracks', label: 'Tracks', description: 'Select catalog' },
  { id: 'copy', label: 'Copy', description: 'Optional pitch text' },
  { id: 'review', label: 'Review', description: 'Create release' },
]

const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500'

export default function NewReleaseWizard() {
  const router = useRouter()
  const { showNotification } = useNotifications()
  const [step, setStep] = useState(0)
  const [tracks, setTracks] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [artworkUrl, setArtworkUrl] = useState('')
  const [marketingCopy, setMarketingCopy] = useState<MarketingCopy>({})
  const [form, setForm] = useState({
    title: '',
    type: 'single' as 'single' | 'ep' | 'album',
    release_date: '',
    genre: '',
    subgenre: '',
    description: '',
    explicit: false,
    label_name: DEFAULT_LABEL_NAME,
    language: 'en',
    previously_released: '' as '' | 'no' | 'yes',
    previous_isrc: '',
    previous_upc: '',
    artwork_owned: false,
  })

  useEffect(() => {
    fetch('/api/studio/tracks')
      .then((r) => r.json())
      .then((d) => setTracks(d.tracks || []))
      .catch(() => {})
  }, [])

  function toggleTrack(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function uploadArtwork(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/studio/upload/artwork', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setArtworkUrl(data.url)
      showNotification('Artwork uploaded', 'success')
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  function canAdvance(): boolean {
    if (step === 0) return Boolean(form.title.trim())
    if (step === 2) return selected.size > 0
    return true
  }

  async function createRelease() {
    setSubmitting(true)
    try {
      const releaseId = `release-${Date.now()}`
      const res = await fetch('/api/studio/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: releaseId,
          title: form.title,
          type: form.type,
          release_date: form.release_date || null,
          artwork_url: artworkUrl || null,
          genre: form.genre || null,
          subgenre: form.subgenre || null,
          description: form.description || null,
          explicit: form.explicit,
          label_name: form.label_name || null,
          language: form.language || 'en',
          previously_released:
            form.previously_released === '' ? null : form.previously_released === 'yes',
          previous_isrc: form.previous_isrc || null,
          previous_upc: form.previous_upc || null,
          artwork_owned: form.artwork_owned,
          marketing_copy: marketingCopy,
          distribution_mode: 'self',
        }),
      })
      if (!res.ok) throw new Error('Failed to create release')

      for (const trackId of Array.from(selected)) {
        await fetch(`/api/studio/tracks/${trackId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ release_id: releaseId }),
        })
      }

      showNotification('Release created — finish rights & go-live', 'success')
      router.push(`/studio/releases/${releaseId}`)
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Create failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const withIsrc = tracks.filter((t) => t.isrc_full)
  const withoutIsrc = tracks.filter((t) => !t.isrc_full)

  return (
    <div>
      <div className="mb-6">
        <VaultImportPanel
          onImported={({ releaseId, title, trackCount }) => {
            showNotification(
              `Imported “${title}” with ${trackCount} vault track(s)`,
              'success',
            )
            router.push(`/studio/releases/${releaseId}`)
          }}
        />
        <p className="text-center text-xs text-zinc-600 mt-3">— or build manually —</p>
      </div>

      <WizardStepBar steps={WIZARD_STEPS} currentIndex={step} onStepClick={setStep} />

      {step === 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <div>
            <label className="text-sm text-zinc-400">Release title *</label>
            <input
              className={`${inputClass} mt-1`}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Single or album title"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">Type</label>
              <select
                className={`${inputClass} mt-1`}
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as typeof form.type })
                }
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400">Release date</label>
              <input
                type="date"
                className={`${inputClass} mt-1`}
                value={form.release_date}
                onChange={(e) => setForm({ ...form, release_date: e.target.value })}
              />
              {streetDateHint(form.release_date).warning ? (
                <p className="text-[11px] text-amber-400/90 mt-1">
                  {streetDateHint(form.release_date).warning}
                </p>
              ) : (
                <p className="text-[11px] text-zinc-600 mt-1">
                  Set at least one week ahead for playlist chances.
                </p>
              )}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">Primary genre</label>
              <select
                className={`${inputClass} mt-1`}
                value={form.genre}
                onChange={(e) => {
                  const next = e.target.value
                  const allowed = secondaryGenresFor(next)
                  setForm({
                    ...form,
                    genre: next,
                    subgenre: allowed.includes(form.subgenre) ? form.subgenre : '',
                  })
                }}
              >
                <option value="">Select DSP genre</option>
                {DSP_PRIMARY_GENRES.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400">Secondary genre</label>
              <select
                className={`${inputClass} mt-1`}
                value={form.subgenre}
                onChange={(e) => setForm({ ...form, subgenre: e.target.value })}
              >
                <option value="">Optional</option>
                {secondaryGenresFor(form.genre).map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-zinc-400">Language</label>
              <select
                className={`${inputClass} mt-1`}
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                {TRACK_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400">Description</label>
            <textarea
              className={`${inputClass} mt-1`}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.explicit}
              onChange={(e) => setForm({ ...form, explicit: e.target.checked })}
              className="rounded border-zinc-600"
            />
            Explicit content
          </label>
          <fieldset className="space-y-2 text-sm text-zinc-300">
            <legend className="text-sm text-zinc-400">Previously released?</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.previously_released === 'no'}
                onChange={() => setForm({ ...form, previously_released: 'no' })}
              />
              No
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.previously_released === 'yes'}
                onChange={() => setForm({ ...form, previously_released: 'yes' })}
              />
              Yes — reuse existing ISRC/UPC
            </label>
            {form.previously_released === 'yes' && (
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  className={inputClass}
                  value={form.previous_isrc}
                  onChange={(e) => setForm({ ...form, previous_isrc: e.target.value.toUpperCase() })}
                  placeholder="Existing ISRC"
                />
                <input
                  className={inputClass}
                  value={form.previous_upc}
                  onChange={(e) => setForm({ ...form, previous_upc: e.target.value })}
                  placeholder="Existing UPC"
                />
              </div>
            )}
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <label className="text-sm text-zinc-400 block mb-2">Cover artwork (3000×3000 recommended)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadArtwork(f)
            }}
            className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-violet-600 file:text-white"
          />
          {artworkUrl && (
            <p className="mt-3 flex items-center gap-2 text-emerald-400 text-sm">
              <FaCheckCircle /> Artwork ready
            </p>
          )}
          {artworkUrl && (
            <img
              src={artworkUrl}
              alt=""
              className="mt-4 w-48 h-48 rounded-xl object-cover border border-zinc-700"
            />
          )}
          <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
            Stores reject URLs, @handles, store logos, prices, pixelation, and reused covers. You
            must own everything in the image.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.artwork_owned}
              onChange={(e) => setForm({ ...form, artwork_owned: e.target.checked })}
              className="mt-0.5 rounded border-zinc-600"
            />
            I own this artwork and it has no URLs, @handles, store logos, or prices.
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
          <p className="text-sm text-zinc-500">
            Selected: {selected.size} track{selected.size !== 1 ? 's' : ''}. Tracks need
            QTA53 ISRCs before go-live — assign on the Catalog step after create.
          </p>
          {withIsrc.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-emerald-400 uppercase mb-2">
                Ready (has ISRC)
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {withIsrc.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/80 cursor-pointer hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggleTrack(t.id)}
                      className="rounded"
                    />
                    <span className="flex-1 font-medium">{t.title}</span>
                    <span className="text-xs font-mono text-emerald-400">{t.isrc_full}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {withoutIsrc.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-amber-400 uppercase mb-2">
                Missing ISRC (can still add — assign before launch)
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {withoutIsrc.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggleTrack(t.id)}
                    />
                    <span className="flex-1">{t.title}</span>
                    <span className="text-xs text-amber-400">No ISRC</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <p className="text-sm text-zinc-500">Optional — refine later in the release studio.</p>
          {(Object.keys(COPY_TEMPLATES) as (keyof MarketingCopy)[]).slice(0, 3).map((key) => (
            <div key={key}>
              <label className="text-xs text-zinc-500">{COPY_TEMPLATES[key].label}</label>
              <textarea
                className={`${inputClass} mt-1 text-sm`}
                rows={2}
                value={marketingCopy[key] || ''}
                onChange={(e) =>
                  setMarketingCopy({ ...marketingCopy, [key]: e.target.value })
                }
                placeholder={COPY_TEMPLATES[key].placeholder}
              />
            </div>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-6 space-y-3 text-sm">
          <h3 className="font-semibold text-lg text-white">{form.title}</h3>
          <p className="text-zinc-400 capitalize">
            {form.type}
            {form.release_date ? ` · ${form.release_date}` : ''}
            {form.genre ? ` · ${form.genre}` : ''}
          </p>
          <p className="text-zinc-400">{selected.size} track(s) · {artworkUrl ? 'Artwork ✓' : 'No artwork'}</p>
          <p className="text-zinc-500 text-xs pt-2">
            After create you&apos;ll land in Release Studio to complete rights, DSP links, and go-live.
          </p>
        </div>
      )}

      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-zinc-700 text-zinc-300 text-sm disabled:opacity-40"
        >
          <FaArrowLeft /> Back
        </button>
        {step < WIZARD_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-violet-600 text-white font-semibold text-sm disabled:opacity-50"
          >
            Next <FaArrowRight />
          </button>
        ) : (
          <button
            type="button"
            onClick={createRelease}
            disabled={submitting || !canAdvance()}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create release'}
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import AiField from '@/components/AiField'
import { generateInternalUpc } from '@/lib/studio/upc'
import { FaImage, FaSpinner, FaMagic } from 'react-icons/fa'

export type MetadataForm = {
  title: string
  type: string
  release_date: string
  genre: string
  subgenre: string
  description: string
  explicit: boolean
  upc: string
}

type Props = {
  releaseId: string
  artworkUrl: string | null
  form: MetadataForm
  onFormChange: (form: MetadataForm) => void
  onSave: () => Promise<void> | void
  onArtworkUploaded: (url: string) => Promise<void> | void
  saving?: boolean
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
  saving,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [qaNote, setQaNote] = useState<string | null>(null)

  function setField<K extends keyof MetadataForm>(key: K, value: MetadataForm[K]) {
    onFormChange({ ...form, [key]: value })
  }

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
          Cover, genre, dates, and UPC — required before a clean go-live.
        </p>
      </div>

      <div className="p-5 grid lg:grid-cols-[200px_1fr] gap-8">
        <div>
          <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
            {artworkUrl ? (
              <Image src={artworkUrl} alt="" fill className="object-cover" sizes="200px" />
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
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Release date</label>
              <input
                type="date"
                value={form.release_date || ''}
                onChange={(e) => setField('release_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Genre</label>
              <AiField
                fieldKey="genre"
                label="Genre"
                entityType="distribution_release"
                entityId={releaseId}
                formId="release_metadata"
                value={form.genre}
                onChange={(e) => setField('genre', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Subgenre</label>
              <input
                value={form.subgenre}
                onChange={(e) => setField('subgenre', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
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
              <label className="text-xs text-zinc-500 block mb-1">Description</label>
              <AiField
                as="textarea"
                fieldKey="description"
                label="Description"
                entityType="distribution_release"
                entityId={releaseId}
                formId="release_metadata"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                className={`${inputClass} min-h-[88px]`}
              />
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

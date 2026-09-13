'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  FaArrowDown,
  FaArrowUp,
  FaExternalLinkAlt,
  FaPlus,
  FaStar,
  FaTrash,
  FaYoutube,
} from 'react-icons/fa'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { VIDEO_CATEGORIES, type CatalogVideo } from '@/lib/videos/types'
import { parseYouTubeInput, videoCategoryLabel, youtubeThumbnailUrls, youtubeWatchUrl } from '@/lib/videos/youtube'

type FormState = {
  id: string
  title: string
  description: string
  youtube_input: string
  youtube_id: string
  category: string
  date: string
  featured: boolean
  published: boolean
}

const emptyForm = (): FormState => ({
  id: '',
  title: '',
  description: '',
  youtube_input: '',
  youtube_id: '',
  category: 'music-video',
  date: new Date().getFullYear().toString(),
  featured: false,
  published: true,
})

function formFromVideo(video: CatalogVideo): FormState {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    youtube_input: video.youtube_id,
    youtube_id: video.youtube_id,
    category: video.category || 'music-video',
    date: video.date,
    featured: Boolean(video.featured),
    published: video.published !== false,
  }
}

export default function AdminVideosManager() {
  const { user, isAdmin, loading } = useAdminAuth()
  const { showNotification } = useNotifications()
  const [videos, setVideos] = useState<CatalogVideo[]>([])
  const [channel, setChannel] = useState('https://youtube.com/@sergikdropz')
  const [source, setSource] = useState<'settings' | 'json'>('json')
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CatalogVideo | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (isAdmin) fetchVideos()
  }, [isAdmin])

  async function fetchVideos() {
    try {
      setLoadingVideos(true)
      const response = await fetch('/api/admin/videos')
      const data = await response.json()
      setVideos(data.videos || [])
      if (data.youtube_channel) setChannel(data.youtube_channel)
      if (data.source === 'settings' || data.source === 'json') setSource(data.source)
    } catch (error) {
      console.error('Error fetching videos:', error)
      showNotification('Could not load videos', 'error')
    } finally {
      setLoadingVideos(false)
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return videos.filter((video) => {
      if (filter !== 'all' && video.category !== filter) return false
      if (!needle) return true
      return `${video.title} ${video.description} ${video.youtube_id}`.toLowerCase().includes(needle)
    })
  }, [videos, filter, query])

  async function handleSave(form: FormState) {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id || undefined,
          title: form.title,
          description: form.description,
          youtube_id: form.youtube_id || form.youtube_input,
          category: form.category,
          date: form.date,
          featured: form.featured,
          published: form.published,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        showNotification(data.error || 'Save failed', 'error')
        return
      }
      setShowForm(false)
      setEditing(null)
      await fetchVideos()
      showNotification(data.settings ? 'Published to the live /videos page' : 'Saved to the local catalog', 'success')
    } catch {
      showNotification('Save error', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this video from the /videos page?')) return
    try {
      const response = await fetch(`/api/admin/videos/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        showNotification('Delete failed', 'error')
        return
      }
      await fetchVideos()
      showNotification('Video removed', 'success')
    } catch {
      showNotification('Delete error', 'error')
    }
  }

  async function handleReorder(fromIndex: number, direction: -1 | 1) {
    const toIndex = fromIndex + direction
    if (toIndex < 0 || toIndex >= videos.length) return
    const next = [...videos]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setVideos(next)
    const response = await fetch('/api/admin/videos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map((video) => video.id) }),
    })
    if (!response.ok) {
      showNotification('Could not reorder videos', 'error')
      fetchVideos()
    }
  }

  async function handleFeature(video: CatalogVideo) {
    const response = await fetch('/api/admin/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...video, featured: !video.featured }),
    })
    if (!response.ok) {
      showNotification('Could not update featured video', 'error')
      return
    }
    await fetchVideos()
    showNotification(video.featured ? 'Removed from featured' : 'Set as featured hero', 'success')
  }

  async function handleImport() {
    setImporting(true)
    try {
      const response = await fetch('/api/admin/videos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      if (!response.ok) {
        showNotification(data.error || 'Import needs a YouTube API key — paste URLs instead', 'warning')
        return
      }
      await fetchVideos()
      showNotification(
        data.imported > 0
          ? `Imported ${data.imported} new video${data.imported === 1 ? '' : 's'} from YouTube`
          : 'Channel is already in sync',
        'success',
      )
    } catch {
      showNotification('Import error', 'error')
    } finally {
      setImporting(false)
    }
  }

  if (loading || loadingVideos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-xl text-white">Loading videos…</div>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen bg-black p-6 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-xs uppercase tracking-[0.2em] text-red-400">YouTube catalog</p>
            <h1 className="mb-2 text-3xl font-bold md:text-4xl">Videos</h1>
            <p className="max-w-2xl text-sm text-gray-400 md:text-base">
              Curate the public <span className="text-white">/videos</span> page. Paste a YouTube link, set the
              category, and feature one hero. Saves go live immediately when the database is available.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Source: {source === 'settings' ? 'live catalog' : 'committed videos.json'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/videos"
              target="_blank"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 hover:border-white/40"
            >
              Preview page
              <FaExternalLinkAlt className="h-3 w-3" aria-hidden />
            </Link>
            <a
              href={channel}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
            >
              <FaYoutube aria-hidden />
              Channel
            </a>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 hover:border-white/40 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import channel'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              <FaPlus aria-hidden />
              Add from YouTube
            </button>
          </div>
        </div>

        {showForm && (
          <VideoForm
            video={editing}
            saving={saving}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
          />
        )}

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or YouTube ID"
            className="min-h-[44px] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500"
          />
          <div className="flex flex-wrap gap-2">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
              All ({videos.length})
            </FilterButton>
            {VIDEO_CATEGORIES.map((category) => {
              const count = videos.filter((video) => video.category === category.id).length
              if (count === 0) return null
              return (
                <FilterButton
                  key={category.id}
                  active={filter === category.id}
                  onClick={() => setFilter(category.id)}
                >
                  {category.label} ({count})
                </FilterButton>
              )
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 py-16 text-center text-gray-400">
            {videos.length === 0
              ? 'No videos yet. Paste a YouTube URL to publish the first one.'
              : 'No videos match this filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((video) => {
              const index = videos.findIndex((row) => row.id === video.id)
              return (
                <article
                  key={video.id}
                  className={`overflow-hidden rounded-2xl border bg-gray-950 ${
                    video.featured ? 'border-red-500/60' : 'border-white/10'
                  }`}
                >
                  <div className="relative aspect-video bg-gray-800">
                    {video.youtube_id && (
                      <img
                        src={youtubeThumbnailUrls(video.youtube_id)[1]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute left-3 top-3 flex gap-2">
                      <span className="rounded-full bg-black/70 px-2 py-1 text-[11px] uppercase tracking-wide text-white">
                        {videoCategoryLabel(video.category)}
                      </span>
                      {video.published === false && (
                        <span className="rounded-full bg-amber-500/90 px-2 py-1 text-[11px] font-medium text-black">
                          Hidden
                        </span>
                      )}
                      {video.featured && (
                        <span className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-medium text-white">
                          Featured
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <h3 className="truncate text-lg font-semibold">{video.title}</h3>
                      <p className="line-clamp-2 text-sm text-gray-400">{video.description || 'No description'}</p>
                      <p className="mt-1 text-xs text-gray-500">{video.date}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(video)
                          setShowForm(true)
                        }}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Edit
                      </button>
                      <a
                        href={youtubeWatchUrl(video.youtube_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 hover:text-red-300"
                      >
                        YouTube
                      </a>
                      <button
                        type="button"
                        onClick={() => handleFeature(video)}
                        className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200"
                      >
                        <FaStar className="h-3 w-3" aria-hidden />
                        {video.featured ? 'Unfeature' : 'Feature'}
                      </button>
                      <button type="button" onClick={() => handleReorder(index, -1)} className="text-gray-400 hover:text-white" aria-label="Move up">
                        <FaArrowUp />
                      </button>
                      <button type="button" onClick={() => handleReorder(index, 1)} className="text-gray-400 hover:text-white" aria-label="Move down">
                        <FaArrowDown />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(video.id)}
                        className="ml-auto inline-flex items-center gap-1 text-red-400 hover:text-red-300"
                      >
                        <FaTrash className="h-3 w-3" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[40px] rounded-full px-3 py-1.5 text-xs ${
        active ? 'bg-white text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

function VideoForm({
  video,
  saving,
  onSave,
  onCancel,
}: {
  video: CatalogVideo | null
  saving: boolean
  onSave: (form: FormState) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(video ? formFromVideo(video) : emptyForm())
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [lookupError, setLookupError] = useState('')

  useEffect(() => {
    setForm(video ? formFromVideo(video) : emptyForm())
    setLookupState(video?.youtube_id ? 'ready' : 'idle')
  }, [video])

  async function lookupYouTube(input: string) {
    const parsed = parseYouTubeInput(input)
    if ('error' in parsed) {
      setForm((current) => ({ ...current, youtube_input: input, youtube_id: '' }))
      setLookupState(input.trim() ? 'error' : 'idle')
      setLookupError(parsed.error)
      return
    }

    setForm((current) => ({ ...current, youtube_input: input, youtube_id: parsed.youtubeId }))
    setLookupState('loading')
    try {
      const response = await fetch(`/api/admin/videos/lookup?url=${encodeURIComponent(input)}`)
      const data = await response.json()
      if (!response.ok) {
        setLookupState('ready')
        return
      }
      setForm((current) => ({
        ...current,
        youtube_id: data.youtube_id || parsed.youtubeId,
        title: current.title || data.title || '',
      }))
      setLookupState('ready')
    } catch {
      setLookupState('error')
      setLookupError('Could not look up that video')
    }
  }

  const thumb = form.youtube_id ? youtubeThumbnailUrls(form.youtube_id)[1] : ''

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4 p-5 md:p-6">
          <h2 className="text-xl font-semibold">{video ? 'Edit video' : 'Add from YouTube'}</h2>
          <label className="block">
            <span className="mb-2 block text-sm text-gray-300">YouTube URL or ID</span>
            <input
              type="text"
              value={form.youtube_input}
              onChange={(event) => {
                const value = event.target.value
                setForm((current) => ({ ...current, youtube_input: value }))
                void lookupYouTube(value)
              }}
              placeholder="https://youtu.be/OML1I_V4Dy4"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-white"
            />
            {lookupState === 'error' && <p className="mt-2 text-xs text-red-400">{lookupError}</p>}
            {lookupState === 'loading' && <p className="mt-2 text-xs text-gray-500">Looking up video…</p>}
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-gray-300">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Video title"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-white"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-gray-300">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              placeholder="Shown under the title on /videos"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-white"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Category</span>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-white"
              >
                {VIDEO_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Year or date</span>
              <input
                type="text"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                placeholder="2025"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-white"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => setForm((current) => ({ ...current, featured: event.target.checked }))}
              />
              Featured hero on /videos
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))}
              />
              Published
            </label>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={saving || !form.title || !form.youtube_id}
              onClick={() => onSave(form)}
              className="rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : video ? 'Update video' : 'Publish to /videos'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-white/10 px-5 py-2.5 text-white hover:bg-white/15"
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="border-t border-white/10 bg-black/30 p-5 lg:border-l lg:border-t-0">
          <p className="mb-3 text-sm text-gray-400">Preview</p>
          {form.youtube_id ? (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <img src={thumb} alt="" className="aspect-video w-full object-cover" />
              <div className="p-3">
                <p className="font-medium text-white">{form.title || 'Untitled video'}</p>
                <p className="mt-1 text-xs text-gray-500">{form.youtube_id}</p>
              </div>
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-gray-500">
              Paste a YouTube link to preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

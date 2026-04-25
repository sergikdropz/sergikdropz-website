'use client'

import { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { createSmartPlaylist } from '@/utils/musicLibraryApi'

interface SmartPlaylistBuilderProps {
  onClose: () => void
  onCreated: () => void
}

interface RuleState {
  genre: string
  subgenre: string
  artist: string
  bpm_min: string
  bpm_max: string
  energy_min: string
  energy_max: string
  key: string
  min_rating: string
  year_min: string
  year_max: string
  tags: string
}

export default function SmartPlaylistBuilder({ onClose, onCreated }: SmartPlaylistBuilderProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sortBy, setSortBy] = useState('created_at_timestamp')
  const [sortDir, setSortDir] = useState('desc')
  const [maxTracks, setMaxTracks] = useState('50')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rules, setRules] = useState<RuleState>({
    genre: '',
    subgenre: '',
    artist: '',
    bpm_min: '',
    bpm_max: '',
    energy_min: '',
    energy_max: '',
    key: '',
    min_rating: '',
    year_min: '',
    year_max: '',
    tags: '',
  })

  function updateRule(key: keyof RuleState, value: string) {
    setRules((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }

    const builtRules: any = {}
    if (rules.genre) builtRules.genre = rules.genre
    if (rules.subgenre) builtRules.subgenre = rules.subgenre
    if (rules.artist) builtRules.artist = rules.artist
    if (rules.bpm_min) builtRules.bpm_min = parseInt(rules.bpm_min)
    if (rules.bpm_max) builtRules.bpm_max = parseInt(rules.bpm_max)
    if (rules.energy_min) builtRules.energy_min = parseFloat(rules.energy_min)
    if (rules.energy_max) builtRules.energy_max = parseFloat(rules.energy_max)
    if (rules.key) builtRules.key = rules.key
    if (rules.min_rating) builtRules.min_rating = parseInt(rules.min_rating)
    if (rules.year_min) builtRules.year_min = parseInt(rules.year_min)
    if (rules.year_max) builtRules.year_max = parseInt(rules.year_max)
    if (rules.tags) builtRules.tags = rules.tags.split(',').map((t) => t.trim()).filter(Boolean)

    if (Object.keys(builtRules).length === 0) {
      setError('At least one rule is required')
      return
    }

    setSaving(true)
    setError(null)

    const result = await createSmartPlaylist({
      name: name.trim(),
      description: description.trim() || undefined,
      rules: builtRules,
      sort_by: sortBy,
      sort_dir: sortDir,
      max_tracks: maxTracks ? parseInt(maxTracks) : undefined,
    })

    setSaving(false)

    if (result) {
      onCreated()
      onClose()
    } else {
      setError('Failed to create smart playlist')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <h3 className="text-lg font-semibold">Create Smart Playlist</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">
            <FaTimes />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
              placeholder="My Smart Playlist"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
              placeholder="Optional description"
            />
          </div>

          <div className="border-t border-gray-800 pt-4">
            <div className="text-sm font-medium text-gray-300 mb-3">Rules</div>
            <div className="grid grid-cols-2 gap-3">
              <RuleInput label="Genre" value={rules.genre} onChange={(v) => updateRule('genre', v)} placeholder="House" />
              <RuleInput label="Subgenre" value={rules.subgenre} onChange={(v) => updateRule('subgenre', v)} placeholder="Deep House" />
              <RuleInput label="Artist" value={rules.artist} onChange={(v) => updateRule('artist', v)} placeholder="SERGIK" />
              <RuleInput label="Key" value={rules.key} onChange={(v) => updateRule('key', v)} placeholder="Am, Cm, etc." />
              <RuleInput label="BPM Min" value={rules.bpm_min} onChange={(v) => updateRule('bpm_min', v)} placeholder="120" type="number" />
              <RuleInput label="BPM Max" value={rules.bpm_max} onChange={(v) => updateRule('bpm_max', v)} placeholder="130" type="number" />
              <RuleInput label="Energy Min (0-1)" value={rules.energy_min} onChange={(v) => updateRule('energy_min', v)} placeholder="0.5" type="number" />
              <RuleInput label="Energy Max (0-1)" value={rules.energy_max} onChange={(v) => updateRule('energy_max', v)} placeholder="1.0" type="number" />
              <RuleInput label="Min Rating (1-5)" value={rules.min_rating} onChange={(v) => updateRule('min_rating', v)} placeholder="4" type="number" />
              <RuleInput label="Year Min" value={rules.year_min} onChange={(v) => updateRule('year_min', v)} placeholder="2020" type="number" />
              <RuleInput label="Year Max" value={rules.year_max} onChange={(v) => updateRule('year_max', v)} placeholder="2026" type="number" />
              <RuleInput label="Tags (comma-separated)" value={rules.tags} onChange={(v) => updateRule('tags', v)} placeholder="remix, vocal" />
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <div className="text-sm font-medium text-gray-300 mb-3">Sorting & Limits</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort by field"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
                >
                  <option value="created_at_timestamp">Date Added</option>
                  <option value="title">Title</option>
                  <option value="artist">Artist</option>
                  <option value="bpm">BPM</option>
                  <option value="rating">Rating</option>
                  <option value="play_count">Play Count</option>
                  <option value="energy_level">Energy</option>
                  <option value="year">Year</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Direction</label>
                <select
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value)}
                  aria-label="Sort direction"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Tracks</label>
                <input
                  type="number"
                  value={maxTracks}
                  onChange={(e) => setMaxTracks(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
                  placeholder="50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-800 flex justify-end space-x-3 flex-shrink-0">
          <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Playlist'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RuleInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-purple-500 outline-none"
        placeholder={placeholder}
      />
    </div>
  )
}

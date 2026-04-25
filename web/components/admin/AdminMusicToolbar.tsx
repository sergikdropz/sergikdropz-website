'use client'

import { useState, useRef } from 'react'
import { FaSync, FaUpload, FaPlus, FaFolder, FaMusic, FaBrain, FaChartBar, FaLink, FaCog, FaChevronDown, FaChevronUp, FaTrash, FaEdit, FaStar, FaTimes, FaSave, FaSpinner } from 'react-icons/fa'
import {
  createFolder,
  createTrack,
  syncToDatabase,
  invalidateMusicLibraryCache,
  type FolderItem,
  type Track,
} from '@/utils/musicLibraryApi'

interface AdminMusicToolbarProps {
  onRefresh: () => void
  folders: FolderItem[]
  selectedTracks: Track[]
  onBulkEdit?: (updates: Partial<Track>) => void
  onBulkDelete?: () => void
}

export default function AdminMusicToolbar({
  onRefresh,
  folders,
  selectedTracks,
  onBulkEdit,
  onBulkDelete,
}: AdminMusicToolbarProps) {
  const [expanded, setExpanded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showCreateTrack, setShowCreateTrack] = useState(false)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [buildingCache, setBuildingCache] = useState(false)

  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderType, setNewFolderType] = useState<'folder' | 'album' | 'ep' | 'single'>('album')
  const [newFolderParent, setNewFolderParent] = useState('')

  const [bulkGenre, setBulkGenre] = useState('')
  const [bulkArtist, setBulkArtist] = useState('')
  const [bulkRating, setBulkRating] = useState('')

  function showStatus(msg: string) {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(null), 4000)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await syncToDatabase()
      invalidateMusicLibraryCache()
      showStatus('Sync complete')
      onRefresh()
    } catch (e: any) {
      showStatus(`Sync failed: ${e.message}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleScan() {
    setScanning(true)
    try {
      const res = await fetch('/api/music-library/sync-all-data', { method: 'POST' })
      if (res.ok) {
        showStatus('Scan complete')
        invalidateMusicLibraryCache()
        onRefresh()
      } else {
        showStatus('Scan failed')
      }
    } catch {
      showStatus('Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function handleBuildSonicDnaCache() {
    setBuildingCache(true)
    try {
      const res = await fetch('/api/music-library/build-sonic-dna-cache', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        showStatus(`Cache built: ${data.cached || 0} tracks cached`)
      } else {
        showStatus('Cache build failed')
      }
    } catch {
      showStatus('Cache build failed')
    } finally {
      setBuildingCache(false)
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    const id = `folder-${newFolderName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    try {
      await createFolder({
        id,
        name: newFolderName.trim(),
        type: newFolderType,
        parentId: newFolderParent || null,
      })
      showStatus(`Folder "${newFolderName}" created`)
      setShowCreateFolder(false)
      setNewFolderName('')
      invalidateMusicLibraryCache()
      onRefresh()
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }

  function handleBulkApply() {
    if (!onBulkEdit || selectedTracks.length === 0) return
    const updates: Partial<Track> = {}
    if (bulkGenre) updates.genre = bulkGenre
    if (bulkArtist) updates.artist = bulkArtist
    if (bulkRating) updates.rating = parseInt(bulkRating)
    onBulkEdit(updates)
    setShowBulkEdit(false)
    setBulkGenre('')
    setBulkArtist('')
    setBulkRating('')
  }

  return (
    <div className="bg-gray-900/80 border border-gray-700 rounded-lg mb-4 overflow-hidden">
      {/* Compact bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-xs text-orange-400 font-semibold uppercase tracking-wider">
            <FaCog className="w-3 h-3" />
            <span>Admin Controls</span>
          </div>

          {/* Quick action buttons */}
          <div className="flex items-center space-x-1 ml-3">
            <ToolbarButton
              icon={syncing ? FaSpinner : FaSync}
              label="Sync"
              onClick={handleSync}
              disabled={syncing}
              spinning={syncing}
            />
            <ToolbarButton
              icon={scanning ? FaSpinner : FaBrain}
              label="Scan"
              onClick={handleScan}
              disabled={scanning}
              spinning={scanning}
            />
            <ToolbarButton
              icon={FaPlus}
              label="Folder"
              onClick={() => setShowCreateFolder(true)}
            />
            <ToolbarButton
              icon={buildingCache ? FaSpinner : FaLink}
              label="Build Cache"
              onClick={handleBuildSonicDnaCache}
              disabled={buildingCache}
              spinning={buildingCache}
            />
          </div>

          {/* Bulk actions (when tracks selected) */}
          {selectedTracks.length > 0 && (
            <div className="flex items-center space-x-1 ml-3 pl-3 border-l border-gray-700">
              <span className="text-xs text-purple-400">{selectedTracks.length} selected</span>
              <ToolbarButton
                icon={FaEdit}
                label="Bulk Edit"
                onClick={() => setShowBulkEdit(!showBulkEdit)}
                active={showBulkEdit}
              />
              {onBulkDelete && (
                <ToolbarButton
                  icon={FaTrash}
                  label="Delete"
                  onClick={onBulkDelete}
                  danger
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {statusMessage && (
            <span className="text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded">{statusMessage}</span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-white p-1 transition"
            aria-label={expanded ? 'Collapse toolbar' : 'Expand toolbar'}
          >
            {expanded ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ActionCard
              icon={FaSync}
              label="Sync Library"
              description="Re-sync JSON to database"
              onClick={handleSync}
              loading={syncing}
            />
            <ActionCard
              icon={FaBrain}
              label="Full Scan"
              description="Scan all data sources"
              onClick={handleScan}
              loading={scanning}
            />
            <ActionCard
              icon={FaLink}
              label="Build Sonic DNA Cache"
              description="Rebuild analysis cache"
              onClick={handleBuildSonicDnaCache}
              loading={buildingCache}
            />
            <ActionCard
              icon={FaFolder}
              label="Create Folder"
              description="Add album, EP, or folder"
              onClick={() => setShowCreateFolder(true)}
            />
          </div>
        </div>
      )}

      {/* Create folder modal */}
      {showCreateFolder && (
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-950/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Create Folder</span>
            <button onClick={() => setShowCreateFolder(false)} className="text-gray-500 hover:text-white" aria-label="Close">
              <FaTimes className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-orange-500"
            />
            <select
              value={newFolderType}
              onChange={(e) => setNewFolderType(e.target.value as any)}
              aria-label="Folder type"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white outline-none"
            >
              <option value="album">Album</option>
              <option value="ep">EP</option>
              <option value="single">Single</option>
              <option value="folder">Folder</option>
            </select>
            <select
              value={newFolderParent}
              onChange={(e) => setNewFolderParent(e.target.value)}
              aria-label="Parent folder"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white outline-none"
            >
              <option value="">No parent (root)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button
              onClick={handleCreateFolder}
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded text-sm font-medium transition"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Bulk edit panel */}
      {showBulkEdit && selectedTracks.length > 0 && (
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-950/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Bulk Edit {selectedTracks.length} Tracks</span>
            <button onClick={() => setShowBulkEdit(false)} className="text-gray-500 hover:text-white" aria-label="Close">
              <FaTimes className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={bulkGenre}
              onChange={(e) => setBulkGenre(e.target.value)}
              placeholder="Genre"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-orange-500"
            />
            <input
              type="text"
              value={bulkArtist}
              onChange={(e) => setBulkArtist(e.target.value)}
              placeholder="Artist"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-orange-500"
            />
            <input
              type="number"
              min="0"
              max="5"
              value={bulkRating}
              onChange={(e) => setBulkRating(e.target.value)}
              placeholder="Rating (0-5)"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-orange-500"
            />
            <button
              onClick={handleBulkApply}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm font-medium transition"
            >
              Apply to {selectedTracks.length} Tracks
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
  active,
  danger,
}: {
  icon: any
  label: string
  onClick: () => void
  disabled?: boolean
  spinning?: boolean
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition ${
        danger
          ? 'text-red-400 hover:bg-red-900/30 hover:text-red-300'
          : active
          ? 'bg-orange-600/20 text-orange-300'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      } disabled:opacity-40`}
      title={label}
    >
      <Icon className={`w-3 h-3 ${spinning ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function ActionCard({
  icon: Icon,
  label,
  description,
  onClick,
  loading,
}: {
  icon: any
  label: string
  description: string
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-left hover:border-orange-600/50 hover:bg-gray-800/80 transition disabled:opacity-50 group"
    >
      <div className="flex items-center space-x-2 mb-1">
        <Icon className={`w-4 h-4 text-orange-400 ${loading ? 'animate-spin' : ''}`} />
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <p className="text-xs text-gray-500">{description}</p>
    </button>
  )
}

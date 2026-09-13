'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FaSearch, FaMusic, FaCompactDisc, FaSync, FaBolt, FaRocket, FaUpload } from 'react-icons/fa'
import { invalidateMusicLibraryCache } from '@/utils/musicLibraryApi'

interface Command {
  id: string
  label: string
  icon: any
  action: () => void
  category: string
}

interface CommandPaletteProps {
  onClose: () => void
  onAction: (action: () => void) => void
}

export default function CommandPalette({ onClose, onAction }: CommandPaletteProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Command[] = [
    {
      id: 'upload-track',
      label: 'Upload New Track',
      icon: FaUpload,
      action: () => router.push('/admin/music?action=upload'),
      category: 'Music',
    },
    {
      id: 'create-release',
      label: 'Create Release',
      icon: FaCompactDisc,
      action: () => router.push('/admin/releases?action=new'),
      category: 'Music',
    },
    {
      id: 'analyze-pending',
      label: 'Analyze Pending Tracks',
      icon: FaBolt,
      action: () => router.push('/admin/sonic-dna?filter=pending'),
      category: 'Music',
    },
    {
      id: 'studio',
      label: 'Open Studio',
      icon: FaRocket,
      action: () => router.push('/studio'),
      category: 'Studio',
    },
    {
      id: 'sync-production',
      label: 'Sync to Production',
      icon: FaSync,
      action: async () => {
        if (
          !confirm(
            'Publish the admin catalog to the live site? Visitors will see current folders, EPs, albums, track order, and visibility.',
          )
        ) {
          return
        }
        const res = await fetch('/api/admin/sync-production', { method: 'POST' })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          invalidateMusicLibraryCache()
          const folders = data.visibleFolders != null ? `${data.visibleFolders} folders` : 'catalog'
          alert(`Published to live site (${folders}).`)
        } else {
          alert(data.error || 'Publish failed.')
        }
      },
      category: 'System',
    },
    {
      id: 'admin-music',
      label: 'Go to Music Management',
      icon: FaMusic,
      action: () => router.push('/admin/music'),
      category: 'Navigation',
    },
    {
      id: 'admin-releases',
      label: 'Go to Releases',
      icon: FaCompactDisc,
      action: () => router.push('/admin/releases'),
      category: 'Navigation',
    },
    {
      id: 'admin-sonic-dna',
      label: 'Go to Sonic DNA',
      icon: FaBolt,
      action: () => router.push('/admin/sonic-dna'),
      category: 'Navigation',
    },
  ]

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(search.toLowerCase()) ||
      cmd.category.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      }
      if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        onAction(filteredCommands[selectedIndex].action)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredCommands, selectedIndex, onClose, onAction])

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 pt-32 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-2xl rounded-lg border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-800 p-4">
          <FaSearch className="text-gray-400" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-white outline-none"
            aria-label="Search commands"
          />
          <kbd className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400">ESC</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto" role="listbox" aria-label="Commands">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon
              return (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIndex}
                  onClick={() => onAction(cmd.action)}
                  className={`flex w-full items-center gap-3 p-4 transition hover:bg-gray-800 ${
                    idx === selectedIndex ? 'bg-gray-800' : ''
                  }`}
                >
                  <Icon className="text-gray-400" aria-hidden />
                  <div className="flex-1 text-left">
                    <div className="font-medium text-white">{cmd.label}</div>
                    <div className="text-xs text-gray-500">{cmd.category}</div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="p-8 text-center text-gray-400">No commands found</div>
          )}
        </div>
      </div>
    </div>
  )
}

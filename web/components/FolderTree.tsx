'use client'

import { useState } from 'react'
import { FaFolder, FaFolderOpen, FaMusic, FaChevronRight, FaChevronDown } from 'react-icons/fa'
import Image from 'next/image'
import { FaPlay } from 'react-icons/fa'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
}

interface FolderItem {
  id: string
  name: string
  type: 'folder' | 'album' | 'ep' | 'single' | 'remix' | 'track'
  parentId: string | null
  hidden?: boolean
  children?: FolderItem[]
  tracks?: Track[]
  artwork?: string
  year?: number
}

interface FolderTreeProps {
  items: FolderItem[]
  onTrackSelect: (track: Track) => void
  onFolderSelect?: (folder: FolderItem) => void
  onFolderPlay?: (folder: FolderItem) => void
  onFolderContextMenu?: (e: React.MouseEvent, folder: FolderItem) => void
  onTrackDrop?: (trackId: string, folder: FolderItem) => void
  folderPath?: FolderItem[]
  folderPathComponent?: React.ReactNode
  showHidden?: boolean // If true, show hidden folders (for admin). Default: false
  /** Folder ids omitted from the tree (e.g. fan UI hides the aggregate "All Tracks" row). */
  hideFolderIds?: string[]
  /** Map exact `folder.name` from data to a label shown in the tree (display-only). */
  folderNameOverrides?: Record<string, string>
  /** Override classes on the scrollable list wrapper (default includes max-h-[600px]). */
  treeContainerClassName?: string
}

export default function FolderTree({ items, onTrackSelect, onFolderSelect, onFolderPlay, onFolderContextMenu, onTrackDrop, folderPathComponent, showHidden = false, hideFolderIds = [], folderNameOverrides, treeContainerClassName }: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedFolders(newExpanded)
  }

  const renderItem = (item: FolderItem, level: number = 0) => {
    // Skip hidden folders unless showHidden is true
    if (item.hidden && !showHidden) return null
    if (hideFolderIds.length > 0 && hideFolderIds.includes(item.id)) return null

    const rawName = item.name || (item as any).title || ''
    const displayName = folderNameOverrides?.[rawName] ?? rawName

    // Check if this is actually a track (has file and duration properties)
    const isTrack = item.type === 'track' || ((item as any).file && (item as any).duration)
    
    const isExpanded = expandedFolders.has(item.id)
    // Filter out hidden children unless showHidden is true
    const visibleChildren = (showHidden ? item.children || [] : item.children?.filter(c => !c.hidden) || []).filter(
      (c) => !hideFolderIds.includes(c.id)
    )
    const hasChildren = visibleChildren.length > 0
    const hasTracks = item.tracks && item.tracks.length > 0
    const canExpand = hasChildren || hasTracks
    const isAlbumOrEP = item.type === 'album' || item.type === 'ep' || item.type === 'single' || item.type === 'remix'
    const isDropTarget = !isTrack
    const isDragOver = dragOverFolderId === item.id
    
    // Get artwork from item or first track
    let artwork = item.artwork
    if (!artwork && item.tracks && item.tracks.length > 0) {
      artwork = item.tracks[0].artwork
    }
    // For tracks, get artwork directly
    if (!artwork && isTrack) {
      artwork = (item as any).artwork
    }

    // Standard rendering for folders and tracks
    return (
      <div key={item.id}>
        <div
          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group hover:bg-gray-700 ${
            level === 0 ? '' : level === 1 ? 'pl-8' : level === 2 ? 'pl-12' : 'pl-16'
          } ${isDropTarget && isDragOver ? 'bg-purple-500/10 ring-1 ring-purple-400/40' : ''}`}
          onClick={() => {
            // Single click: select folder only
            if (!isTrack) {
              onFolderSelect?.(item)
            }
          }}
          onDragOver={(e) => {
            if (!isDropTarget) return
            const hasTrack = e.dataTransfer.types.includes('text/track-id')
            if (hasTrack) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverFolderId(item.id)
            }
          }}
          onDragLeave={() => {
            if (isDropTarget) setDragOverFolderId(null)
          }}
          onDrop={(e) => {
            if (!isDropTarget) return
            const trackId = e.dataTransfer.getData('text/track-id')
            setDragOverFolderId(null)
            if (trackId) {
              onTrackDrop?.(trackId, item)
            }
          }}
          onContextMenu={(e) => {
            // Right click: show context menu for folders
            if (!isTrack && onFolderContextMenu) {
              onFolderContextMenu(e, item)
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            // Double click: expand/collapse folder or play tracks
            if (!isTrack) {
              // Double click on folder: expand/collapse
              if (canExpand) {
                toggleFolder(item.id)
              }
            } else {
              // Double click on track: play track
              const track = item as unknown as Track
              if (track.id && track.file) {
                onTrackSelect(track)
              }
            }
            // Also handle play for albums/EPs with tracks but no children
            if (isAlbumOrEP && hasTracks && !hasChildren) {
              onFolderPlay?.(item)
            }
          }}
        >
          {canExpand && (
            <span 
              className="text-gray-400 text-xs flex-shrink-0 hover:text-gray-300 transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                // Click chevron: expand/collapse folder
                toggleFolder(item.id)
              }}
              title={isExpanded ? 'Collapse folder' : 'Expand folder'}
            >
              {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
            </span>
          )}
          
          {!canExpand && <span className="w-3 flex-shrink-0" />}
          
          {item.type === 'folder' && !artwork && (
            <span className="text-gray-500 flex-shrink-0">
              {isExpanded ? <FaFolderOpen className="text-sm" /> : <FaFolder className="text-sm" />}
            </span>
          )}
          
          {/* Show artwork as icon for albums/EPs/singles/remixes */}
          {isAlbumOrEP && artwork ? (
            <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0 shadow-lg">
              <Image
                src={resolveImageUrl(artwork)}
                alt={displayName}
                fill
                className="object-cover"
                unoptimized={shouldUnoptimizeImage(resolveImageUrl(artwork))}
                sizes="40px"
              />
            </div>
          ) : isAlbumOrEP && !artwork ? (
            <span className="text-gray-500 flex-shrink-0">
              <FaMusic className="text-sm" />
            </span>
          ) : null}
          
          {/* Show artwork as icon for tracks */}
          {isTrack && artwork ? (
            <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0 shadow-lg">
              <Image
                src={resolveImageUrl(artwork)}
                alt={displayName}
                fill
                className="object-cover"
                unoptimized={shouldUnoptimizeImage(resolveImageUrl(artwork))}
                sizes="32px"
              />
            </div>
          ) : isTrack && !artwork ? (
            <span className="text-gray-500 flex-shrink-0">
              <FaMusic className="text-xs" />
            </span>
          ) : null}
          
          {/* Show artwork as icon for folders */}
          {item.type === 'folder' && artwork && (
            <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0 shadow-lg">
              <Image
                src={resolveImageUrl(artwork)}
                alt={displayName}
                fill
                className="object-cover"
                unoptimized={shouldUnoptimizeImage(resolveImageUrl(artwork))}
                sizes="40px"
              />
            </div>
          )}

          <span className={`flex-1 truncate ${
            level === 0 ? 'text-sm font-medium text-white' : 
            isTrack ? 'text-sm text-gray-200' : 
            'text-sm text-gray-200'
          }`}>{displayName}</span>
          
          {item.year && (
            <span className="text-gray-500 text-xs flex-shrink-0 font-medium">{item.year}</span>
          )}

          {isTrack && (item as any).duration && (
            <span className="text-gray-500 text-xs flex-shrink-0 font-mono">
              {Math.floor((item as any).duration / 60)}:{(item as any).duration % 60 < 10 ? '0' : ''}{Math.floor((item as any).duration % 60)}
            </span>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {visibleChildren.map(child => renderItem(child, level + 1))}
          </div>
        )}

        {/* Don't render tracks in the tree - they'll be shown in main area when folder is selected */}
      </div>
    )
  }

  // Filter out hidden items at the top level unless showHidden is true
  const visibleItems = (showHidden ? items : items.filter(item => !item.hidden)).filter(
    (item) => !hideFolderIds.includes(item.id)
  )

  if (visibleItems.length === 0 && !folderPathComponent) {
    return null
  }

  return (
    <div
      className={
        treeContainerClassName ?? 'divide-y divide-gray-700 max-h-[600px] overflow-y-auto'
      }
    >
      {visibleItems.map((item) => (
        <div key={item.id}>
          {renderItem(item)}
        </div>
      ))}
      {folderPathComponent && (
        <div className="border-t border-gray-700">
          {folderPathComponent}
        </div>
      )}
    </div>
  )
}

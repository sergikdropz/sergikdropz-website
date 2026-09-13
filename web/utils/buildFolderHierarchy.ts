/**
 * Utility to build hierarchical folder structure from flat list
 */

import { FolderItem, Track } from './musicLibraryApi'

export interface HierarchicalFolder extends FolderItem {
  children?: HierarchicalFolder[]
  tracks?: Track[]
  trackCount?: number
  childCount?: number
  level?: number
}

/**
 * Build hierarchical structure from flat folder list
 */
export function buildFolderHierarchy(
  flatFolders: FolderItem[],
  allTracks: Track[] = []
): HierarchicalFolder[] {
  const folderMap = new Map<string, HierarchicalFolder>()
  const rootFolders: HierarchicalFolder[] = []

  // Create folder objects
  flatFolders.forEach((folder) => {
    folderMap.set(folder.id, {
      ...folder,
      children: [],
      tracks: [],
      trackCount: 0,
      childCount: 0,
      level: 0,
    })
  })

  // Add tracks to folders
  allTracks.forEach((track) => {
    const folder = folderMap.get((track as any).folderId || (track as any).folder_id)
    if (folder) {
      if (!folder.tracks) folder.tracks = []
      folder.tracks.push(track)
    }
  })

  // Build parent-child relationships
  flatFolders.forEach((folder) => {
    const folderObj = folderMap.get(folder.id)!
    if (folder.parentId || (folder as any).parent_id) {
      const parentId = folder.parentId || (folder as any).parent_id
      const parent = folderMap.get(parentId!)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(folderObj)
        folderObj.level = (parent.level || 0) + 1
      } else {
        // Parent not found, treat as root
        rootFolders.push(folderObj)
      }
    } else {
      rootFolders.push(folderObj)
    }
  })

  // Calculate counts recursively
  const calculateCounts = (folder: HierarchicalFolder): void => {
    folder.childCount = folder.children?.length || 0
    folder.trackCount = folder.tracks?.length || 0

    if (folder.children) {
      folder.children.forEach(calculateCounts)
      folder.trackCount += folder.children.reduce(
        (sum, child) => sum + (child.trackCount || 0),
        0
      )
      folder.childCount += folder.children.reduce(
        (sum, child) => sum + (child.childCount || 0),
        0
      )
    }
  }

  rootFolders.forEach(calculateCounts)

  // Sort folders alphabetically
  const sortFolders = (folders: HierarchicalFolder[]): HierarchicalFolder[] => {
    return folders
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((folder) => ({
        ...folder,
        children: folder.children ? sortFolders(folder.children) : undefined,
      }))
  }

  return sortFolders(rootFolders)
}

/**
 * Flatten hierarchical structure back to flat list
 */
export function flattenHierarchy(
  hierarchicalFolders: HierarchicalFolder[]
): FolderItem[] {
  const result: FolderItem[] = []

  const traverse = (folders: HierarchicalFolder[]) => {
    folders.forEach((folder) => {
      const { children, trackCount, childCount, level, ...flatFolder } = folder
      result.push(flatFolder)
      if (children && children.length > 0) {
        traverse(children)
      }
    })
  }

  traverse(hierarchicalFolders)
  return result
}

/**
 * Find folder in hierarchy by ID
 */
export function findFolderInHierarchy(
  folders: HierarchicalFolder[],
  id: string
): HierarchicalFolder | null {
  for (const folder of folders) {
    if (folder.id === id) {
      return folder
    }
    if (folder.children) {
      const found = findFolderInHierarchy(folder.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Check if folder is descendant of another folder
 */
export function isDescendant(
  folder: HierarchicalFolder,
  ancestorId: string
): boolean {
  if (folder.id === ancestorId) return true
  if (folder.children) {
    return folder.children.some((child) => isDescendant(child, ancestorId))
  }
  return false
}

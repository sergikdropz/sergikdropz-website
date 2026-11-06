import {
  filterPrintFilesForTechnique,
  techniqueForPrintFiles,
  techniqueForSavedFile,
  techniqueKeyForPrintFile,
} from '@/lib/merch/catalog-studio'
import type { CatalogPrintFile } from '@/lib/merch/printful-catalog-types'

/** Physical spot on the garment. Front DTG and left-chest embroidery share `front`. */
export function placementZone(type: string, title = ''): string {
  const text = `${type} ${title}`.toLowerCase()
  if (text.includes('label')) return 'label'
  if (text.includes('sleeve') || text.includes('side')) {
    if (text.includes('right')) return 'right'
    if (text.includes('left')) return 'left'
  }
  if (text.includes('back')) return 'back'
  if (text.includes('front') || text.includes('chest') || text.includes('default')) return 'front'
  return type.trim().toLowerCase() || 'print'
}

export function printFilesForSelectedTechniques(
  files: CatalogPrintFile[],
  techniques: string[],
): CatalogPrintFile[] {
  const seen = new Set<string>()
  const out: CatalogPrintFile[] = []
  for (const technique of techniques) {
    for (const file of filterPrintFilesForTechnique(files, technique)) {
      if (seen.has(file.type)) continue
      seen.add(file.type)
      out.push(file)
    }
  }
  return out
}

export type PlacementConflictRef = { placement: string; conflicts: string[] }

function pairConflicts(a: string, b: string, conflicts: PlacementConflictRef[]): boolean {
  return conflicts.some(
    (row) =>
      (row.placement === a && row.conflicts.includes(b)) || (row.placement === b && row.conflicts.includes(a)),
  )
}

/**
 * A placement that already has art keeps that technique. The other technique
 * for the same spot is removed so it cannot be chosen. Printful pairs that
 * cannot share a variant (front + front wide, left chest + center chest,
 * left sleeve + right sleeve) are removed the same way.
 */
export function hideClaimedPlacementTechniques<T extends { type: string; title?: string | null }>(
  files: T[],
  placedTypes: string[],
  conflicts: PlacementConflictRef[] = [],
): T[] {
  const placed = new Set(placedTypes)
  const claimed = new Map<string, string>()
  for (const type of placedTypes) {
    const family = techniqueKeyForPrintFile(type)
    if (!family) continue
    const file = files.find((row) => row.type === type)
    const zone = placementZone(type, file?.title || '')
    if (!claimed.has(zone)) claimed.set(zone, family)
  }
  return files.filter((file) => {
    if (!placed.has(file.type) && placedTypes.some((type) => pairConflicts(file.type, type, conflicts))) return false
    const family = techniqueKeyForPrintFile(file.type)
    const taken = claimed.get(placementZone(file.type, file.title || ''))
    if (!taken || !family) return true
    return taken === family
  })
}

export function placementTechniqueBlockNote<T extends { type: string; title?: string | null }>(
  files: T[],
  placedTypes: string[],
  conflicts: PlacementConflictRef[] = [],
): string | null {
  const visible = new Set(hideClaimedPlacementTechniques(files, placedTypes, conflicts).map((file) => file.type))
  const hidden = files.find((file) => !visible.has(file.type))
  if (!hidden) return null
  const conflictOwner = placedTypes.find((type) => pairConflicts(hidden.type, type, conflicts))
  const ownerFile = files.find((row) => row.type === conflictOwner)
  if (
    conflictOwner &&
    techniqueKeyForPrintFile(conflictOwner) &&
    techniqueKeyForPrintFile(conflictOwner) === techniqueKeyForPrintFile(hidden.type)
  ) {
    const hiddenName = hidden.title || hidden.type
    const ownerName = ownerFile?.title || conflictOwner
    return `${hiddenName} can't be used with ${ownerName}, so it's hidden.`
  }
  const zone = placementZone(hidden.type, hidden.title || '')
  const ownerType = placedTypes.find((type) => {
    const file = files.find((row) => row.type === type)
    return placementZone(type, file?.title || '') === zone
  })
  const owner = techniqueKeyForPrintFile(ownerType) === 'EMBROIDERY' ? 'embroidery' : 'a print'
  const spot =
    zone === 'front' ? 'front' : zone === 'back' ? 'back' : zone === 'left' ? 'left side' : zone === 'right' ? 'right side' : 'placement'
  return `This ${spot} already uses ${owner}, so the other technique is hidden there.`
}

/** Keep files Printful can take together: one technique per placement, mix across placements. */
export function filesRespectingPlacementTechnique<T extends { type: string; title?: string | null }>(
  files: T[],
  activeFileType?: string | null,
  conflicts: PlacementConflictRef[] = [],
): T[] {
  const ordered = [...files].sort((a, b) => {
    if (a.type === activeFileType) return -1
    if (b.type === activeFileType) return 1
    return 0
  })
  const claimed = new Map<string, string | null>()
  const keptTypes: string[] = []
  const kept: T[] = []
  for (const file of ordered) {
    if (keptTypes.some((type) => pairConflicts(file.type, type, conflicts))) continue
    const family = techniqueKeyForPrintFile(file.type)
    const zone = placementZone(file.type, file.title || '')
    const taken = claimed.get(zone)
    if (taken && family && taken !== family) continue
    if (!claimed.has(zone)) claimed.set(zone, family)
    keptTypes.push(file.type)
    kept.push(file)
  }
  return kept
}

/** Camera view a print file belongs on. Chest embroidery is the front of the shirt. */
export function mockupViewForPrintFile(type: string, title = ''): string | null {
  const text = `${type} ${title}`.toLowerCase()
  if (text.includes('label') || text.includes('inside') || text.includes('neck')) return null
  if (text.includes('sleeve') || text.includes('side')) {
    if (text.includes('right')) return 'Right'
    if (text.includes('left')) return 'Left'
  }
  if (text.includes('back')) return 'Back'
  if (text.includes('front') || text.includes('chest') || text.includes('default')) return 'Front'
  return null
}

function viewMatchesMockup(view: string, wanted: Set<string>): boolean {
  const name = view.trim().toLowerCase()
  if (wanted.has(name)) return true
  if (wanted.has('left') && name.startsWith('left')) return true
  if (wanted.has('right') && name.startsWith('right')) return true
  return false
}

/**
 * Printful's mockup task accepts one technique. Ask only for the views this
 * group actually prints, so a back DTG task does not come back as a blank front.
 */
export function mockupStyleOptionsForFiles(
  files: Array<{ type: string; title?: string | null }>,
  available: { optionGroups: string[]; options: string[] } | null,
): { optionGroups: string[]; options: string[] } | null {
  const wanted = new Set(
    files
      .map((file) => mockupViewForPrintFile(file.type, file.title || ''))
      .filter((view): view is string => Boolean(view))
      .map((view) => view.toLowerCase()),
  )
  if (wanted.size === 0) return available
  const listed = (available?.options || []).filter((view) => viewMatchesMockup(view, wanted))
  const options = listed.length > 0 ? listed : [...wanted].map((view) => view.charAt(0).toUpperCase() + view.slice(1))
  return {
    optionGroups: available?.optionGroups?.length ? available.optionGroups : ['Flat'],
    options: options.slice(0, 6),
  }
}

/** One mockup task per technique. A single-technique product stays one task. */
export function mockupFileGroups<T extends { type: string }>(
  files: T[],
  techniques: Array<{ key: string; isDefault?: boolean }>,
): Array<{ technique: string | null; files: T[] }> {
  const buckets = new Map<string, T[]>()
  const order: string[] = []
  for (const file of files) {
    const family = techniqueKeyForPrintFile(file.type) || 'other'
    if (!buckets.has(family)) {
      buckets.set(family, [])
      order.push(family)
    }
    buckets.get(family)!.push(file)
  }
  if (order.length <= 1) {
    return [{ technique: techniqueForPrintFiles(files, techniques), files }]
  }
  return order.map((family) => {
    const group = buckets.get(family) || []
    return { technique: techniqueForPrintFiles(group, techniques), files: group }
  })
}

export function splitMockupTaskKeys(key: string | null | undefined): string[] {
  return (key || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function joinMockupTaskKeys(keys: string[]): string | null {
  const unique = splitMockupTaskKeys(keys.join(','))
  return unique.length > 0 ? unique.join(',') : null
}

export function techniqueKeysForFileTypes(
  techniques: Array<{ key: string; isDefault?: boolean }>,
  fileTypes: Array<string | null | undefined>,
): string[] {
  const keys: string[] = []
  for (const type of fileTypes) {
    const key = techniqueForSavedFile(techniques, type)
    if (key && !keys.includes(key)) keys.push(key)
  }
  return keys
}

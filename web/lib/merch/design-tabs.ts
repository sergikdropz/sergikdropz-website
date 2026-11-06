import {
  PLACEMENT_VIEWS,
  placementTabLabel,
  placementViewName,
  type PlacementView,
} from '@/components/admin/MerchDesignMaker'
import { techniqueKeyForPrintFile } from '@/lib/merch/catalog-studio'

export type DesignTab = { id: string; label: string }

export type DesignTabPrintFile = {
  type: string
  title: string
  additionalPrice: number | null
}

function placementFileScore(file: DesignTabPrintFile): number {
  const text = `${file.type} ${file.title}`.toLowerCase()
  let score = 0
  if (text.includes('large')) score += 2
  if ((file.additionalPrice ?? 0) > 0) score += 1
  return score
}

function hasPlacementToken(text: string, token: string): boolean {
  return new RegExp(`(?:^|[^a-z])${token}(?:[^a-z]|$)`).test(text)
}

/** Extra Printful surfaces (large front, labels…) stay as their own tab; plain duplicates do not. */
export function isAlternatePlacementFile(file: DesignTabPrintFile): boolean {
  const text = `${file.type} ${file.title}`.toLowerCase()
  if (hasPlacementToken(text, 'large') || hasPlacementToken(text, 'wide')) return true
  if (/label|inside|outside|pocket|neck|wrap|facing|panel|billing|hood\b|leg\b/.test(text)) return true
  if ((file.additionalPrice ?? 0) > 0) return true
  return false
}

function isWideFront(file: DesignTabPrintFile): boolean {
  const text = `${file.type} ${file.title}`.toLowerCase()
  return text.includes('front') && (hasPlacementToken(text, 'large') || hasPlacementToken(text, 'wide'))
}

function primaryTabLabel(file: DesignTabPrintFile, view: PlacementView): string {
  if (/embroidery/i.test(file.type)) {
    return placementTabLabel(file.title || file.type)
  }
  if (view === 'Right sleeve' || view === 'Left sleeve') {
    return placementTabLabel(file.title || file.type) || view
  }
  return view
}

function placementFileWins(
  file: DesignTabPrintFile,
  current: DesignTabPrintFile,
  prefer: ReadonlySet<string>,
): boolean {
  const filePreferred = prefer.has(file.type)
  const currentPreferred = prefer.has(current.type)
  if (filePreferred !== currentPreferred) {
    // A wide or paid extra stays its own tab. It must not take the primary Front slot.
    if (filePreferred && isAlternatePlacementFile(file) && !isAlternatePlacementFile(current)) return false
    if (currentPreferred && isAlternatePlacementFile(current) && !isAlternatePlacementFile(file)) return true
    return filePreferred
  }
  return placementFileScore(file) < placementFileScore(current)
}

function techniqueHint(type: string): string {
  const family = techniqueKeyForPrintFile(type)
  if (family === 'EMBROIDERY') return 'embroidery'
  if (family === 'DTFILM') return 'DTF'
  if (family === 'DTG') return 'DTG'
  return ''
}

/** Two techniques on one view must not share a tab name like "Front". */
function disambiguateTechniqueLabels(tabs: DesignTab[], files: DesignTabPrintFile[]) {
  const counts = new Map<string, number>()
  for (const tab of tabs) counts.set(tab.label, (counts.get(tab.label) || 0) + 1)
  for (const tab of tabs) {
    if ((counts.get(tab.label) || 0) < 2) continue
    const hint = techniqueHint(files.find((file) => file.type === tab.id)?.type || tab.id)
    if (!hint || tab.label.toLowerCase().includes(hint.toLowerCase())) continue
    tab.label = `${tab.label} · ${hint}`
  }
}

function techniqueSlot(view: PlacementView, file: DesignTabPrintFile, separateTechniques: boolean): string {
  if (!separateTechniques) return view
  return `${view}:${techniqueKeyForPrintFile(file.type) || 'other'}`
}

export function buildDesignTabs(
  techniquePrintFiles: DesignTabPrintFile[],
  garmentPlacements: Array<{ id: string; label: string }>,
  options?: { preferTypes?: readonly string[]; separateTechniques?: boolean },
): DesignTab[] {
  if (techniquePrintFiles.length === 0) {
    return garmentPlacements.map((item) => ({
      id: item.id,
      label: item.id === 'back' ? 'Back' : 'Front',
    }))
  }

  const separateTechniques = Boolean(options?.separateTechniques)
  const prefer = new Set(options?.preferTypes || [])
  const chosen = new Map<string, DesignTabPrintFile>()
  for (const file of techniquePrintFiles) {
    const view = placementViewName(file.type, file.title || file.type)
    if (!view) continue
    const slot = techniqueSlot(view, file, separateTechniques)
    const current = chosen.get(slot)
    if (!current || placementFileWins(file, current, prefer)) chosen.set(slot, file)
  }

  const slotsForView = (view: PlacementView) =>
    [...chosen.keys()]
      .filter((slot) => slot === view || slot.startsWith(`${view}:`))
      .sort((a, b) => a.localeCompare(b))

  const tabs: DesignTab[] = PLACEMENT_VIEWS.flatMap((view) =>
    slotsForView(view).flatMap((slot) => {
      const file = chosen.get(slot)
      if (!file) return []
      return [{ id: file.type, label: primaryTabLabel(file, view) }]
    }),
  )

  const coveredTypes = new Set(tabs.map((tab) => tab.id))
  const coveredSlots = new Set<string>()
  for (const tab of tabs) {
    const file = techniquePrintFiles.find((row) => row.type === tab.id)
    if (!file) continue
    const view = placementViewName(file.type, file.title || file.type)
    if (view) coveredSlots.add(techniqueSlot(view, file, separateTechniques))
  }

  const wideFronts: DesignTab[] = []
  for (const file of techniquePrintFiles) {
    if (coveredTypes.has(file.type)) continue
    const view = placementViewName(file.type, file.title || file.type)
    const slot = view ? techniqueSlot(view, file, separateTechniques) : ''
    if (view && coveredSlots.has(slot) && !isAlternatePlacementFile(file)) continue
    coveredTypes.add(file.type)
    if (view) coveredSlots.add(techniqueSlot(view, file, separateTechniques))
    const wide = view === 'Front' && isWideFront(file)
    const tab = { id: file.type, label: wide ? 'Front Wide' : placementTabLabel(file.title || file.type) }
    if (wide) wideFronts.push(tab)
    else tabs.push(tab)
  }
  if (wideFronts.length > 0) {
    const frontAt = tabs.findIndex((tab) => tab.label === 'Front' || tab.label.startsWith('Front ·'))
    tabs.splice(frontAt >= 0 ? frontAt + 1 : tabs.length, 0, ...wideFronts)
  }

  if (separateTechniques) disambiguateTechniqueLabels(tabs, techniquePrintFiles)

  if (tabs.length > 0) return tabs

  return garmentPlacements.map((item) => ({
    id: item.id,
    label: item.id === 'back' ? 'Back' : 'Front',
  }))
}

/** Tab to show when a saved design opens. A remembered tab wins only when it has art. */
export function placementFileToOpen(
  tabs: DesignTab[],
  layers: Record<string, { assetUrl?: string } | null | undefined>,
  remembered?: string | null,
): string | null {
  if (tabs.length === 0) return null
  if (remembered && tabs.some((tab) => tab.id === remembered) && layers[remembered]?.assetUrl) return remembered
  const withArt = tabs.find((tab) => Boolean(layers[tab.id]?.assetUrl))
  if (withArt) return withArt.id
  if (remembered && tabs.some((tab) => tab.id === remembered)) return remembered
  return tabs[0].id
}

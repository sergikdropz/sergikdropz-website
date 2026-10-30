import {
  PLACEMENT_VIEWS,
  placementTabLabel,
  placementViewName,
  type PlacementView,
} from '@/components/admin/MerchDesignMaker'

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

export function buildDesignTabs(
  techniquePrintFiles: DesignTabPrintFile[],
  garmentPlacements: Array<{ id: string; label: string }>,
  options?: { preferTypes?: readonly string[] },
): DesignTab[] {
  if (techniquePrintFiles.length === 0) {
    return garmentPlacements.map((item) => ({
      id: item.id,
      label: item.id === 'back' ? 'Back' : 'Front',
    }))
  }

  const prefer = new Set(options?.preferTypes || [])
  const chosen = new Map<PlacementView, DesignTabPrintFile>()
  for (const file of techniquePrintFiles) {
    const view = placementViewName(file.type, file.title || file.type)
    if (!view) continue
    const current = chosen.get(view)
    if (!current || placementFileWins(file, current, prefer)) chosen.set(view, file)
  }

  const tabs: DesignTab[] = PLACEMENT_VIEWS.flatMap((view) => {
    const file = chosen.get(view)
    if (!file) return []
    return [{ id: file.type, label: primaryTabLabel(file, view) }]
  })

  const coveredTypes = new Set(tabs.map((tab) => tab.id))
  const coveredViews = new Set<PlacementView>()
  for (const tab of tabs) {
    const file = techniquePrintFiles.find((row) => row.type === tab.id)
    if (!file) continue
    const view = placementViewName(file.type, file.title || file.type)
    if (view) coveredViews.add(view)
  }

  const wideFronts: DesignTab[] = []
  for (const file of techniquePrintFiles) {
    if (coveredTypes.has(file.type)) continue
    const view = placementViewName(file.type, file.title || file.type)
    if (view && coveredViews.has(view) && !isAlternatePlacementFile(file)) continue
    coveredTypes.add(file.type)
    if (view) coveredViews.add(view)
    const wide = view === 'Front' && isWideFront(file)
    const tab = { id: file.type, label: wide ? 'Front Wide' : placementTabLabel(file.title || file.type) }
    if (wide) wideFronts.push(tab)
    else tabs.push(tab)
  }
  if (wideFronts.length > 0) {
    const frontAt = tabs.findIndex((tab) => tab.label === 'Front')
    tabs.splice(frontAt >= 0 ? frontAt + 1 : tabs.length, 0, ...wideFronts)
  }

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

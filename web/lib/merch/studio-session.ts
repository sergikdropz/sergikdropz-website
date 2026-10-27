const CATALOG_NAV_KEY = 'sergwear-catalog-nav'
const STUDIO_DESIGN_KEY = 'sergwear-studio-design'
const STAGE_VIEW_KEY = 'sergwear-stage-view'

export type CatalogNavSession = {
  activeNavId: string
  activeCategoryId: number | null
  sectionTitle: string
  expanded: number[]
  productsOpen: boolean
  productFolder: 'all' | 'draft' | 'live' | 'hidden' | null
}

export function readCatalogNavSession(): Partial<CatalogNavSession> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CATALOG_NAV_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CatalogNavSession>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeCatalogNavSession(session: CatalogNavSession) {
  window.localStorage.setItem(CATALOG_NAV_KEY, JSON.stringify(session))
}

export function readStudioDesignId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STUDIO_DESIGN_KEY)
    const id = raw ? (JSON.parse(raw) as { designId?: string }).designId : ''
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

export function writeStudioDesignId(designId: string | null) {
  if (!designId) {
    window.localStorage.removeItem(STUDIO_DESIGN_KEY)
    return
  }
  window.localStorage.setItem(STUDIO_DESIGN_KEY, JSON.stringify({ designId }))
}

export function readStageView(): 'preview' | 'design' | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(STAGE_VIEW_KEY)
  return value === 'preview' || value === 'design' ? value : null
}

export function writeStageView(view: 'preview' | 'design') {
  window.localStorage.setItem(STAGE_VIEW_KEY, view)
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import MerchDesignPreviewThumb from '@/components/admin/MerchDesignPreviewThumb'
import StudioContextMenu, { type StudioContextMenuEntry } from '@/components/studio/StudioContextMenu'
import { mockupPhotosForColor, shopFrontPhotoIndex } from '@/lib/merch/catalog-studio'
import { sortMerchDesigns, type DesignStatus, type MerchDesign } from '@/lib/merch/design'
import { groupMerchDesignsByItem } from '@/lib/merch/item-groups'
import { productMatColor } from '@/lib/merch/studio-session'
import type { PrintfulCatalogProduct } from '@/lib/merch/printful-catalog-types'
import type { CatalogNavItem, PrintfulCategoryNode } from '@/lib/merch/printful-categories'

/** Same double chevron as the admin sidebar collapse control. */
export function PanelChevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      className={`h-4 w-4 ${direction === 'right' ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
  )
}

const FAVORITES_KEY = 'sergwear-catalog-favorites'
export const CATALOG_PANEL_COLLAPSED_KEY = 'sergwear-catalog-nav-collapsed'
/** Grid column width when the full catalog panel is collapsed (header + expand control only). */
export const CATALOG_PANEL_COLLAPSED_WIDTH = 44

export function readCatalogPanelCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CATALOG_PANEL_COLLAPSED_KEY) === '1'
}

const PROMO_WIDGETS = [
  {
    id: 'stanley',
    title: 'Get 10% off new Stanley/Stella styles',
    body: 'A premium drop at a nicer price. Open Brands → Stanley/Stella in the sidebar.',
    navId: 'cat-211',
    categoryId: 211,
  },
  {
    id: 'dtflex',
    title: 'DTFlex products',
    body: 'Smooth, durable prints on cotton — explore the DTFlex lineup synced from Printful.',
    navId: 'cat-303',
    categoryId: 303,
  },
]

type ProductFolder = 'all' | DesignStatus

const PRODUCT_FOLDERS: Array<{ id: DesignStatus; label: string }> = [
  { id: 'draft', label: 'Drafts' },
  { id: 'live', label: 'Public' },
  { id: 'hidden', label: 'Hidden' },
]

/** Status tabs across the top of the catalog column. */
const STATUS_TABS: Array<{ id: DesignStatus; label: string }> = [
  { id: 'draft', label: 'Drafts' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'live', label: 'Public' },
]

const FOLDER_LABEL: Record<ProductFolder, string> = {
  all: 'My Products',
  draft: 'Drafts',
  live: 'Public',
  hidden: 'Hidden',
}

type Props = {
  activeCatalogId: number | null
  designs?: MerchDesign[]
  onSelect: (product: PrintfulCatalogProduct) => void
  onOpenDesign?: (design: MerchDesign) => void
  /** Fired after rename, duplicate, or a folder move so the parent can refresh. */
  onDesignsChanged?: () => void
  /** Fired when a saved product is renamed or moved, including the updated row. */
  onDesignUpdated?: (design: MerchDesign) => void
  /** Fired after a product is deleted. */
  onDesignRemoved?: (id: string) => void
  onCatalogPanelCollapsedChange?: (collapsed: boolean) => void
  /** Backdrop tone saved per design. Missing entries keep the original product color. */
  productMats?: Record<string, number>
}

function readFavorites(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? (JSON.parse(raw) as number[]) : []
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(id)) : []
  } catch {
    return []
  }
}

function writeFavorites(ids: number[]) {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
}

/** Move one visible card, leaving products outside this folder in place. */
function reorderVisibleIds(order: string[], visibleIds: string[], fromId: string, toId: string): string[] {
  const visibleSet = new Set(visibleIds)
  const currentVisible = order.filter((id) => visibleSet.has(id))
  const from = currentVisible.indexOf(fromId)
  const to = currentVisible.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return order
  const nextVisible = [...currentVisible]
  nextVisible.splice(from, 1)
  nextVisible.splice(to, 0, fromId)
  let cursor = 0
  return order.map((id) => (visibleSet.has(id) ? nextVisible[cursor++] : id))
}

function productPhotoUrls(design: MerchDesign): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const url of design.mockupUrls || []) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

function designCoverUrl(design: MerchDesign): string | null {
  const photos = mockupPhotosForColor(
    design.mockupUrls,
    design.mockupUrlsByColor,
    design.previewColorName,
    design.previewColorName,
  )
  const urls = photos.length > 0 ? photos : productPhotoUrls(design)
  if (urls.length === 0) return null
  const index = photos.length > 0 ? shopFrontPhotoIndex(design) : 0
  return urls[Math.min(Math.max(index, 0), urls.length - 1)] || urls[0]
}

function ItemGroupFolderTile({
  label,
  count,
  covers,
  onOpen,
}: {
  label: string
  count: number
  covers: string[]
  onOpen: () => void
}) {
  const cells = covers.slice(0, 4)
  const mosaic = cells.length <= 1 ? 'grid-cols-1' : cells.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'
  const shown = cells.length >= 3 ? [...cells, '', '', '', ''].slice(0, 4) : cells.length > 0 ? cells : ['']
  const countLabel = count === 1 ? '1 product' : `${count} products`
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}, ${countLabel}`}
      className="group overflow-hidden rounded-xl border border-white/10 bg-black/25 text-left transition hover:border-white/30"
    >
      <span className="relative block px-2 pt-2">
        <span
          className="absolute left-4 top-2 h-2.5 w-10 rounded-t-md border border-b-0 border-white/15 bg-white/15 group-hover:bg-white/25"
          aria-hidden
        />
        <span className={`relative mt-2 grid aspect-square gap-px overflow-hidden rounded-lg rounded-tl-md bg-black ${mosaic}`}>
          {shown.map((src, index) => (
            <span key={`${src || 'empty'}-${index}`} className="relative min-h-0 overflow-hidden bg-white/[0.04]">
              {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
            </span>
          ))}
        </span>
      </span>
      <span className="block px-2 pb-2 pt-1.5">
        <span className="line-clamp-2 text-[11px] font-medium leading-snug text-white">{label}</span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-white/45">{countLabel}</span>
      </span>
    </button>
  )
}

function designWriteBody(design: MerchDesign, overrides?: Record<string, unknown>) {
  return {
    id: design.id,
    blankId: design.blankId,
    catalogProductId: design.catalogProductId,
    name: design.name,
    placements: design.placements,
    activeFileType: design.activeFileType,
    colors: design.colors,
    sizes: design.sizes,
    previewColor: design.previewColor,
    retailPrice: design.retailPrice,
    status: design.status,
    embroideryUnlimitedColor: Boolean(design.embroideryUnlimitedColor),
    embroideryThreads: design.embroideryThreads || {},
    ...overrides,
  }
}

function CategoryTree({
  nodes,
  depth,
  activeCategoryId,
  expanded,
  onToggleExpand,
  onPickCategory,
}: {
  nodes: PrintfulCategoryNode[]
  depth: number
  activeCategoryId: number | null
  expanded: Set<number>
  onToggleExpand: (id: number) => void
  onPickCategory: (id: number, title: string) => void
}) {
  return (
    <ul className={depth === 0 ? 'space-y-0.5' : 'ml-2 border-l border-white/10 pl-1.5 space-y-0.5'}>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isOpen = expanded.has(node.id)
        const active = activeCategoryId === node.id
        return (
          <li key={node.id}>
            <div className="flex items-start gap-0.5">
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                  onClick={() => onToggleExpand(node.id)}
                  className="mt-0.5 shrink-0 px-0.5 text-[10px] text-white/40 hover:text-white/70"
                >
                  {isOpen ? '▾' : '▸'}
                </button>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onPickCategory(node.id, node.title)}
                className={`min-w-0 flex-1 text-left leading-snug py-0.5 pr-1 rounded ${
                  active ? 'bg-white text-black font-medium' : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
                style={{ fontSize: depth === 0 ? '11px' : '10px' }}
              >
                {node.title}
              </button>
            </div>
            {hasChildren && isOpen && (
              <CategoryTree
                nodes={node.children}
                depth={depth + 1}
                activeCategoryId={activeCategoryId}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onPickCategory={onPickCategory}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function MerchPrintfulCatalog({
  activeCatalogId,
  designs = [],
  onSelect,
  onOpenDesign,
  onDesignsChanged,
  onDesignUpdated,
  onDesignRemoved,
  onCatalogPanelCollapsedChange,
  productMats,
}: Props) {
  const [q, setQ] = useState('')
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [products, setProducts] = useState<PrintfulCatalogProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [navTop, setNavTop] = useState<CatalogNavItem[]>([])
  const [roots, setRoots] = useState<PrintfulCategoryNode[]>([])
  const [activeNavId, setActiveNavId] = useState('cat-277')
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(277)
  const [sectionTitle, setSectionTitle] = useState('My Products')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [favorites, setFavorites] = useState<number[]>([])
  const [productsOpen, setProductsOpen] = useState(true)
  const [productFolder, setProductFolder] = useState<ProductFolder | null>('all')
  /** Narrows My Products. Sidebar folders still switch the whole list. */
  const [statusTab, setStatusTab] = useState<DesignStatus | null>(null)
  const [catalogPanelCollapsed, setCatalogPanelCollapsed] = useState(false)
  const [designMenu, setDesignMenu] = useState<{ design: MerchDesign; x: number; y: number } | null>(null)
  const [openPhotoIds, setOpenPhotoIds] = useState<Set<string>>(() => new Set())
  const [openItemGroup, setOpenItemGroup] = useState<string | null>(null)
  const productListRef = useRef<HTMLDivElement>(null)
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const previewOrderRef = useRef<string[] | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const dragMovedRef = useRef(false)
  const dragDroppedRef = useRef(false)
  const suppressClickRef = useRef(false)

  const setOrder = (next: string[] | null) => {
    previewOrderRef.current = next
    setPreviewOrder(next)
  }
  const [designActionId, setDesignActionId] = useState<string | null>(null)
  const [designNote, setDesignNote] = useState<string | null>(null)

  const runDesignAction = useCallback(
    async (design: MerchDesign, label: string, work: () => Promise<string>) => {
      setDesignActionId(design.id)
      setDesignNote(null)
      try {
        setDesignNote(await work())
        onDesignsChanged?.()
      } catch (error) {
        setDesignNote(error instanceof Error ? error.message : `Could not ${label.toLowerCase()}`)
      } finally {
        setDesignActionId(null)
      }
    },
    [onDesignsChanged],
  )

  const saveDesignFields = useCallback(
    async (design: MerchDesign, overrides: Record<string, unknown>) => {
      const res = await fetch('/api/admin/merch/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(designWriteBody(design, overrides)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update that product')
      const saved = data.design as MerchDesign | undefined
      if (saved) onDesignUpdated?.(saved)
      return saved
    },
    [onDesignUpdated],
  )

  const renameDesign = (design: MerchDesign) => {
    const next = window.prompt('Rename this product', design.name)
    if (next == null) return
    const name = next.trim().slice(0, 80)
    if (!name || name === design.name) return
    void runDesignAction(design, 'rename', async () => {
      await saveDesignFields(design, { name })
      return `Renamed to “${name}”.`
    })
  }

  const duplicateDesign = (design: MerchDesign) => {
    const name = `${design.name} copy`.slice(0, 80)
    void runDesignAction(design, 'duplicate', async () => {
      const res = await fetch('/api/admin/merch/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...designWriteBody(design, { name, status: 'draft' }),
          id: undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not duplicate that product')
      const copy = data.design as MerchDesign | undefined
      if (copy) onOpenDesign?.(copy)
      return `Duplicated as a draft: “${copy?.name || name}”.`
    })
  }

  const moveDesign = (design: MerchDesign, status: DesignStatus) => {
    if (design.status === status) return
    void runDesignAction(design, 'move', async () => {
      if (status === 'draft') {
        await saveDesignFields(design, { status: 'draft' })
        return `“${design.name}” is now a draft.`
      }
      const res = await fetch(`/api/admin/merch/designs/${design.id}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update that product')
      if (data.design) onDesignUpdated?.(data.design as MerchDesign)
      return status === 'live'
        ? `“${design.name}” is public.`
        : `“${design.name}” is hidden.`
    })
  }

  const copyText = async (value: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setDesignNote(ok)
    } catch {
      setDesignNote('Could not copy that.')
    }
  }

  const deleteDesignCard = (design: MerchDesign) => {
    const confirmed = window.confirm(
      `Delete “${design.name}”? This removes it from My Products and deletes its artwork and Printful photos. A file another product still uses stays in the library.`,
    )
    if (!confirmed) return
    void runDesignAction(design, 'delete', async () => {
      const res = await fetch(`/api/admin/merch/designs/${design.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not delete that product')
      onDesignRemoved?.(design.id)
      return `Deleted “${design.name}”.`
    })
  }

  const designMenuItems: StudioContextMenuEntry[] = !designMenu
    ? []
    : [
        {
          type: 'command',
          command: {
            id: 'open',
            label: 'Open',
            onSelect: () => onOpenDesign?.(designMenu.design),
          },
        },
        {
          type: 'command',
          command: { id: 'rename', label: 'Rename', onSelect: () => renameDesign(designMenu.design) },
        },
        {
          type: 'command',
          command: {
            id: 'duplicate',
            label: 'Duplicate as draft',
            onSelect: () => duplicateDesign(designMenu.design),
          },
        },
        { type: 'separator' },
        {
          type: 'heading',
          label: 'Move to',
        },
        {
          type: 'command',
          command: {
            id: 'to-draft',
            label: 'Drafts',
            disabled: designMenu.design.status === 'draft',
            onSelect: () => moveDesign(designMenu.design, 'draft'),
          },
        },
        {
          type: 'command',
          command: {
            id: 'to-live',
            label: 'Public',
            disabled: designMenu.design.status === 'live',
            onSelect: () => moveDesign(designMenu.design, 'live'),
          },
        },
        {
          type: 'command',
          command: {
            id: 'to-hidden',
            label: 'Hidden',
            disabled: designMenu.design.status === 'hidden',
            onSelect: () => moveDesign(designMenu.design, 'hidden'),
          },
        },
        { type: 'separator' },
        {
          type: 'command',
          command: {
            id: 'copy-name',
            label: 'Copy name',
            onSelect: () => void copyText(designMenu.design.name, 'Copied the product name.'),
          },
        },
        {
          type: 'command',
          command: {
            id: 'copy-link',
            label: 'Copy shop link',
            disabled: designMenu.design.status !== 'live',
            onSelect: () =>
              void copyText(
                `${window.location.origin}/shop/merch/${designMenu.design.slug}`,
                'Copied the shop link.',
              ),
          },
        },
        {
          type: 'command',
          command: {
            id: 'open-shop',
            label: 'Open shop page',
            disabled: designMenu.design.status !== 'live',
            onSelect: () => window.open(`/shop/merch/${designMenu.design.slug}`, '_blank', 'noopener'),
          },
        },
        { type: 'separator' },
        {
          type: 'command',
          command: {
            id: 'delete',
            label: 'Delete',
            danger: true,
            onSelect: () => deleteDesignCard(designMenu.design),
          },
        },
      ]

  const setPanelCollapsed = useCallback(
    (next: boolean) => {
      setCatalogPanelCollapsed(next)
      window.localStorage.setItem(CATALOG_PANEL_COLLAPSED_KEY, next ? '1' : '0')
      onCatalogPanelCollapsedChange?.(next)
    },
    [onCatalogPanelCollapsedChange]
  )

  useEffect(() => {
    const collapsed = readCatalogPanelCollapsed()
    setCatalogPanelCollapsed(collapsed)
    onCatalogPanelCollapsedChange?.(collapsed)
    setFavorites(readFavorites())
    fetch('/api/admin/merch/catalog/categories')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        setNavTop(data.navTop || [])
        setRoots(data.roots || [])
      })
      .catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setNote(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      params.set('limit', '120')
      params.set('nav', activeNavId)
      if (activeCategoryId) {
        params.set('categoryId', String(activeCategoryId))
        params.set('live', '1')
      }
      if (activeNavId === 'favorites' && favorites.length > 0) {
        params.set('favoriteIds', favorites.join(','))
      }
      const res = await fetch(`/api/admin/merch/catalog?${params}`)
      const data = await res.json()
      setProducts(data.products || [])
      setSyncedAt(data.syncedAt || null)
      if (data.error) setNote(data.error)
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Could not load catalog')
    } finally {
      setLoading(false)
    }
  }, [q, activeNavId, activeCategoryId, favorites])

  const autoSynced = useRef(false)
  useEffect(() => {
    if (autoSynced.current) return
    autoSynced.current = true
    void syncCatalog()
    // Restore the last catalog view, then refresh Printful once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!autoSynced.current) return
    const timer = window.setTimeout(() => load(), q ? 280 : 0)
    return () => window.clearTimeout(timer)
  }, [load, q])

  async function syncCatalog() {
    setSyncing(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/merch/catalog', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setNote(`Synced ${data.productCount} products from Printful.`)
      const catRes = await fetch('/api/admin/merch/catalog/categories')
      if (catRes.ok) {
        const catData = await catRes.json()
        setRoots(catData.roots || [])
      }
      await load()
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  function pickNav(item: CatalogNavItem) {
    setProductFolder(null)
    setActiveNavId(item.id)
    setSectionTitle(item.label)
    if (item.kind === 'category' && item.categoryId) {
      setActiveCategoryId(item.categoryId)
    } else {
      setActiveCategoryId(null)
    }
  }

  function pickCategory(id: number, title: string) {
    setProductFolder(null)
    setActiveNavId(`cat-${id}`)
    setActiveCategoryId(id)
    setSectionTitle(title)
  }

  function pickProductFolder(folder: ProductFolder) {
    setProductsOpen(true)
    setProductFolder(folder)
    setSectionTitle(FOLDER_LABEL[folder])
    if (folder !== 'all') setStatusTab(null)
  }

  function matchesProductFolder(design: MerchDesign) {
    if (!productFolder) return false
    if (productFolder !== 'all') return design.status === productFolder
    if (statusTab) return design.status === statusTab
    return true
  }

  function toggleFavorite(productId: number) {
    setFavorites((current) => {
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
      writeFavorites(next)
      return next
    })
  }

  const serverOrder = useMemo(() => sortMerchDesigns(designs).map((design) => design.id), [designs])

  const orderedDesigns = useMemo(() => {
    const rank = new Map((previewOrder ?? serverOrder).map((id, index) => [id, index]))
    return [...designs].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
  }, [designs, previewOrder, serverOrder])

  const visibleDesigns = useMemo(() => {
    if (!productFolder) return []
    const inFolder = orderedDesigns.filter((design) => matchesProductFolder(design))
    const query = q.trim().toLowerCase()
    if (!query) return inFolder
    const labelById = new Map<string, string>()
    for (const group of groupMerchDesignsByItem(inFolder)) {
      const label = group.label.toLowerCase()
      for (const design of group.designs) labelById.set(design.id, label)
    }
    return inFolder.filter((design) => {
      if (design.name.toLowerCase().includes(query)) return true
      return (labelById.get(design.id) || '').includes(query)
    })
  }, [orderedDesigns, productFolder, statusTab, q])

  const itemGroups = useMemo(() => groupMerchDesignsByItem(visibleDesigns), [visibleDesigns])
  const openGroup = openItemGroup ? itemGroups.find((group) => group.key === openItemGroup) ?? null : null

  useEffect(() => {
    setOpenItemGroup(null)
  }, [productFolder, statusTab])

  const folderIds = useMemo(() => {
    if (!productFolder) return []
    return orderedDesigns.filter((design) => matchesProductFolder(design)).map((design) => design.id)
  }, [orderedDesigns, productFolder, statusTab])

  const canReorder = Boolean(productFolder) && !q.trim() && visibleDesigns.length > 1

  useEffect(() => {
    if (!previewOrder) return
    if (previewOrder.join('|') === serverOrder.join('|')) setOrder(null)
  }, [previewOrder, serverOrder])

  const moveDraggedDesign = (toId: string) => {
    const fromId = dragIdRef.current
    if (!fromId || fromId === toId || !canReorder) return
    const base = previewOrderRef.current ?? serverOrder
    const next = reorderVisibleIds(base, folderIds, fromId, toId)
    if (next.join('|') === base.join('|')) return
    dragMovedRef.current = true
    setOrder(next)
  }

  const commitDesignOrder = async () => {
    const ids = previewOrderRef.current
    if (!ids || !dragMovedRef.current) return
    try {
      const res = await fetch('/api/admin/merch/designs/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save that order')
      setDesignNote('Order saved.')
      onDesignsChanged?.()
    } catch (error) {
      setOrder(null)
      setDesignNote(error instanceof Error ? error.message : 'Could not save that order.')
    }
  }

  const summary = useMemo(() => {
    if (productFolder) return `${visibleDesigns.length} designs · ${sectionTitle}`
    if (!syncedAt) return 'Syncing with Printful…'
    return `${products.length} products · ${sectionTitle}`
  }, [productFolder, visibleDesigns.length, syncedAt, products.length, sectionTitle])

  const showWidgets =
    activeNavId === 'special-offers' ||
    activeNavId === 'cat-277' ||
    activeNavId === 'cat-123' ||
    sectionTitle === 'All products'

  const studioBg = { background: 'radial-gradient(ellipse at 50% 38%, #2c2c2c 0%, #141414 68%)' }

  const expandPanel = () => setPanelCollapsed(false)

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 text-white ${
        catalogPanelCollapsed ? 'cursor-pointer hover:bg-white/[0.03]' : ''
      }`}
      style={studioBg}
      {...(catalogPanelCollapsed
        ? {
            role: 'button' as const,
            tabIndex: 0,
            'aria-label': 'Expand catalog panel',
            title: 'Click to expand catalog',
            onClick: expandPanel,
            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                expandPanel()
              }
            },
          }
        : {})}
    >
      <div className="relative flex h-[45px] shrink-0 items-center justify-center border-b border-white/10 bg-black/30">
        {catalogPanelCollapsed ? (
          <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center text-gray-400">
            <PanelChevron direction="right" />
          </span>
        ) : (
          <button
            type="button"
            aria-label="Collapse catalog panel"
            aria-expanded
            title="Collapse catalog"
            onClick={() => setPanelCollapsed(true)}
            className="absolute left-1.5 top-1/2 inline-flex h-8 w-8 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-800 hover:text-white"
          >
            <PanelChevron direction="left" />
          </button>
        )}
        {!catalogPanelCollapsed ? (
          <span className="pointer-events-none min-w-0 truncate px-10 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">
            Catalog
          </span>
        ) : null}
      </div>

      {catalogPanelCollapsed ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden py-6">
          <span
            aria-hidden
            className="select-none text-[10px] font-medium uppercase tracking-[0.18em] text-white/45 [writing-mode:vertical-rl] rotate-180"
          >
            Product Catalog
          </span>
        </div>
      ) : null}

      {!catalogPanelCollapsed ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <nav
            className="hidden w-[158px] shrink-0 overflow-y-auto border-r border-white/10 bg-black/20 py-2 pl-1.5 pr-1 sm:block"
            aria-label="Printful catalog categories"
          >
        <ul className="space-y-0.5 pb-2 border-b border-white/10 mb-2">
          <li>
            <div className="flex items-start gap-0.5">
              <button
                type="button"
                aria-label={productsOpen ? 'Collapse My Products' : 'Expand My Products'}
                onClick={() => setProductsOpen((open) => !open)}
                className="mt-0.5 shrink-0 px-0.5 text-[10px] text-white/40 hover:text-white/70"
              >
                {productsOpen ? '▾' : '▸'}
              </button>
              <button
                type="button"
                onClick={() => pickProductFolder('all')}
                className={`min-w-0 flex-1 rounded px-2 py-1 text-left text-[11px] leading-snug ${
                  productFolder === 'all'
                    ? 'bg-white font-medium text-black'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              >
                My Products
              </button>
            </div>
            {productsOpen && (
              <ul className="ml-2 space-y-0.5 border-l border-white/10 pl-1.5">
                {PRODUCT_FOLDERS.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      onClick={() => pickProductFolder(folder.id)}
                      className={`w-full rounded px-2 py-0.5 text-left text-[10px] leading-snug ${
                        productFolder === folder.id
                          ? 'bg-white font-medium text-black'
                          : 'text-white/65 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {folder.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
          {navTop.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => pickNav(item)}
                className={`w-full text-left px-2 py-1 rounded text-[11px] leading-snug ${
                  !productFolder && activeNavId === item.id
                    ? 'bg-white text-black font-medium'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-1">
          <CategoryTree
            nodes={roots}
            depth={0}
            activeCategoryId={activeCategoryId}
            expanded={expanded}
            onToggleExpand={(id) =>
              setExpanded((current) => {
                const next = new Set(current)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
            onPickCategory={pickCategory}
          />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/20 px-3 py-2">
          <p className="text-[10px] font-medium tracking-[0.18em] uppercase text-white/40">
            {productFolder ? 'My products' : 'Products'}
          </p>
          <span className="text-[10px] text-white/45 truncate flex-1">{summary}</span>
          <button
            type="button"
            disabled={syncing}
            onClick={() => syncCatalog()}
            className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-[10px] uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            {syncing ? '…' : 'Sync'}
          </button>
        </div>

        <div className="sm:hidden border-b border-white/10 bg-black/20 px-2 py-2 overflow-x-auto">
          <div className="flex gap-1 w-max">
            <button
              type="button"
              onClick={() => pickProductFolder('all')}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${
                productFolder === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white/70'
              }`}
            >
              My Products
            </button>
            {PRODUCT_FOLDERS.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => pickProductFolder(folder.id)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${
                  productFolder === folder.id ? 'bg-white text-black' : 'bg-white/10 text-white/70'
                }`}
              >
                {folder.label}
              </button>
            ))}
            {navTop.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pickNav(item)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${
                  !productFolder && activeNavId === item.id ? 'bg-white text-black' : 'bg-white/10 text-white/70'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-white/10 bg-black/10 px-3 py-2">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={productFolder ? 'Search my products…' : 'Search products…'}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-white/35"
          />
        </div>
        {productFolder === 'all' ? (
          <div className="border-b border-white/10 bg-black/10 px-3 pb-2">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/40 p-1" role="tablist" aria-label="Product status">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusTab === tab.id}
                  onClick={() => setStatusTab((current) => (current === tab.id ? null : tab.id))}
                  className={`rounded-lg px-1 py-1.5 text-[10px] font-semibold leading-tight ${
                    statusTab === tab.id ? 'bg-white text-black' : 'text-white/65 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div ref={productListRef} className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
          {productFolder && (
            <>
              {designNote && (
                <p className="text-[11px] text-sky-100/90 bg-sky-400/10 border border-sky-400/25 rounded-lg px-2 py-1">
                  {designNote}
                </p>
              )}
              {visibleDesigns.length === 0 && (
                <p className="py-4 text-center text-xs text-white/45">
                  {q.trim()
                  ? 'No designs match that search.'
                  : productFolder === 'all' && !statusTab
                    ? 'No designs yet.'
                    : productFolder === 'all' && statusTab === 'draft'
                      ? 'No drafts yet.'
                      : productFolder === 'all' && statusTab === 'live'
                        ? 'Nothing public yet.'
                        : productFolder === 'all' && statusTab === 'hidden'
                          ? 'Nothing hidden yet.'
                    : productFolder === 'draft'
                      ? 'No drafts yet.'
                      : productFolder === 'live'
                        ? 'Nothing public yet.'
                        : 'Nothing hidden yet.'}
                </p>
              )}
              {openGroup ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpenItemGroup(null)
                    productListRef.current?.scrollTo({ top: 0 })
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <span aria-hidden>←</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-white">{openGroup.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/40">
                    {openGroup.designs.length === 1 ? '1 product' : `${openGroup.designs.length} products`}
                  </span>
                </button>
              ) : null}
              <div
                className="grid grid-cols-2 gap-2 xl:grid-cols-3"
                onDragOver={(event) => {
                  if (!dragIdRef.current || !canReorder) return
                  event.preventDefault()
                }}
              >
                {(openGroup ? itemGroups.filter((group) => group.key === openGroup.key) : itemGroups).map((group) => {
                  if (!openGroup) {
                    const covers = group.designs
                      .map((design) => designCoverUrl(design))
                      .filter((url): url is string => Boolean(url))
                    return (
                      <ItemGroupFolderTile
                        key={group.key}
                        label={group.label}
                        count={group.designs.length}
                        covers={covers}
                        onOpen={() => {
                          setOpenItemGroup(group.key)
                          productListRef.current?.scrollTo({ top: 0 })
                        }}
                      />
                    )
                  }
                  return group.designs.map((design) => {
                  const statusLabel = FOLDER_LABEL[design.status]
                  const photos = productPhotoUrls(design)
                  const photosOpen = openPhotoIds.has(design.id)
                  return (
                    <div
                      key={design.id}
                      className={`overflow-hidden rounded-xl border bg-black/25 text-left transition ${
                        photosOpen ? 'col-span-full' : ''
                      } ${designMenu?.design.id === design.id ? 'border-white/40' : 'border-white/10'} ${
                        draggingId === design.id ? 'opacity-40' : ''
                      } ${designActionId === design.id ? 'opacity-60' : ''}`}
                    >
                    <button
                      type="button"
                      draggable={canReorder}
                      title={canReorder ? 'Drag to reorder' : undefined}
                      onClick={() => {
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false
                          return
                        }
                        onOpenDesign?.(design)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setDesignMenu({ design, x: event.clientX, y: event.clientY })
                      }}
                      onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                        dragIdRef.current = design.id
                        dragMovedRef.current = false
                        suppressClickRef.current = true
                        setDraggingId(design.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', design.id)
                      }}
                      onDragOver={(event) => {
                        if (!dragIdRef.current || !canReorder) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        moveDraggedDesign(design.id)
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        dragDroppedRef.current = true
                        void commitDesignOrder()
                      }}
                      onDragEnd={() => {
                        if (!dragDroppedRef.current) setOrder(null)
                        dragDroppedRef.current = false
                        dragMovedRef.current = false
                        dragIdRef.current = null
                        setDraggingId(null)
                      }}
                      className={`block w-full bg-transparent text-left transition hover:bg-white/[0.03] ${
                        canReorder ? 'cursor-grab active:cursor-grabbing' : ''
                      }`}
                    >
                      <span className={photosOpen ? 'flex items-center gap-3 p-2' : ''}>
                        <span className={`relative block overflow-hidden ${photosOpen ? 'h-16 w-16 shrink-0 rounded-lg' : 'aspect-square'}`}>
                          <MerchDesignPreviewThumb
                            design={design}
                            matColor={
                              productMats && productMats[design.id] != null
                                ? productMatColor(productMats[design.id])
                                : undefined
                            }
                          />
                        </span>
                        <span className="block p-2">
                          <span className="line-clamp-2 text-[11px] font-medium leading-snug text-white">
                            {design.name}
                          </span>
                          <span className="mt-1 block text-[10px] text-white/45">{statusLabel}</span>
                        </span>
                      </span>
                    </button>
                    {photos.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={photosOpen}
                        onClick={() =>
                          setOpenPhotoIds((current) => {
                            const next = new Set(current)
                            if (next.has(design.id)) next.delete(design.id)
                            else next.add(design.id)
                            return next
                          })
                        }
                        className="flex w-full items-center justify-between border-t border-white/10 px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/55 hover:text-white"
                      >
                        <span>{photos.length === 1 ? '1 photo' : `${photos.length} photos`}</span>
                        <span aria-hidden className={`inline-block transition ${photosOpen ? 'rotate-180' : ''}`}>
                          ▾
                        </span>
                      </button>
                    ) : null}
                    {photosOpen ? (
                      <div className="grid grid-cols-3 gap-1.5 border-t border-white/10 p-2">
                        {photos.map((url) => (
                          <button
                            key={url}
                            type="button"
                            title="Open this product"
                            onClick={() => onOpenDesign?.(design)}
                            className="aspect-square overflow-hidden rounded bg-black/40 hover:ring-1 hover:ring-white/40"
                          >
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    </div>
                  )
                  })
                })}
              </div>
            </>
          )}

          {!productFolder && showWidgets && (
            <div className="catalog-widgets space-y-2">
              {PROMO_WIDGETS.map((widget) => (
                <button
                  key={widget.id}
                  type="button"
                  onClick={() => {
                    setProductFolder(null)
                    setActiveNavId(widget.navId)
                    setActiveCategoryId(widget.categoryId)
                    setSectionTitle(widget.title.split('—')[0]?.trim() || widget.title)
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-left hover:border-white/20 transition"
                >
                  <p className="text-sm font-semibold text-white">{widget.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/50">{widget.body}</p>
                </button>
              ))}
            </div>
          )}

          {note && (
            <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2 py-1">
              {note}
            </p>
          )}

          {!productFolder && loading && products.length === 0 && (
            <p className="text-xs text-white/45 py-4 text-center">Loading from Printful…</p>
          )}

          {!productFolder && !loading && products.length === 0 && (
            <p className="text-xs text-white/45 py-4 text-center">No products in this category.</p>
          )}

          {!productFolder && (
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {products.map((product) => {
              const active = activeCatalogId === product.id
              const favorited = favorites.includes(product.id)
              return (
                <div
                  key={product.id}
                  className={`group relative rounded-xl border bg-black/25 overflow-hidden transition ${
                    active ? 'border-white ring-1 ring-white/30' : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={favorited ? 'Remove favorite' : 'Add favorite'}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleFavorite(product.id)
                    }}
                    className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/70 px-1.5 py-0.5 text-xs text-amber-300"
                  >
                    {favorited ? '★' : '☆'}
                  </button>
                  <button type="button" onClick={() => onSelect(product)} className="block w-full text-left">
                    <span className="relative block aspect-square bg-[#2a2a2a]">
                      {product.image ? (
                        <img src={product.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[10px] text-white/35">No image</span>
                      )}
                    </span>
                    <span className="block p-2">
                      <span className="line-clamp-2 text-[11px] font-medium leading-snug text-white">{product.title}</span>
                      <span className="mt-1 block text-[10px] text-white/45">{product.variantCount} variants</span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
          )}
        </div>
      </div>
        </div>
      ) : null}
      <StudioContextMenu
        open={Boolean(designMenu)}
        x={designMenu?.x ?? 0}
        y={designMenu?.y ?? 0}
        title={designMenu?.design.name || 'Product'}
        items={designMenuItems}
        onClose={() => setDesignMenu(null)}
      />
    </div>
  )
}

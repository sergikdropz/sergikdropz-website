'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MerchDesignPreviewThumb from '@/components/admin/MerchDesignPreviewThumb'
import type { DesignStatus, MerchDesign } from '@/lib/merch/design'
import type { PrintfulCatalogProduct } from '@/lib/merch/printful-catalog-types'
import type { CatalogNavItem, PrintfulCategoryNode } from '@/lib/merch/printful-categories'

const FAVORITES_KEY = 'sergwear-catalog-favorites'

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

  useEffect(() => {
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

  const visibleDesigns = useMemo(() => {
    if (!productFolder) return []
    const query = q.trim().toLowerCase()
    return designs.filter((design) => {
      if (productFolder !== 'all' && design.status !== productFolder) return false
      if (!query) return true
      return design.name.toLowerCase().includes(query)
    })
  }, [designs, productFolder, q])

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

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 text-white"
      style={studioBg}
    >
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

        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
          {productFolder && (
            <>
              {visibleDesigns.length === 0 && (
                <p className="py-4 text-center text-xs text-white/45">
                  {q.trim()
                  ? 'No designs match that search.'
                  : productFolder === 'all'
                    ? 'No designs yet.'
                    : productFolder === 'draft'
                      ? 'No drafts yet.'
                      : productFolder === 'live'
                        ? 'Nothing public yet.'
                        : 'Nothing hidden yet.'}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {visibleDesigns.map((design) => {
                  const statusLabel = FOLDER_LABEL[design.status]
                  return (
                    <button
                      key={design.id}
                      type="button"
                      onClick={() => onOpenDesign?.(design)}
                      className="overflow-hidden rounded-xl border border-white/10 bg-black/25 text-left transition hover:border-white/25"
                    >
                      <span className="relative block aspect-square bg-[#2a2a2a]">
                        <MerchDesignPreviewThumb design={design} />
                      </span>
                      <span className="block p-2">
                        <span className="line-clamp-2 text-[11px] font-medium leading-snug text-white">
                          {design.name}
                        </span>
                        <span className="mt-1 block text-[10px] text-white/45">{statusLabel}</span>
                      </span>
                    </button>
                  )
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
  )
}

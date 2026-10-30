'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import MerchGarmentPreview from '@/components/shop/MerchGarmentPreview'
import {
  designToShopProduct,
  shopCategoryOf,
  sortMerchDesigns,
  type MerchDesign,
  type ShopMerchProduct,
} from '@/lib/merch/design'
import { SHOP_CATEGORIES, type ShopCategoryId } from '@/lib/merch/shop-categories'
import {
  DEFAULT_SHOP_BACKDROP,
  parseShopBackdrop,
  readShopBackdrop,
  shopBackdropIsOriginal,
  writeShopBackdrop,
  type ShopBackdrop,
} from '@/lib/merch/studio-session'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

const BACKDROP_SWATCHES = [
  { label: 'White', color: '#ffffff' },
  { label: 'Light', color: '#d2d2d2' },
  { label: 'Mid', color: '#808080' },
  { label: 'Dark', color: '#2c2c2c' },
  { label: 'Black', color: '#000000' },
]

type ShopBackdropApi = {
  backdrop: ShopBackdrop
  openMenu: (event: MouseEvent) => void
}

const ShopBackdropContext = createContext<ShopBackdropApi | null>(null)

function useShopBackdrop(): ShopBackdropApi | null {
  return useContext(ShopBackdropContext)
}

type ShopFilter = 'all' | ShopCategoryId

type SyncedProduct = {
  id: string
  name: string
  slug: string
  thumbnail?: string
  category?: string
  variants?: Array<{ retail_price?: number }>
}

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

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function designPriceLabel(design: MerchDesign): string {
  const prices = design.variants.map((variant) => variant.retailPrice).filter((price) => price > 0)
  const amount = prices.length > 0 ? Math.min(...prices) : design.retailPrice
  const formatted = money(Number.isFinite(amount) ? amount : 0)
  return prices.length > 1 ? `From ${formatted}` : formatted
}

function syncedPriceLabel(product: SyncedProduct): string {
  const prices = (product.variants || []).map((variant) => Number(variant.retail_price)).filter((price) => price > 0)
  if (prices.length === 0) return ''
  const formatted = money(Math.min(...prices))
  return prices.length > 1 ? `From ${formatted}` : formatted
}

export default function MerchAdminShop({ onOpenDesign }: { onOpenDesign: (designId: string) => void }) {
  const [designs, setDesigns] = useState<MerchDesign[]>([])
  const [synced, setSynced] = useState<SyncedProduct[]>([])
  const [filter, setFilter] = useState<ShopFilter>('all')
  const [note, setNote] = useState<string | null>(null)
  const [noteError, setNoteError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [orderPreview, setOrderPreview] = useState<string[] | null>(null)
  const [backdrop, setBackdrop] = useState<ShopBackdrop>(DEFAULT_SHOP_BACKDROP)
  const [publishedBackdrop, setPublishedBackdrop] = useState<ShopBackdrop>(DEFAULT_SHOP_BACKDROP)
  const [backdropMenu, setBackdropMenu] = useState<{ x: number; y: number } | null>(null)
  const [backdropSaving, setBackdropSaving] = useState(false)
  const dragIdRef = useRef<string | null>(null)
  const dragMovedRef = useRef(false)
  const previewRef = useRef<string[] | null>(null)
  previewRef.current = orderPreview

  const load = useCallback(async () => {
    try {
      const [designRes, shopRes] = await Promise.all([
        fetch('/api/admin/merch/designs'),
        fetch('/api/merch/products'),
      ])
      const designData = await designRes.json().catch(() => ({}))
      const shopData = await shopRes.json().catch(() => ({}))
      if (!designRes.ok) throw new Error(designData.error || 'Could not load designs')
      const nextDesigns: MerchDesign[] = Array.isArray(designData.designs) ? designData.designs : []
      setDesigns(nextDesigns)
      const slugs = new Set(nextDesigns.map((design) => design.slug))
      const rows = Array.isArray(shopData.products) ? shopData.products : []
      setSynced(
        rows.filter(
          (product: { source?: string; slug?: string }) =>
            product?.source !== 'design' && Boolean(product?.slug) && !slugs.has(String(product.slug)),
        ),
      )
    } catch (error) {
      setNoteError(true)
      setNote(error instanceof Error ? error.message : 'Could not load the shop')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/merch/backdrop')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const next = data?.backdrop ? parseShopBackdrop(data.backdrop) : readShopBackdrop()
        setBackdrop(next)
        setPublishedBackdrop(next)
        writeShopBackdrop(next)
      })
      .catch(() => {
        if (!cancelled) setBackdrop(readShopBackdrop())
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!backdropMenu) return
    const close = (event: PointerEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[aria-label="Shop backgrounds"]')) return
      setBackdropMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBackdropMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [backdropMenu])

  const updateBackdrop = (next: ShopBackdrop) => {
    const value = parseShopBackdrop(next)
    setBackdrop(value)
    writeShopBackdrop(value)
  }

  const savePublicBackdrop = useCallback(async () => {
    const value = parseShopBackdrop(backdrop)
    setBackdropSaving(true)
    try {
      const res = await fetch('/api/admin/merch/backdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the public shop backdrop.')
      const saved = parseShopBackdrop(data.backdrop ?? value)
      setBackdrop(saved)
      setPublishedBackdrop(saved)
      writeShopBackdrop(saved)
      setNoteError(false)
      setNote('Public shop backdrop saved to the live shop.')
    } catch (error) {
      setNoteError(true)
      setNote(error instanceof Error ? error.message : 'Could not save the public shop backdrop.')
    } finally {
      setBackdropSaving(false)
    }
  }, [backdrop])

  const openBackdropMenu = useCallback((event: MouseEvent) => {
    const target = event.target
    if (target instanceof Element && target.closest('button, a, select, input, textarea, label')) return
    event.preventDefault()
    event.stopPropagation()
    const menuWidth = 240
    const menuHeight = 340
    setBackdropMenu({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    })
  }, [])

  const backdropApi = useMemo(
    () => ({ backdrop, openMenu: openBackdropMenu }),
    [backdrop, openBackdropMenu],
  )

  const serverOrder = useMemo(() => sortMerchDesigns(designs).map((design) => design.id), [designs])

  const orderedDesigns = useMemo(() => {
    const rank = new Map((orderPreview ?? serverOrder).map((id, index) => [id, index]))
    return [...designs].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
  }, [designs, orderPreview, serverOrder])

  useEffect(() => {
    if (!orderPreview) return
    if (orderPreview.join('|') === serverOrder.join('|')) setOrderPreview(null)
  }, [orderPreview, serverOrder])

  const inFilter = useCallback(
    (categoryId: string) => filter === 'all' || categoryId === filter,
    [filter],
  )

  const liveDesigns = useMemo(
    () => orderedDesigns.filter((design) => design.status === 'live' && inFilter(shopCategoryOf(design))),
    [orderedDesigns, inFilter],
  )
  const heldDesigns = useMemo(
    () => orderedDesigns.filter((design) => design.status !== 'live' && inFilter(shopCategoryOf(design))),
    [orderedDesigns, inFilter],
  )
  const syncedInFilter = useMemo(
    () => synced.filter((product) => inFilter(product.category || 'tees')),
    [synced, inFilter],
  )
  const liveIds = useMemo(() => liveDesigns.map((design) => design.id), [liveDesigns])
  const canReorder = liveIds.length > 1

  const categoryFolders = useMemo(() => {
    return SHOP_CATEGORIES.map((category) => {
      const live = orderedDesigns.filter(
        (design) => design.status === 'live' && shopCategoryOf(design) === category.id,
      )
      const held = orderedDesigns.filter(
        (design) => design.status !== 'live' && shopCategoryOf(design) === category.id,
      )
      const syncedInCategory = synced.filter((product) => (product.category || 'tees') === category.id)
      return { id: category.id, label: category.label, live, held, synced: syncedInCategory }
    }).filter((folder) => folder.live.length + folder.held.length + folder.synced.length > 0)
  }, [orderedDesigns, synced])

  const commitOrder = async (ids: string[]) => {
    try {
      const res = await fetch('/api/admin/merch/designs/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save that order')
      if (Array.isArray(data.designs)) setDesigns(data.designs)
      setNoteError(false)
      setNote('Shop order saved.')
    } catch (error) {
      setOrderPreview(null)
      setNoteError(true)
      setNote(error instanceof Error ? error.message : 'Could not save that order.')
    }
  }

  const moveDesign = (fromId: string, toId: string, save: boolean) => {
    if (!canReorder || fromId === toId) return
    const base = previewRef.current ?? serverOrder
    const next = reorderVisibleIds(base, liveIds, fromId, toId)
    if (next.join('|') === base.join('|')) return
    dragMovedRef.current = true
    setOrderPreview(next)
    previewRef.current = next
    if (save) void commitOrder(next)
  }

  const moveBy = (id: string, delta: number) => {
    const index = liveIds.indexOf(id)
    const target = liveIds[index + delta]
    if (!target) return
    dragMovedRef.current = false
    moveDesign(id, target, true)
  }

  const replaceDesign = (next: MerchDesign) => {
    setDesigns((current) => current.map((design) => (design.id === next.id ? next : design)))
  }

  const setVisibility = async (design: MerchDesign, status: 'live' | 'hidden') => {
    setBusyId(design.id)
    setNote(null)
    setNoteError(false)
    try {
      const res = await fetch(`/api/admin/merch/designs/${design.id}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update the shop')
      if (data.design) replaceDesign(data.design)
      setNoteError(false)
      setNote(status === 'live' ? 'On the public shop.' : 'Hidden from the public shop.')
    } catch (error) {
      setNoteError(true)
      setNote(error instanceof Error ? error.message : 'Could not update the shop.')
    } finally {
      setBusyId(null)
    }
  }

  const setCategory = async (design: MerchDesign, category: ShopCategoryId) => {
    if (shopCategoryOf(design) === category && design.shopCategory === category) return
    setBusyId(design.id)
    setNote(null)
    setNoteError(false)
    try {
      const res = await fetch(`/api/admin/merch/designs/${design.id}/shop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the category')
      if (data.design) replaceDesign(data.design)
      setNoteError(false)
      setNote('Category saved on the public shop.')
    } catch (error) {
      setNoteError(true)
      setNote(error instanceof Error ? error.message : 'Could not save the category.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ShopBackdropContext.Provider value={backdropApi}>
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">Merch Shop</p>
        <h1 className="font-six-caps text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl">Merch</h1>
        <p className="mx-auto mt-3 max-w-xl text-gray-400">Rep the sound. Print-on-demand, shipped worldwide.</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
          {filter === 'all'
            ? 'Each category is a folder. Open one to reorder, hide, or edit what fans see.'
            : 'Drag a live product to change the order fans see. Category and visibility save straight to the shop.'}
        </p>
        <a
          href="/shop/merch"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm text-gray-500 transition hover:text-gray-300"
        >
          Open the public shop
        </a>
      </div>

      {note && (
        <p className={`mb-4 text-center text-sm ${noteError ? 'text-red-300' : 'text-emerald-300'}`}>{note}</p>
      )}

      <div className="mb-6 flex flex-wrap justify-center gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </FilterChip>
        {SHOP_CATEGORIES.map((category) => (
          <FilterChip key={category.id} active={filter === category.id} onClick={() => setFilter(category.id)}>
            {category.label}
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-lg bg-gray-800" />
          ))}
        </div>
      ) : (
        <>
          {filter === 'all' ? (
            categoryFolders.length === 0 ? (
              <p className="py-12 text-center text-gray-400">Nothing in this category is on the shop yet.</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-4">
                {categoryFolders.map((folder) => (
                  <ShopFolderTile
                    key={folder.id}
                    label={folder.label}
                    count={folder.live.length + folder.held.length + folder.synced.length}
                    heldCount={folder.held.length}
                    covers={folderCovers(folder)}
                    onOpen={() => setFilter(folder.id)}
                  />
                ))}
              </div>
            )
          ) : liveDesigns.length === 0 && syncedInFilter.length === 0 ? (
            <p className="py-12 text-center text-gray-400">Nothing in this category is on the shop yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {liveDesigns.map((design, index) => (
                <DesignShopCard
                  key={design.id}
                  design={design}
                  busy={busyId === design.id}
                  dragging={draggingId === design.id}
                  canReorder={canReorder}
                  canEarlier={index > 0}
                  canLater={index < liveDesigns.length - 1}
                  onOpen={() => onOpenDesign(design.id)}
                  onCategory={(category) => void setCategory(design, category)}
                  onHide={() => void setVisibility(design, 'hidden')}
                  onEarlier={() => moveBy(design.id, -1)}
                  onLater={() => moveBy(design.id, 1)}
                  onDragStart={() => {
                    dragIdRef.current = design.id
                    dragMovedRef.current = false
                    setDraggingId(design.id)
                  }}
                  onDragOver={() => {
                    const fromId = dragIdRef.current
                    if (fromId) moveDesign(fromId, design.id, false)
                  }}
                  onDragEnd={() => {
                    const ids = previewRef.current
                    setDraggingId(null)
                    dragIdRef.current = null
                    if (ids && dragMovedRef.current) void commitOrder(ids)
                    dragMovedRef.current = false
                  }}
                />
              ))}
              {syncedInFilter.map((product) => (
                <SyncedShopCard key={product.slug} product={product} />
              ))}
            </div>
          )}

          {filter !== 'all' && heldDesigns.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Not on the shop
              </h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {heldDesigns.map((design) => (
                  <DesignShopCard
                    key={design.id}
                    design={design}
                    busy={busyId === design.id}
                    dragging={false}
                    canReorder={false}
                    canEarlier={false}
                    canLater={false}
                    onOpen={() => onOpenDesign(design.id)}
                    onCategory={(category) => void setCategory(design, category)}
                    onHide={() => void setVisibility(design, 'live')}
                    onEarlier={() => undefined}
                    onLater={() => undefined}
                    onDragStart={() => undefined}
                    onDragOver={() => undefined}
                    onDragEnd={() => undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {backdropMenu ? (
        <ShopBackdropMenu
          backdrop={backdrop}
          published={publishedBackdrop}
          x={backdropMenu.x}
          y={backdropMenu.y}
          saving={backdropSaving}
          onChange={updateBackdrop}
          onSave={() => void savePublicBackdrop()}
        />
      ) : null}
    </div>
    </ShopBackdropContext.Provider>
  )
}

type ShopFolder = {
  live: MerchDesign[]
  held: MerchDesign[]
  synced: SyncedProduct[]
}

type FolderCover = { kind: 'design'; design: MerchDesign } | { kind: 'synced'; product: SyncedProduct }

function folderCovers(folder: ShopFolder): FolderCover[] {
  return [
    ...folder.live.map((design) => ({ kind: 'design' as const, design })),
    ...folder.synced.map((product) => ({ kind: 'synced' as const, product })),
    ...folder.held.map((design) => ({ kind: 'design' as const, design })),
  ].slice(0, 4)
}

function mosaicClass(count: number): string {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  return 'grid-cols-2 grid-rows-2'
}

function ShopFolderTile({
  label,
  count,
  heldCount,
  covers,
  onOpen,
}: {
  label: string
  count: number
  heldCount: number
  covers: FolderCover[]
  onOpen: () => void
}) {
  const cells = covers.length >= 3 ? [...covers, null, null, null, null].slice(0, 4) : covers.length > 0 ? covers : [null]
  const countLabel = count === 1 ? '1 product' : `${count} products`
  const detail = heldCount > 0 ? `${countLabel} · ${heldCount} off the shop` : countLabel
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}, ${detail}`}
      className="group w-[min(100%,24rem)] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/25 text-center transition hover:border-white/30"
    >
      <span className="block px-4 pb-2.5 pt-4 text-center">
        <span className="block truncate text-xl font-semibold text-white">{label}</span>
        <span className="mt-1.5 block text-sm uppercase tracking-[0.14em] text-white/45">{detail}</span>
      </span>
      <span className="relative block px-4 pb-4">
        <span
          className="absolute left-1/2 top-0 h-4 w-16 -translate-x-1/2 rounded-t-md border border-b-0 border-white/15 bg-white/15 group-hover:bg-white/25"
          aria-hidden
        />
        <span className={`relative mt-3 grid aspect-square gap-px overflow-hidden rounded-lg bg-black ${mosaicClass(covers.length)}`}>
          {cells.map((cover, index) => (
            <FolderCoverCell key={cover ? coverKey(cover) : `empty-${index}`} cover={cover} />
          ))}
        </span>
      </span>
    </button>
  )
}

function coverKey(cover: FolderCover): string {
  return cover.kind === 'design' ? cover.design.id : cover.product.slug
}

function FolderCoverCell({ cover }: { cover: FolderCover | null }) {
  const shopBackdrop = useShopBackdrop()
  if (!cover) {
    return <span className="relative min-h-0 overflow-hidden bg-white/[0.04]" />
  }
  if (cover.kind === 'synced') {
    const thumbnail = cover.product.thumbnail ? resolveImageUrl(cover.product.thumbnail) : ''
    return (
      <span className="relative min-h-0 overflow-hidden bg-white">
        {thumbnail ? <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      </span>
    )
  }
  const preview = designToShopProduct({ ...cover.design, status: 'live' }) as ShopMerchProduct | null
  const mat = previewMat(shopBackdrop?.backdrop)
  return (
    <span
      className={`relative block h-full min-h-0 overflow-hidden ${mat ? '' : 'bg-white'}`}
      style={mat ? { backgroundColor: mat.opacity < 1 ? 'transparent' : mat.color } : undefined}
      onContextMenu={(event) => shopBackdrop?.openMenu(event)}
    >
      {preview?.designPreview ? (
        <MerchGarmentPreview
          design={preview.designPreview}
          preferLayout
          matColor={mat?.color}
          matOpacity={mat && mat.opacity < 1 ? mat.opacity : undefined}
        />
      ) : (
        <span className="absolute inset-0" style={{ background: cover.design.previewColor || '#111' }} />
      )}
    </span>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
        active ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function DesignShopCard({
  design,
  busy,
  dragging,
  canReorder,
  canEarlier,
  canLater,
  onOpen,
  onCategory,
  onHide,
  onEarlier,
  onLater,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  design: MerchDesign
  busy: boolean
  dragging: boolean
  canReorder: boolean
  canEarlier: boolean
  canLater: boolean
  onOpen: () => void
  onCategory: (category: ShopCategoryId) => void
  onHide: () => void
  onEarlier: () => void
  onLater: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
}) {
  const preview = designToShopProduct({ ...design, status: 'live' }) as ShopMerchProduct | null
  const category = shopCategoryOf(design)
  const onShop = design.status === 'live'
  const shopBackdrop = useShopBackdrop()
  const mat = previewMat(shopBackdrop?.backdrop)

  return (
    <article
      className={`overflow-hidden rounded-lg border border-gray-800 bg-gray-900/50 ${dragging ? 'opacity-40' : ''} ${
        busy ? 'opacity-60' : ''
      }`}
      onDragOver={(event) => {
        if (!canReorder) return
        event.preventDefault()
        onDragOver()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDragEnd()
      }}
    >
      <div
        className={`relative aspect-square overflow-hidden ${mat ? '' : 'bg-white'}`}
        style={mat ? { backgroundColor: mat.opacity < 1 ? 'transparent' : mat.color } : undefined}
        onContextMenu={(event) => shopBackdrop?.openMenu(event)}
      >
        {canReorder && (
          <button
            type="button"
            draggable
            title="Drag to reorder"
            aria-label={`Drag ${design.name}`}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white"
          >
            Drag
          </button>
        )}
        {preview?.designPreview ? (
          <MerchGarmentPreview
            design={preview.designPreview}
            preferLayout
            matColor={mat?.color}
            matOpacity={mat && mat.opacity < 1 ? mat.opacity : undefined}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: design.previewColor || '#111' }} />
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-white">{design.name}</h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-bold text-white">{designPriceLabel(design)}</span>
          <span className="text-xs uppercase tracking-wide text-gray-500">{category}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`shop-category-${design.id}`}>
            Category for {design.name}
          </label>
          <select
            id={`shop-category-${design.id}`}
            value={category}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value
              if (next === 'tees' || next === 'hoodies' || next === 'hats' || next === 'pants' || next === 'accessories') {
                onCategory(next)
              }
            }}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-gray-200"
          >
            {SHOP_CATEGORIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={onHide}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:border-white/30"
          >
            {onShop ? 'Hide' : 'Put on shop'}
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:border-white/30"
          >
            Edit
          </button>
          {canReorder && (
            <>
              <button
                type="button"
                disabled={!canEarlier || busy}
                onClick={onEarlier}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:border-white/30 disabled:opacity-30"
              >
                Earlier
              </button>
              <button
                type="button"
                disabled={!canLater || busy}
                onClick={onLater}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:border-white/30 disabled:opacity-30"
              >
                Later
              </button>
            </>
          )}
        </div>
        {!onShop && (
          <p className="mt-2 text-[11px] uppercase tracking-wide text-amber-300/90">
            {design.status === 'draft' ? 'Draft' : 'Hidden'}
          </p>
        )}
      </div>
    </article>
  )
}

function previewMat(backdrop: ShopBackdrop | undefined): ShopBackdrop | null {
  if (!backdrop || shopBackdropIsOriginal(backdrop)) return null
  return backdrop
}

function shopBackdropEqual(a: ShopBackdrop, b: ShopBackdrop): boolean {
  const left = parseShopBackdrop(a)
  const right = parseShopBackdrop(b)
  return left.color === right.color && Math.abs(left.opacity - right.opacity) < 0.001
}

function ShopBackdropMenu({
  backdrop,
  published,
  x,
  y,
  saving,
  onChange,
  onSave,
}: {
  backdrop: ShopBackdrop
  published: ShopBackdrop
  x: number
  y: number
  saving: boolean
  onChange: (next: ShopBackdrop) => void
  onSave: () => void
}) {
  const original = shopBackdropIsOriginal(backdrop)
  const opacity = Math.round(backdrop.opacity * 100)
  const dirty = !shopBackdropEqual(backdrop, published)
  return (
    <div
      role="menu"
      aria-label="Shop backgrounds"
      className="fixed z-[90] w-60 space-y-3 rounded-xl border border-white/15 bg-zinc-950 p-3 text-white shadow-2xl"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-white/55">Public shop</span>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={original}
          onClick={() => onChange(DEFAULT_SHOP_BACKDROP)}
          className={`rounded-md px-2 py-1 text-[11px] ${
            original ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
          }`}
        >
          Original
        </button>
      </div>
      <div className="flex gap-1.5">
        {BACKDROP_SWATCHES.map((swatch) => (
          <button
            key={swatch.label}
            type="button"
            role="menuitemradio"
            aria-label={swatch.label}
            aria-checked={backdrop.color === swatch.color}
            title={swatch.label}
            onClick={() => onChange({ ...backdrop, color: swatch.color })}
            className={`h-7 flex-1 rounded-md border ${
              backdrop.color === swatch.color ? 'border-white' : 'border-white/20'
            }`}
            style={{ backgroundColor: swatch.color }}
          />
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 text-[11px] text-white/70">
        Color
        <input
          type="color"
          aria-label="Background color"
          value={backdrop.color}
          onChange={(event) => onChange({ ...backdrop, color: event.target.value })}
          className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent"
        />
      </label>
      <label className="block space-y-1">
        <span className="flex items-center justify-between text-[11px] text-white/70">
          Opacity
          <span className="tabular-nums text-white/40">{opacity}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          aria-label="Background opacity"
          value={opacity}
          onChange={(event) => onChange({ ...backdrop, opacity: Number(event.target.value) / 100 })}
          className="w-full accent-white"
        />
      </label>
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={onSave}
        className="w-full rounded-md bg-white py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save to live shop'}
      </button>
      <p className="text-center text-[10px] leading-snug text-white/45">
        Preview updates here first. Save pushes the backdrop to the public shop.
      </p>
    </div>
  )
}

function SyncedShopCard({ product }: { product: SyncedProduct }) {
  const thumbnail = product.thumbnail ? resolveImageUrl(product.thumbnail) : ''
  const shopBackdrop = useShopBackdrop()
  const mat = previewMat(shopBackdrop?.backdrop)
  return (
    <article className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900/50">
      <div
        className={`relative aspect-square overflow-hidden ${mat ? '' : 'bg-white'}`}
        style={mat ? { backgroundColor: mat.opacity < 1 ? 'transparent' : mat.color } : undefined}
        onContextMenu={(event) => shopBackdrop?.openMenu(event)}
      >
        {thumbnail ? (
          <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-neutral-200" />
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-white">{product.name}</h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-bold text-white">{syncedPriceLabel(product)}</span>
          <span className="text-xs uppercase tracking-wide text-gray-500">{product.category || 'tees'}</span>
        </div>
        <a
          href={`/shop/merch/${product.slug}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs text-gray-400 hover:text-white"
        >
          Synced from Printful
        </a>
      </div>
    </article>
  )
}

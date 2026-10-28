import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { printfulCatalogFetch } from '@/lib/printful'

export type PrintfulCategoryNode = {
  id: number
  parentId: number
  title: string
  imageUrl: string | null
  position: number
  children: PrintfulCategoryNode[]
}

export type CatalogNavItem = {
  id: string
  label: string
  kind: 'virtual' | 'category'
  categoryId?: number
}

/** Top of Printful catalog sidebar (matches dashboard order). */
export const PRINTFUL_CATALOG_NAV_TOP: CatalogNavItem[] = [
  { id: 'favorites', label: 'My favorites', kind: 'virtual' },
  { id: 'special-offers', label: 'Special offers', kind: 'virtual' },
  { id: 'cat-303', label: 'DTFlex products', kind: 'category', categoryId: 303 },
  { id: 'cat-287', label: 'Embroidery products', kind: 'category', categoryId: 287 },
  { id: 'cat-305', label: 'All-over print', kind: 'category', categoryId: 305 },
  { id: 'fast-delivery', label: 'Fast delivery', kind: 'virtual' },
  { id: 'cat-123', label: 'New products', kind: 'category', categoryId: 123 },
  { id: 'cat-188', label: 'Bestsellers', kind: 'category', categoryId: 188 },
  { id: 'cat-121', label: 'Eco-friendly', kind: 'category', categoryId: 121 },
  { id: 'cat-277', label: 'All products', kind: 'category', categoryId: 277 },
]

type RawCategory = {
  id: number
  parent_id: number
  title: string
  image_url?: string
  catalog_position?: number
}

export type PrintfulCategorySnapshot = {
  syncedAt: string | null
  roots: PrintfulCategoryNode[]
  flat: Array<{ id: number; parentId: number; title: string }>
}

function categoriesPath() {
  return join(process.cwd(), 'data', 'printful-catalog-categories.json')
}

function buildTree(flat: RawCategory[]): PrintfulCategoryNode[] {
  const nodes = new Map<number, PrintfulCategoryNode>()
  for (const row of flat) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      title: row.title,
      imageUrl: row.image_url ?? null,
      position: row.catalog_position ?? 0,
      children: [],
    })
  }
  const roots: PrintfulCategoryNode[] = []
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node)
    } else if (node.parentId === 0) {
      roots.push(node)
    }
  }
  const sortRec = (list: PrintfulCategoryNode[]) => {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
    list.forEach((child) => sortRec(child.children))
  }
  sortRec(roots)
  return roots
}

export async function syncPrintfulCategoriesFromApi(): Promise<PrintfulCategorySnapshot> {
  const data = await printfulCatalogFetch('/categories')
  const rows = (data?.result?.categories || []) as RawCategory[]
  const roots = buildTree(rows)
  const payload: PrintfulCategorySnapshot = {
    syncedAt: new Date().toISOString(),
    roots,
    flat: rows.map((row) => ({ id: row.id, parentId: row.parent_id, title: row.title })),
  }
  // Best-effort cache write: the serverless filesystem is read-only, so a failed
  // write must not abort the sync. The fresh payload is still returned.
  try {
    await mkdir(join(process.cwd(), 'data'), { recursive: true })
    await writeFile(categoriesPath(), JSON.stringify(payload, null, 2))
  } catch (error) {
    console.error('printful categories cache write:', error)
  }
  return payload
}

export async function readPrintfulCategoriesCache(): Promise<PrintfulCategorySnapshot> {
  try {
    const raw = await readFile(categoriesPath(), 'utf8')
    return JSON.parse(raw) as PrintfulCategorySnapshot
  } catch {
    return { syncedAt: null, roots: [], flat: [] }
  }
}

/** Sidebar tree under pinned nav — mirrors Printful `catalog__sidebar-floating` roots. */
export function catalogSidebarRoots(roots: PrintfulCategoryNode[]): PrintfulCategoryNode[] {
  const pinnedInNav = new Set(['All products'])
  return roots
    .filter((root) => !pinnedInNav.has(root.title))
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
}

/** @deprecated use catalogSidebarRoots */
export function primaryCatalogRoots(roots: PrintfulCategoryNode[]): PrintfulCategoryNode[] {
  return catalogSidebarRoots(roots)
}

export async function fetchProductsForCategory(categoryId: number): Promise<unknown[]> {
  const data = await printfulCatalogFetch(`/products?category_id=${categoryId}`)
  return (data?.result || []) as unknown[]
}

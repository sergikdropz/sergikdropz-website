'use client'

import { useState, useMemo } from 'react'
import ProductCard from './ProductCard'
import ShopFilters from './ShopFilters'

interface Product {
  id: string
  title: string
  slug?: string
  description: string
  price: number
  formatPrices?: { MP3: number; WAV: number }
  artwork?: string
  category?: string
  productType?: string
  licensingEnabled?: boolean
  status?: string
  fanFree?: boolean
  href?: string
  catalogSortDate?: string
}

interface Category {
  id: string
  label: string
}

interface ShopGridProps {
  products: Product[]
  categories: Category[]
  searchPlaceholder?: string
  emptyMessage?: string
  /** Catalog grid: always newest release date first; hide price/name sort. */
  sortByReleaseDateOnly?: boolean
}

const ALL_VIEW_SECTIONS: { categoryId: string; heading: string }[] = [
  { categoryId: 'ep-bundles', heading: 'EPs' },
  { categoryId: 'singles', heading: 'Singles' },
  { categoryId: 'albums', heading: 'Albums' },
]

function sortByNewestReleaseDate(items: Product[]): Product[] {
  return [...items].sort((a, b) =>
    String(b.catalogSortDate || '').localeCompare(String(a.catalogSortDate || '')),
  )
}

function ProductGrid({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((product) => (
        <ProductCard key={product.id} {...product} />
      ))}
    </div>
  )
}

export default function ShopGrid({
  products,
  categories,
  searchPlaceholder = 'Search products…',
  emptyMessage = 'No products found.',
  sortByReleaseDateOnly = false,
}: ShopGridProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('release-date')

  const { filteredProducts, allModeSections } = useMemo(() => {
    let items = products.filter((p) => p.status !== 'inactive')

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    }

    const applySort = (list: Product[]) => {
      if (sortByReleaseDateOnly || sortBy === 'release-date') {
        return sortByNewestReleaseDate(list)
      }
      switch (sortBy) {
        case 'price-low':
          return [...list].sort((a, b) => a.price - b.price)
        case 'price-high':
          return [...list].sort((a, b) => b.price - a.price)
        case 'name-az':
          return [...list].sort((a, b) => a.title.localeCompare(b.title))
        default:
          return sortByNewestReleaseDate(list)
      }
    }

    if (activeCategory === 'all') {
      const sections = ALL_VIEW_SECTIONS.map(({ categoryId, heading }) => ({
        categoryId,
        heading,
        items: applySort(items.filter((p) => p.category === categoryId)),
      })).filter((section) => section.items.length > 0)

      return {
        filteredProducts: applySort(items),
        allModeSections: sections,
      }
    }

    const categoryItems = applySort(
      items.filter((p) => p.category === activeCategory || p.productType === activeCategory),
    )

    return {
      filteredProducts: categoryItems,
      allModeSections: [] as { categoryId: string; heading: string; items: Product[] }[],
    }
  }, [products, activeCategory, searchQuery, sortBy, sortByReleaseDateOnly])

  const showAllModeSections = activeCategory === 'all' && allModeSections.length > 0

  return (
    <div className="space-y-6">
      <ShopFilters
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        resultCount={filteredProducts.length}
        searchPlaceholder={searchPlaceholder}
        sortByReleaseDateOnly={sortByReleaseDateOnly}
      />

      {filteredProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">{emptyMessage}</p>
        </div>
      ) : showAllModeSections ? (
        <div className="space-y-12">
          {allModeSections.map((section) => (
            <div key={section.categoryId} className="space-y-4">
              <h3 className="text-center text-lg font-semibold tracking-wide text-white">{section.heading}</h3>
              <ProductGrid items={section.items} />
            </div>
          ))}
        </div>
      ) : (
        <ProductGrid items={filteredProducts} />
      )}
    </div>
  )
}

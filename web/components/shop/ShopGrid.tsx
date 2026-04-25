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
  artwork?: string
  category?: string
  productType: string
  licensingEnabled?: boolean
  status?: string
}

interface Category {
  id: string
  label: string
}

interface ShopGridProps {
  products: Product[]
  categories: Category[]
}

export default function ShopGrid({ products, categories }: ShopGridProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('default')

  const filteredProducts = useMemo(() => {
    let items = products.filter((p) => p.status !== 'inactive')

    if (activeCategory !== 'all') {
      items = items.filter((p) => p.category === activeCategory || p.productType === activeCategory)
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      )
    }

    switch (sortBy) {
      case 'price-low':
        items = [...items].sort((a, b) => a.price - b.price)
        break
      case 'price-high':
        items = [...items].sort((a, b) => b.price - a.price)
        break
      case 'name-az':
        items = [...items].sort((a, b) => a.title.localeCompare(b.title))
        break
    }

    return items
  }, [products, activeCategory, searchQuery, sortBy])

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
      />

      {filteredProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">No products found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} {...product} />
          ))}
        </div>
      )}
    </div>
  )
}

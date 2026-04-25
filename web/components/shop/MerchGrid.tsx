'use client'

import { useState, useMemo } from 'react'
import MerchCard from './MerchCard'

interface MerchGridProps {
  products: any[]
  compact?: boolean
}

export default function MerchGrid({ products, compact = false }: MerchGridProps) {
  const [activeCategory, setActiveCategory] = useState('all')

  const categories = [
    { id: 'tees', label: 'T-Shirts' },
    { id: 'hoodies', label: 'Hoodies' },
    { id: 'hats', label: 'Hats' },
    { id: 'accessories', label: 'Accessories' },
  ]

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return products
    return products.filter((p) => p.category === activeCategory)
  }, [products, activeCategory])

  return (
    <div className="space-y-6">
      {!compact && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeCategory === 'all'
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat.id
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No merch available yet. Check back soon!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <MerchCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}

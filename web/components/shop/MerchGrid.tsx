'use client'

import { useState, useMemo } from 'react'
import MerchCard from './MerchCard'
import MerchShopFolderTile from './MerchShopFolderTile'
import { SHOP_CATEGORIES, shopCategoryLabel } from '@/lib/merch/shop-categories'
import type { ShopBackdrop } from '@/lib/merch/shop-backdrop'

interface MerchGridProps {
  products: any[]
  compact?: boolean
  backdrop?: ShopBackdrop | null
}

export default function MerchGrid({ products, compact = false, backdrop = null }: MerchGridProps) {
  const [activeCategory, setActiveCategory] = useState('all')

  const categories = SHOP_CATEGORIES

  const categoryFolders = useMemo(
    () =>
      SHOP_CATEGORIES.map((category) => ({
        ...category,
        products: products.filter((product) => product.category === category.id),
      })).filter((folder) => folder.products.length > 0),
    [products],
  )

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return products
    return products.filter((p) => p.category === activeCategory)
  }, [products, activeCategory])

  return (
    <div className="space-y-6">
      {!compact && (
        <div className="flex flex-wrap justify-center gap-2">
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

      {products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No merch available yet. Check back soon!</p>
        </div>
      ) : activeCategory === 'all' ? (
        categoryFolders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No merch available yet. Check back soon!</p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-4">
            {categoryFolders.map((folder) => (
              <MerchShopFolderTile
                key={folder.id}
                label={folder.label}
                count={folder.products.length}
                covers={folder.products.slice(0, 4)}
                backdrop={backdrop}
                onOpen={() => setActiveCategory(folder.id)}
              />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No {shopCategoryLabel(activeCategory).toLowerCase()} yet. Check back soon!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <MerchCard key={product.id} product={product} backdrop={backdrop} />
          ))}
        </div>
      )}
    </div>
  )
}

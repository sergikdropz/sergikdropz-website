'use client'

import { useState } from 'react'

interface Category {
  id: string
  label: string
}

interface ShopFiltersProps {
  categories: Category[]
  activeCategory: string
  onCategoryChange: (category: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  sortBy: string
  onSortChange: (sort: string) => void
}

export default function ShopFilters({
  categories,
  activeCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
}: ShopFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange('all')}
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
            onClick={() => onCategoryChange(cat.id)}
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

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-500 transition-colors"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
        >
          <option value="default">Sort: Default</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
          <option value="name-az">Name: A-Z</option>
        </select>
      </div>
    </div>
  )
}

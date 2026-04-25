'use client'

import { useState } from 'react'

interface StarRatingProps {
  rating: number
  onRate?: (rating: number) => void
  size?: 'sm' | 'md' | 'lg'
  readonly?: boolean
}

export default function StarRating({ rating, onRate, size = 'sm', readonly = false }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0)

  const sizeClass = {
    sm: 'text-sm gap-0.5',
    md: 'text-base gap-0.5',
    lg: 'text-xl gap-1',
  }[size]

  const activeRating = hoverRating || rating

  return (
    <div
      className={`flex items-center ${sizeClass} ${readonly ? '' : 'cursor-pointer'}`}
      onMouseLeave={() => !readonly && setHoverRating(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`transition-colors select-none ${
            star <= activeRating
              ? 'text-yellow-400'
              : 'text-gray-700 hover:text-gray-500'
          }`}
          onMouseEnter={() => !readonly && setHoverRating(star)}
          onClick={(e) => {
            e.stopPropagation()
            if (!readonly && onRate) {
              onRate(star === rating ? 0 : star)
            }
          }}
          role="button"
          aria-label={readonly ? `${rating} stars` : `Rate ${star} star${star > 1 ? 's' : ''}`}
        >
          ★
        </span>
      ))}
    </div>
  )
}

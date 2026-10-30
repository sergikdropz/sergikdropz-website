'use client'

import Link from 'next/link'
import { useMerchCart } from '@/lib/merch/use-merch-cart'

export default function MerchCartButton({ className = '' }: { className?: string }) {
  const { count, ready } = useMerchCart()
  const label = ready && count > 0 ? `Cart, ${count} items` : 'Cart'

  return (
    <Link
      href="/shop/cart"
      aria-label={label}
      className={`relative inline-flex h-11 w-11 items-center justify-center text-gray-200 transition hover:text-white touch-manipulation ${className}`}
    >
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6.75a3.75 3.75 0 10-7.5 0v3.75m-3.043 8.356L5.25 8.25h13.5l.543 10.606A2.25 2.25 0 0117.05 21H6.95a2.25 2.25 0 01-2.243-2.144z"
        />
      </svg>
      {ready && count > 0 ? (
        <span className="absolute right-1 top-1 min-w-[1.1rem] rounded-full bg-white px-1 text-center text-[10px] font-bold leading-4 text-black">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}

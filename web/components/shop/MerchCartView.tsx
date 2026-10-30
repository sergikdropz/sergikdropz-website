'use client'

import { useCallback, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import MerchShippingEstimate from '@/components/shop/MerchShippingEstimate'
import { formatMerchMoney, merchCartCheckoutItems } from '@/lib/merch/shop-cart'
import { startMerchCheckout } from '@/lib/merch/start-merch-checkout'
import { useMerchCart } from '@/lib/merch/use-merch-cart'

export default function MerchCartView() {
  const searchParams = useSearchParams()
  const { lines, ready, subtotal, setQuantity, removeLine } = useMerchCart()
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destination, setDestination] = useState({ country_code: 'US', state_code: 'CA' })
  const cancelled = searchParams.get('purchase') === 'cancelled'
  const shippingItems = useMemo(
    () => lines.map((line) => ({ variantId: line.printful_variant_id, quantity: line.quantity })),
    [lines],
  )
  const onDestinationChange = useCallback((next: { country_code: string; state_code: string }) => {
    setDestination(next)
  }, [])

  const handleCheckout = async () => {
    setCheckingOut(true)
    setError(null)
    try {
      await startMerchCheckout({
        items: merchCartCheckoutItems(lines),
        cancelPath: '/shop/cart',
        recipient: destination,
        returnPath: '/shop/cart',
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setCheckingOut(false)
    }
  }

  return (
    <div className="min-h-screen px-4 pb-16 pt-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-six-caps text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl">Cart</h1>
          <p className="mt-3 text-gray-400">Print-on-demand merch. Pay with Stripe. Printful ships it.</p>
          <Link href="/shop/merch" className="mt-4 inline-block text-sm text-gray-500 transition hover:text-gray-300">
            ← Continue shopping
          </Link>
        </div>

        {cancelled ? (
          <p className="mb-6 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-center text-sm text-gray-300">
            Checkout was cancelled. Your cart is still here.
          </p>
        ) : null}

        {!ready ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        ) : lines.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-6 py-12 text-center">
            <p className="text-lg text-white">Your cart is empty.</p>
            <p className="mt-2 text-sm text-gray-500">Add a piece from the merch shop, then check out here.</p>
            <Link
              href="/shop/merch"
              className="mt-6 inline-block rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              Open merch shop
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <ul className="space-y-4">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 rounded-xl border border-gray-800 bg-gray-900/40 p-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
                >
                  <Link
                    href={`/shop/merch/${line.productSlug}`}
                    className="relative aspect-square overflow-hidden rounded-lg bg-gray-800"
                  >
                    {line.image ? (
                      line.image.startsWith('/api/') ? (
                        <img src={line.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <Image src={line.image} alt="" fill className="object-cover" sizes="96px" />
                      )
                    ) : null}
                  </Link>
                  <div className="min-w-0">
                    <Link
                      href={`/shop/merch/${line.productSlug}`}
                      className="block truncate font-semibold text-white hover:underline"
                    >
                      {line.productName}
                    </Link>
                    {line.variantName ? <p className="truncate text-sm text-gray-400">{line.variantName}</p> : null}
                    <p className="mt-1 text-sm text-gray-300">{formatMerchMoney(line.price)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuantity(line.id, line.quantity - 1)}
                          className="flex h-9 w-9 items-center justify-center rounded bg-gray-800 text-white hover:bg-gray-700"
                          aria-label={`Decrease quantity of ${line.productName}`}
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-semibold text-white">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(line.id, line.quantity + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded bg-gray-800 text-white hover:bg-gray-700"
                          aria-label={`Increase quantity of ${line.productName}`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="text-xs text-gray-500 underline underline-offset-2 hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="col-span-2 text-right text-sm font-semibold text-white sm:col-span-1 sm:self-start">
                    {formatMerchMoney(line.price * line.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <MerchShippingEstimate items={shippingItems} onDestinationChange={onDestinationChange} />

            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
              <div className="flex items-center justify-between text-white">
                <span>Subtotal</span>
                <span className="text-xl font-bold tabular-nums">{formatMerchMoney(subtotal)}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Shipping is calculated from your destination and collected at Stripe checkout. Printful fulfills the
                order after payment.
              </p>
              {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={checkingOut}
                className="mt-4 w-full rounded-lg bg-white py-3.5 text-sm font-bold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
              >
                {checkingOut ? 'Processing…' : `Checkout · ${formatMerchMoney(subtotal)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

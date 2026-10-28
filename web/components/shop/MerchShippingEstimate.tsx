'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SHIPPING_COUNTRIES, STATE_REQUIRED, statesForCountry } from '@/lib/merch/regions'

type Rate = {
  id?: string
  name?: string
  rate?: string | number
  currency?: string
  minDeliveryDays?: number
  maxDeliveryDays?: number
}

interface Props {
  /** Printful variant id (sync variant). 0/undefined disables the estimate. */
  variantId?: number
  quantity: number
}

export default function MerchShippingEstimate({ variantId, quantity }: Props) {
  const [country, setCountry] = useState('US')
  const [state, setState] = useState('CA')
  const [rates, setRates] = useState<Rate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const states = useMemo(() => statesForCountry(country), [country])
  const needsState = STATE_REQUIRED.has(country)

  // Keep the state value valid for the chosen country.
  useEffect(() => {
    if (needsState && !states.some((s) => s.code === state)) {
      setState(states[0]?.code || '')
    }
  }, [country, needsState, states, state])

  useEffect(() => {
    if (!variantId || variantId <= 0) return
    if (needsState && !state) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const controller = new AbortController()
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/merch/shipping-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            recipient: { country_code: country, state_code: needsState ? state : '' },
            items: [{ variant_id: variantId, quantity }],
          }),
        })
        if (res.status === 503) {
          setError('calculated at checkout')
          setRates(null)
          return
        }
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not estimate shipping')
        setRates(Array.isArray(data.rates) ? data.rates : [])
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return
        setError('calculated at checkout')
        setRates(null)
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => {
      controller.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [variantId, quantity, country, state, needsState])

  if (!variantId || variantId <= 0) return null

  const cheapest = rates && rates.length > 0
    ? [...rates].sort((a, b) => Number(a.rate) - Number(b.rate))[0]
    : null

  const fmt = (rate?: Rate) => {
    if (!rate) return ''
    const value = Number(rate.rate)
    const currency = rate.currency || 'USD'
    const price = Number.isFinite(value)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
      : String(rate.rate)
    return value === 0 ? 'Free' : price
  }

  const eta = (rate?: Rate) => {
    if (!rate) return ''
    const { minDeliveryDays: min, maxDeliveryDays: max } = rate
    if (min && max) return min === max ? `${min} business days` : `${min}–${max} business days`
    if (max) return `up to ${max} business days`
    return ''
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <p className="text-sm text-gray-400 mb-2">Estimated shipping</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded bg-gray-800 text-sm text-white px-3 py-2 border border-gray-700 focus:outline-none focus:border-gray-500"
          aria-label="Destination country"
        >
          {SHIPPING_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        {needsState && states.length > 0 && (
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded bg-gray-800 text-sm text-white px-3 py-2 border border-gray-700 focus:outline-none focus:border-gray-500"
            aria-label="Destination state or province"
          >
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-3 text-sm">
        {loading ? (
          <p className="text-gray-500">Checking rates…</p>
        ) : error ? (
          <p className="text-gray-400">Shipping {error}.</p>
        ) : cheapest ? (
          <>
            <p className="text-white">
              From <span className="font-semibold">{fmt(cheapest)}</span>
              {eta(cheapest) ? <span className="text-gray-400"> · {eta(cheapest)}</span> : null}
            </p>
            {rates && rates.length > 1 && (
              <>
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-1 text-xs text-gray-500 hover:text-white underline underline-offset-2"
                >
                  {showAll ? 'Hide options' : `See ${rates.length} options`}
                </button>
                {showAll && (
                  <ul className="mt-2 space-y-1">
                    {[...rates]
                      .sort((a, b) => Number(a.rate) - Number(b.rate))
                      .map((rate, i) => (
                        <li key={rate.id || i} className="flex justify-between text-gray-300">
                          <span>
                            {rate.name || 'Shipping'}
                            {eta(rate) ? <span className="text-gray-500"> · {eta(rate)}</span> : null}
                          </span>
                          <span className="font-medium">{fmt(rate)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </>
        ) : (
          <p className="text-gray-500">Select a destination to see rates.</p>
        )}
      </div>
    </div>
  )
}

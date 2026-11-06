'use client'

import { useState } from 'react'
import { useMerchDiscount } from '@/lib/merch/use-merch-discount'

export default function MerchDiscountCode() {
  const { discount, applying, error, apply, clear } = useMerchDiscount()
  const [code, setCode] = useState('')

  if (discount) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-black/20 px-3 py-2">
        <p className="min-w-0 text-sm text-white">
          <span className="font-semibold tracking-wide">{discount.code}</span>
          <span className="text-gray-400"> · {discount.label}</span>
        </p>
        <button
          type="button"
          onClick={clear}
          className="shrink-0 text-xs text-gray-400 underline underline-offset-2 hover:text-white"
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        void apply(code).then((ok) => {
          if (ok) setCode('')
        })
      }}
    >
      <label htmlFor="merch-discount-code" className="block text-center text-sm text-gray-400">
        Discount code
      </label>
      <div className="flex gap-2">
        <input
          id="merch-discount-code"
          name="discount"
          value={code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Enter code"
          className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm uppercase text-white outline-none placeholder:normal-case placeholder:text-gray-600 focus:border-white/40"
        />
        <button
          type="submit"
          disabled={applying || code.trim().length === 0}
          className="rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/5 disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-500"
        >
          {applying ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-center text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  )
}

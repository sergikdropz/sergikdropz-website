'use client'

import { useCallback, useEffect, useState } from 'react'
import { normalizeDiscountCode } from '@/lib/merch/discount'
import {
  MERCH_DISCOUNT_EVENT,
  MERCH_DISCOUNT_KEY,
  readStoredMerchDiscount,
  writeStoredMerchDiscount,
  type StoredMerchDiscount,
} from '@/lib/merch/discount-session'

export function useMerchDiscount() {
  const [discount, setDiscount] = useState<StoredMerchDiscount | null>(null)
  const [ready, setReady] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sync = useCallback(() => {
    setDiscount(readStoredMerchDiscount())
    setReady(true)
  }, [])

  useEffect(() => {
    const saved = readStoredMerchDiscount()
    if (!saved) return
    let cancelled = false
    fetch('/api/merch/discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: saved.code }),
    })
      .then((res) => {
        if (!cancelled && !res.ok) writeStoredMerchDiscount(null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    sync()
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === MERCH_DISCOUNT_KEY) sync()
    }
    window.addEventListener(MERCH_DISCOUNT_EVENT, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(MERCH_DISCOUNT_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [sync])

  const apply = useCallback(async (rawCode: string) => {
    const code = normalizeDiscountCode(rawCode)
    if (!code) {
      setError('Enter a discount code.')
      return false
    }
    setApplying(true)
    setError(null)
    try {
      const res = await fetch('/api/merch/discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; discount?: StoredMerchDiscount }
      if (!res.ok || !data.discount) {
        writeStoredMerchDiscount(null)
        setError(data.error || "That code doesn't apply.")
        return false
      }
      writeStoredMerchDiscount(data.discount)
      setDiscount(data.discount)
      return true
    } catch {
      setError("That code doesn't apply.")
      return false
    } finally {
      setApplying(false)
    }
  }, [])

  const clear = useCallback(() => {
    writeStoredMerchDiscount(null)
    setDiscount(null)
    setError(null)
  }, [])

  return { discount, ready, applying, error, apply, clear, setError }
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addMerchCartLine,
  clearMerchCart,
  merchCartCount,
  merchCartSubtotal,
  MERCH_CART_EVENT,
  MERCH_CART_KEY,
  readMerchCart,
  removeMerchCartLine,
  setMerchCartLineQuantity,
  type MerchCartLine,
} from '@/lib/merch/shop-cart'

export function useMerchCart() {
  const [lines, setLines] = useState<MerchCartLine[]>([])
  const [ready, setReady] = useState(false)

  const sync = useCallback(() => {
    setLines(readMerchCart())
    setReady(true)
  }, [])

  useEffect(() => {
    sync()
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === MERCH_CART_KEY) sync()
    }
    window.addEventListener(MERCH_CART_EVENT, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(MERCH_CART_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [sync])

  return useMemo(
    () => ({
      lines,
      ready,
      count: merchCartCount(lines),
      subtotal: merchCartSubtotal(lines),
      addLine: addMerchCartLine,
      setQuantity: (id: string, quantity: number) => setLines(setMerchCartLineQuantity(id, quantity)),
      removeLine: (id: string) => setLines(removeMerchCartLine(id)),
      clear: () => setLines(clearMerchCart()),
    }),
    [lines, ready],
  )
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMerchCartLine,
  clearMerchCart,
  merchCartCheckoutItems,
  merchCartCount,
  merchCartSubtotal,
  MERCH_CART_KEY,
  MERCH_CART_MAX_QTY,
  readMerchCart,
  removeMerchCartLine,
  setMerchCartLineQuantity,
} from './shop-cart'

function installMemoryStorage() {
  const store = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memory,
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: memory,
      dispatchEvent() {
        return true
      },
    },
  })
}

const tee = {
  productSlug: 'stone-eye-tee',
  productName: 'Stone Eye Tee',
  variantName: 'Black / L',
  printful_variant_id: 4012,
  price: 32,
  quantity: 1,
  image: '/tee.jpg',
}

describe('merch shop cart', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  afterEach(() => {
    localStorage.removeItem(MERCH_CART_KEY)
  })

  it('adds a line and merges the same variant', () => {
    addMerchCartLine(tee)
    addMerchCartLine({ ...tee, quantity: 2 })
    const lines = readMerchCart()
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
    expect(merchCartCount(lines)).toBe(3)
    expect(merchCartSubtotal(lines)).toBe(96)
  })

  it('caps quantity and drops invalid lines', () => {
    addMerchCartLine({ ...tee, quantity: 40 })
    expect(readMerchCart()[0].quantity).toBe(MERCH_CART_MAX_QTY)
    window.localStorage.setItem(
      MERCH_CART_KEY,
      JSON.stringify([{ ...tee, printful_variant_id: 0, id: 'bad' }]),
    )
    expect(readMerchCart()).toEqual([])
  })

  it('updates, removes, and clears lines', () => {
    addMerchCartLine(tee)
    const id = readMerchCart()[0].id
    setMerchCartLineQuantity(id, 4)
    expect(readMerchCart()[0].quantity).toBe(4)
    expect(merchCartCheckoutItems()).toEqual([{ printful_variant_id: 4012, quantity: 4 }])
    setMerchCartLineQuantity(id, 0)
    expect(readMerchCart()).toEqual([])
    addMerchCartLine(tee)
    removeMerchCartLine(readMerchCart()[0].id)
    expect(readMerchCart()).toEqual([])
    addMerchCartLine(tee)
    clearMerchCart()
    expect(readMerchCart()).toEqual([])
  })
})

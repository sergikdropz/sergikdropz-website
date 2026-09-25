import { useEffect, useState } from 'react'

/**
 * Debounce value updates; clears immediately when `value` becomes empty (string trim).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (typeof value === 'string' && value.trim() === '') {
      setDebounced(value)
      return
    }
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

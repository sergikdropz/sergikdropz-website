import { useEffect, useRef } from 'react'

interface UseAutoSaveOptions {
  data: any
  key: string
  debounceMs?: number
  enabled?: boolean
}

export function useAutoSave({ data, key, debounceMs = 1000, enabled = true }: UseAutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(data))
      } catch (error) {
        console.error('Failed to auto-save:', error)
      }
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [data, key, debounceMs, enabled])

  // Restore function
  const restore = () => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? JSON.parse(saved) : null
    } catch (error) {
      console.error('Failed to restore:', error)
      return null
    }
  }

  // Clear function
  const clear = () => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error('Failed to clear:', error)
    }
  }

  return { restore, clear }
}

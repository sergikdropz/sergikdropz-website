'use client'

import { useEffect, useRef, useState } from 'react'

export type LoadTaskPhase = 'critical' | 'secondary' | 'idle'

type Options = {
  /** When false, nothing runs (e.g. waiting for admin session). */
  enabled?: boolean
  /** Start secondary after critical is allowed (default true). */
  runSecondary?: boolean
  /** Start idle after secondary schedule (default true). */
  runIdle?: boolean
  /** Max wait before forcing idle phase (ms). */
  idleTimeoutMs?: number
}

/**
 * Progressive load phases for admin/studio screens.
 * - critical: immediate (caller enables critical queries with enabled=true)
 * - secondary: after paint / microtask
 * - idle: requestIdleCallback (aborted on unmount)
 *
 * Risk mitigations: cancel on unmount, no double-schedule, explicit phase flags.
 */
export function useLoadTasks(options: Options = {}) {
  const {
    enabled = true,
    runSecondary = true,
    runIdle = true,
    idleTimeoutMs = 1500,
  } = options

  const [secondary, setSecondary] = useState(false)
  const [idle, setIdle] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setSecondary(false)
      setIdle(false)
      startedRef.current = false
      return
    }
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    let idleId: number | null = null
    let secondaryTimer: number | null = null
    let idleFallback: number | null = null

    const startSecondary = () => {
      if (cancelled || !runSecondary) return
      setSecondary(true)
    }

    const startIdle = () => {
      if (cancelled || !runIdle) return
      setIdle(true)
    }

    // Secondary after first paint window
    secondaryTimer = window.setTimeout(startSecondary, 0)

    if (runIdle) {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(startIdle, { timeout: idleTimeoutMs })
      }
      idleFallback = window.setTimeout(startIdle, idleTimeoutMs + 500)
    }

    return () => {
      cancelled = true
      if (secondaryTimer != null) window.clearTimeout(secondaryTimer)
      if (idleFallback != null) window.clearTimeout(idleFallback)
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [enabled, runSecondary, runIdle, idleTimeoutMs])

  return {
    /** Always true once enabled — wire critical queries to `enabled`. */
    critical: enabled,
    secondary: enabled && secondary,
    idle: enabled && idle,
  }
}

/** Pure helper for unit tests — schedule phases with injectable timers. */
export function scheduleLoadPhases(opts: {
  onSecondary: () => void
  onIdle: () => void
  idleTimeoutMs?: number
  setTimeoutFn?: typeof setTimeout
  requestIdleCallbackFn?: (cb: () => void, opts?: { timeout: number }) => number
  clearTimeoutFn?: typeof clearTimeout
  cancelIdleCallbackFn?: (id: number) => void
}): () => void {
  const idleTimeoutMs = opts.idleTimeoutMs ?? 1500
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout
  let cancelled = false
  let idleHandle: number | null = null
  const secondaryTimer = setTimeoutFn(() => {
    if (!cancelled) opts.onSecondary()
  }, 0) as unknown as number
  const idleFallback = setTimeoutFn(() => {
    if (!cancelled) opts.onIdle()
  }, idleTimeoutMs + 500) as unknown as number

  if (opts.requestIdleCallbackFn) {
    idleHandle = opts.requestIdleCallbackFn(() => {
      if (!cancelled) opts.onIdle()
    }, { timeout: idleTimeoutMs })
  }

  return () => {
    cancelled = true
    clearTimeoutFn(secondaryTimer as unknown as NodeJS.Timeout)
    clearTimeoutFn(idleFallback as unknown as NodeJS.Timeout)
    if (idleHandle != null && opts.cancelIdleCallbackFn) {
      opts.cancelIdleCallbackFn(idleHandle)
    }
  }
}

'use client'

import { useEffect } from 'react'

/**
 * Client-side Sentry when NEXT_PUBLIC_SENTRY_DSN is set (no-op otherwise).
 */
export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
    if (!dsn) return

    let cancelled = false
    void import('@sentry/nextjs').then((Sentry) => {
      if (cancelled) return
      Sentry.init({
        dsn,
        tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}

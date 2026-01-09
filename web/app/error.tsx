'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="pt-20 min-h-screen bg-black flex items-center justify-center">
      <div className="text-center px-4 max-w-2xl mx-auto">
        <h1 className="text-6xl md:text-9xl font-bold mb-4">500</h1>
        <h2 className="text-2xl md:text-3xl font-semibold mb-4">Something went wrong</h2>
        <p className="text-gray-400 mb-8 max-w-md mx-auto">
          An unexpected error occurred. Please try again or return to the homepage.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <button
            onClick={reset}
            className="px-8 py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-8 py-3 border border-white text-white font-semibold rounded hover:bg-white hover:text-black transition-colors"
          >
            Go Home
          </Link>
        </div>
        {process.env.NODE_ENV === 'development' && error.message && (
          <details className="mt-8 text-left bg-gray-900 p-4 rounded">
            <summary className="cursor-pointer text-gray-400 mb-2">Error Details (Development)</summary>
            <pre className="text-xs text-red-400 overflow-auto">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}


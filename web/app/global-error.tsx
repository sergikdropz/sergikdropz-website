'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global application error:', error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-6xl md:text-9xl font-bold mb-4 text-white">500</h1>
            <h2 className="text-2xl md:text-3xl font-semibold mb-4 text-white">Something went wrong</h2>
            <p className="text-gray-400 mb-8">
              A critical error occurred. Please refresh the page or try again later.
            </p>
            <button
              onClick={reset}
              className="px-8 py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}


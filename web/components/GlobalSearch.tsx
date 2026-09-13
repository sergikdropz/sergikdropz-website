'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FaSearch } from 'react-icons/fa'

export default function GlobalSearch() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!query) {
      setResults([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}&limit=10`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.results || [])
        }
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-32">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl shadow-2xl">
        <div className="flex items-center gap-3 p-4 border-b border-gray-800">
          <FaSearch className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks, releases..."
            className="bg-transparent text-white flex-1 outline-none"
          />
          <kbd className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">ESC</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Searching...</div>
          ) : results.length > 0 ? (
            results.map((result, idx) => (
              <button
                key={idx}
                onClick={() => {
                  router.push(result.url)
                  setIsOpen(false)
                }}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-800 transition text-left"
              >
                <div className="flex-1">
                  <div className="text-white font-medium">{result.title}</div>
                  <div className="text-xs text-gray-500">
                    {result.type} • {result.subtitle}
                  </div>
                </div>
              </button>
            ))
          ) : query ? (
            <div className="p-8 text-center text-gray-400">No results found</div>
          ) : (
            <div className="p-8 text-center text-gray-400">Start typing to search...</div>
          )}
        </div>
      </div>
    </div>
  )
}

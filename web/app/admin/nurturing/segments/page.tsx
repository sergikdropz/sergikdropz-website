'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import Link from 'next/link'
import { FaPlus, FaSearch, FaSpinner, FaTrash } from 'react-icons/fa'

interface Segment {
  id: string
  name: string
  description: string
  filters: Record<string, any>
  member_count: number
  created_at: string
  updated_at: string
}

export default function SegmentsAdmin() {
  const { isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [segments, setSegments] = useState<Segment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 50

  const [newSegment, setNewSegment] = useState({
    name: '',
    description: '',
    filters: '{\n  "is_superfan": true\n}',
  })

  const loadSegments = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())

      const res = await fetch(`/api/nurturing/segments?${params}`)
      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || `Failed to load segments (${res.status})`)
      }

      const data = await res.json()
      setSegments(data.data || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Error loading segments:', error)
      showNotification(error instanceof Error ? error.message : 'Failed to load segments', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, offset, limit, showNotification])

  useEffect(() => {
    setOffset(0)
  }, [searchQuery])

  useEffect(() => {
    if (!loading && isAdmin) loadSegments()
  }, [loadSegments, loading, isAdmin])

  const handleCreateSegment = async () => {
    try {
      let parsedFilters: Record<string, any> = {}
      if (newSegment.filters.trim()) {
        parsedFilters = JSON.parse(newSegment.filters)
      }

      const res = await fetch('/api/nurturing/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSegment.name.trim(),
          description: newSegment.description.trim(),
          filters: parsedFilters,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to create segment')
      }

      showNotification('Segment created', 'success')
      setNewSegment({ name: '', description: '', filters: '{}' })
      await loadSegments()
    } catch (error) {
      console.error('Error creating segment:', error)
      showNotification(error instanceof Error ? error.message : 'Failed to create segment', 'error')
    }
  }

  const handleDeleteSegment = async (id: string) => {
    if (!confirm('Delete this segment? This will remove all segment memberships.')) return

    try {
      const res = await fetch(`/api/nurturing/segments/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to delete segment')
      }

      showNotification('Segment deleted', 'success')
      await loadSegments()
    } catch (error) {
      console.error('Error deleting segment:', error)
      showNotification(error instanceof Error ? error.message : 'Failed to delete segment', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="animate-spin text-4xl text-purple-500" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Unauthorized</h1>
          <Link href="/admin" className="text-purple-400 hover:text-purple-300 underline">Return to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Segments</h1>
            <p className="text-gray-400 mt-2">Create audience segments to target campaigns and nurture flows.</p>
          </div>
          <Link href="/admin/nurturing" className="text-purple-400 hover:text-purple-300 underline">Back to Nurturing</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-gray-300">
                <FaSearch />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search segments..."
                  className="bg-transparent outline-none text-sm text-white placeholder-gray-500"
                />
              </div>
              <div className="text-sm text-gray-400">Showing {segments.length} of {total}</div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <FaSpinner className="animate-spin text-3xl text-purple-500" />
              </div>
            ) : segments.length === 0 ? (
              <div className="text-gray-400 text-center py-10">No segments yet. Create your first one.</div>
            ) : (
              <div className="space-y-3">
                {segments.map((segment) => (
                  <div key={segment.id} className="bg-black/40 border border-gray-800 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{segment.name}</h3>
                        <p className="text-gray-400 text-sm mt-1">{segment.description || 'No description'}</p>
                        <div className="text-xs text-gray-500 mt-2">Members: {segment.member_count || 0}</div>
                      </div>
                      <button
                        onClick={() => handleDeleteSegment(segment.id)}
                        className="text-red-400 hover:text-red-300 text-sm flex items-center gap-2"
                      >
                        <FaTrash /> Delete
                      </button>
                    </div>
                    <pre className="mt-3 text-xs text-gray-400 bg-black/30 rounded p-3 overflow-auto">
{JSON.stringify(segment.filters || {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Create Segment</h2>
            <label className="block text-sm text-gray-400 mb-2">Name</label>
            <input
              value={newSegment.name}
              onChange={(e) => setNewSegment({ ...newSegment, name: e.target.value })}
              className="w-full bg-black/40 border border-gray-700 rounded px-3 py-2 text-white mb-4"
              placeholder="Superfans"
            />
            <label className="block text-sm text-gray-400 mb-2">Description</label>
            <input
              value={newSegment.description}
              onChange={(e) => setNewSegment({ ...newSegment, description: e.target.value })}
              className="w-full bg-black/40 border border-gray-700 rounded px-3 py-2 text-white mb-4"
              placeholder="Listeners who regularly engage"
            />
            <label className="block text-sm text-gray-400 mb-2">Filters (JSON)</label>
            <textarea
              value={newSegment.filters}
              onChange={(e) => setNewSegment({ ...newSegment, filters: e.target.value })}
              className="w-full bg-black/40 border border-gray-700 rounded px-3 py-2 text-white h-36 font-mono text-xs"
            />
            <button
              onClick={handleCreateSegment}
              className="mt-4 w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 rounded flex items-center justify-center gap-2"
            >
              <FaPlus /> Create Segment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

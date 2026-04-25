'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { FaCheckCircle, FaExclamationCircle, FaClock, FaSearch } from 'react-icons/fa'

export default function SoundExchangePage() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [submissions, setSubmissions] = useState<any[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [lookupIsrc, setLookupIsrc] = useState('')
  const [lookupResult, setLookupResult] = useState<any>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      fetchSubmissions()
    }
  }, [isAdmin])

  async function fetchSubmissions() {
    try {
      setLoadingSubmissions(true)
      // For now, we'll fetch from the database directly via API
      // In the future, create a dedicated endpoint
      const res = await fetch('/api/studio/soundexchange/submissions')
      if (res.ok) {
        const data = await res.json()
        setSubmissions(data.submissions || [])
      }
    } catch (error) {
      console.error('Error fetching submissions:', error)
    } finally {
      setLoadingSubmissions(false)
    }
  }

  async function handleLookup() {
    if (!lookupIsrc) {
      showNotification('Please enter an ISRC', 'error')
      return
    }

    setLookupLoading(true)
    try {
      const res = await fetch(`/api/studio/soundexchange/lookup?isrc=${encodeURIComponent(lookupIsrc)}`)
      if (res.ok) {
        const data = await res.json()
        setLookupResult(data)
      } else {
        const error = await res.json()
        showNotification(error.error || 'Lookup failed', 'error')
      }
    } catch (error: any) {
      showNotification(`Lookup error: ${error.message}`, 'error')
    } finally {
      setLookupLoading(false)
    }
  }

  if (loading || loadingSubmissions) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  const statusColors: Record<string, string> = {
    pending: 'text-gray-400',
    submitted: 'text-blue-400',
    accepted: 'text-green-400',
    rejected: 'text-red-400',
    error: 'text-red-400',
  }

  const statusIcons: Record<string, any> = {
    pending: FaClock,
    submitted: FaClock,
    accepted: FaCheckCircle,
    rejected: FaExclamationCircle,
    error: FaExclamationCircle,
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">SoundExchange ISRC Management</h1>

        {/* ISRC Lookup */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">ISRC Lookup</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={lookupIsrc}
              onChange={(e) => setLookupIsrc(e.target.value)}
              placeholder="Enter ISRC (e.g., USRC1250001)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleLookup}
              disabled={lookupLoading || !lookupIsrc}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 flex items-center gap-2"
            >
              <FaSearch />
              {lookupLoading ? 'Looking up...' : 'Lookup'}
            </button>
          </div>
          {lookupResult && (
            <div className="mt-4 p-4 bg-gray-800 rounded-lg">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                {JSON.stringify(lookupResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Submission History */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Submission History</h2>
          {submissions.length > 0 ? (
            <div className="space-y-3">
              {submissions.map((submission) => {
                const StatusIcon = statusIcons[submission.status] || FaClock
                return (
                  <div
                    key={submission.id}
                    className="p-4 bg-gray-800 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <StatusIcon className={statusColors[submission.status] || 'text-gray-400'} />
                      <div>
                        <div className="font-mono text-lg">{submission.isrc}</div>
                        <div className="text-sm text-gray-400">
                          {submission.submitted_at
                            ? new Date(submission.submitted_at).toLocaleString()
                            : 'Not submitted'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm font-medium ${statusColors[submission.status] || 'text-gray-400'}`}>
                        {submission.status}
                      </span>
                      {submission.error && (
                        <span className="text-xs text-red-400">{submission.error}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p>No submissions yet</p>
              <p className="text-sm mt-2">Submit ISRCs from track or release pages</p>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-900/20 border border-blue-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">About SoundExchange</h3>
          <div className="text-sm text-gray-300 space-y-2">
            <p>
              SoundExchange is the US ISRC Agency and operates the authoritative ISRC lookup service.
              Submitting your ISRCs ensures they are registered in the SoundExchange database for
              royalty collection and lookup services.
            </p>
            <p>
              <strong>Setup Required:</strong> Configure SoundExchange API credentials in your
              environment variables to enable submissions:
            </p>
            <code className="block bg-gray-900 p-2 rounded mt-2">
              SOUNDEXCHANGE_API_KEY=your_api_key<br />
              SOUNDEXCHANGE_ACCOUNT_ID=your_account_id
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

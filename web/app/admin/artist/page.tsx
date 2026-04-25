'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { ProductionStats } from '@/components/music/ProductionStats'
import CamelotWheel from '@/components/music/CamelotWheel'

export default function AdminArtist() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [artistData, setArtistData] = useState<any>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchArtistData()
    }
  }, [isAdmin])

  async function fetchArtistData() {
    try {
      setLoadingData(true)
      const response = await fetch('/api/admin/artist')
      const data = await response.json()
      setArtistData(data)
    } catch (error) {
      console.error('Error fetching artist data:', error)
    } finally {
      setLoadingData(false)
    }
  }

  async function handleSave() {
    if (!artistData) return

    setSaving(true)
    try {
      const response = await fetch('/api/admin/artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(artistData),
      })

      if (response.ok) {
        alert('Artist info saved successfully!')
      } else {
        alert('Save failed')
      }
    } catch (error) {
      alert('Save error')
    } finally {
      setSaving(false)
    }
  }

  function updateNested(path: string[], value: any) {
    setArtistData((prev: any) => {
      const newData = { ...prev }
      let current: any = newData
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) {
          current[path[i]] = {}
        }
        current = current[path[i]]
      }
      current[path[path.length - 1]] = value
      return newData
    })
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin || !artistData) {
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Artist Information</h1>
          <p className="text-gray-400">Manage artist bio, contact info, and metadata</p>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Artist Name
                </label>
                <input
                  type="text"
                  value={artistData.artist_name || ''}
                  onChange={(e) => updateNested(['artist_name'], e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Legal Name
                </label>
                <input
                  type="text"
                  value={artistData.legal_name || ''}
                  onChange={(e) => updateNested(['legal_name'], e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input
                type="email"
                value={artistData.contact?.email || ''}
                onChange={(e) =>
                  updateNested(['contact', 'email'], e.target.value)
                }
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Bio</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Short Bio
              </label>
              <textarea
                value={artistData.bio?.short || ''}
                onChange={(e) => updateNested(['bio', 'short'], e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Long Bio</label>
              <textarea
                value={artistData.bio?.long || ''}
                onChange={(e) => updateNested(['bio', 'long'], e.target.value)}
                rows={6}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Location</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">City</label>
              <input
                type="text"
                value={artistData.location?.city || ''}
                onChange={(e) => updateNested(['location', 'city'], e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">State</label>
              <input
                type="text"
                value={artistData.location?.state || ''}
                onChange={(e) => updateNested(['location', 'state'], e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Country</label>
              <input
                type="text"
                value={artistData.location?.country || ''}
                onChange={(e) => updateNested(['location', 'country'], e.target.value)}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>
        </div>

        <div className="flex space-x-4 mb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={fetchArtistData}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Reset
          </button>
        </div>

        {/* SERGIK Production DNA Section */}
        <div className="border-t border-gray-800 pt-8 mt-8">
          <h2 className="text-3xl font-bold mb-6">🧬 SERGIK Production DNA</h2>
          
          {/* Camelot Key Wheel */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4">Key Preferences</h3>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <CamelotWheel size="md" showLabels interactive={false} />
              <div className="flex-1">
                <h4 className="font-medium text-gray-300 mb-2">Primary Keys</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-bold">10B</span>
                    <span className="text-gray-400">D Major - Bright, energetic</span>
                    <span className="ml-auto text-white font-semibold">31%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-bold">11B</span>
                    <span className="text-gray-400">A Major - Warm, soulful</span>
                    <span className="ml-auto text-white font-semibold">21%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-violet-400 font-bold">7A</span>
                    <span className="text-gray-400">D Minor - Dark, driving</span>
                    <span className="ml-auto text-white font-semibold">13%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-violet-400 font-bold">8A</span>
                    <span className="text-gray-400">A Minor - Melancholic, deep</span>
                    <span className="ml-auto text-white font-semibold">12%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full Production Stats */}
          <ProductionStats 
            showTimeline 
            showGenreDna 
            showCollaborators 
            showBpmProfile 
          />
        </div>
      </div>
    </div>
  )
}

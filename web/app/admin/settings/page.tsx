'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface Setting {
  key: string
  value: any
  description?: string
  updatedAt?: string
}

export default function AdminSettings() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [settings, setSettings] = useState<Record<string, Setting>>({})
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [newSetting, setNewSetting] = useState({ key: '', value: '', description: '' })
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchSettings()
      fetchStatus()
    }
  }, [isAdmin])

  async function fetchSettings() {
    try {
      setLoadingSettings(true)
      const response = await fetch('/api/admin/settings')
      const data = await response.json()
      setSettings(data.settings || {})
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoadingSettings(false)
    }
  }

  async function fetchStatus() {
    try {
      setLoadingStatus(true)
      const response = await fetch('/api/admin/settings/status')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Error fetching status:', error)
    } finally {
      setLoadingStatus(false)
    }
  }

  async function saveSetting(key: string, value: any, description?: string) {
    try {
      setSaving(true)
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, description }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save setting')
      }

      await fetchSettings()
      alert('Setting saved successfully!')
    } catch (error: any) {
      alert('Error saving setting: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSetting(key: string) {
    if (!confirm(`Are you sure you want to delete the setting "${key}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/settings/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete setting')
      }

      await fetchSettings()
      alert('Setting deleted successfully!')
    } catch (error: any) {
      alert('Error deleting setting: ' + error.message)
    }
  }

  async function handleAddSetting() {
    if (!newSetting.key || !newSetting.value) {
      alert('Key and value are required')
      return
    }

    try {
      // Try to parse value as JSON, if it fails, use as string
      let parsedValue = newSetting.value
      try {
        parsedValue = JSON.parse(newSetting.value)
      } catch {
        // Not JSON, use as string
      }

      await saveSetting(newSetting.key, parsedValue, newSetting.description)
      setNewSetting({ key: '', value: '', description: '' })
      setShowAddForm(false)
    } catch (error: any) {
      alert('Error adding setting: ' + error.message)
    }
  }

  if (loading || loadingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Settings</h1>
          <p className="text-gray-400">Configure site settings and view connection status</p>
        </div>

        {/* Connection Status */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Connection Status</h2>
          {loadingStatus ? (
            <div className="text-gray-400">Loading status...</div>
          ) : status ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Supabase</h3>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className={status.supabase?.configured ? 'text-green-400' : 'text-red-400'}>
                        {status.supabase?.configured ? '✓' : '✗'}
                      </span>
                      <span>Configured</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={status.supabase?.connected ? 'text-green-400' : 'text-red-400'}>
                        {status.supabase?.connected ? '✓' : '✗'}
                      </span>
                      <span>Connected</span>
                    </div>
                    {status.supabase?.error && (
                      <div className="text-red-400 text-sm">{status.supabase.error}</div>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Stripe</h3>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className={status.stripe?.configured ? 'text-green-400' : 'text-red-400'}>
                        {status.stripe?.configured ? '✓' : '✗'}
                      </span>
                      <span>Configured</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={status.stripe?.connected ? 'text-green-400' : 'text-red-400'}>
                        {status.stripe?.connected ? '✓' : '✗'}
                      </span>
                      <span>Connected</span>
                    </div>
                    {status.stripe?.error && (
                      <div className="text-red-400 text-sm">{status.stripe.error}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-red-400">Failed to load status</div>
          )}
        </div>

        {/* Environment Variables */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Environment Variables</h2>
          {status?.envVars ? (
            <div className="space-y-2">
              {Object.entries(status.envVars).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center py-2 border-b border-gray-800">
                  <span className="text-gray-400 font-mono text-sm">{key}</span>
                  <span className={String(value).includes('✅') ? 'text-green-400' : 'text-red-400'}>
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400">Loading environment variables...</div>
          )}
        </div>

        {/* Settings Management */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Settings</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition"
            >
              {showAddForm ? 'Cancel' : 'Add Setting'}
            </button>
          </div>

          {showAddForm && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold mb-4">Add New Setting</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Key</label>
                  <input
                    type="text"
                    value={newSetting.key}
                    onChange={(e) => setNewSetting({ ...newSetting, key: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                    placeholder="e.g., site_name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Value (JSON or string)</label>
                  <textarea
                    value={newSetting.value}
                    onChange={(e) => setNewSetting({ ...newSetting, value: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                    rows={3}
                    placeholder='e.g., "My Site" or {"key": "value"}'
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description (optional)</label>
                  <input
                    type="text"
                    value={newSetting.description}
                    onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                    placeholder="Description of this setting"
                  />
                </div>
                <button
                  onClick={handleAddSetting}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
                >
                  Add Setting
                </button>
              </div>
            </div>
          )}

          {Object.keys(settings).length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No settings found. Add your first setting to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(settings).map(([key, setting]) => (
                <SettingItem
                  key={key}
                  settingKey={key}
                  setting={setting}
                  onSave={saveSetting}
                  onDelete={deleteSetting}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingItem({
  settingKey,
  setting,
  onSave,
  onDelete,
  saving,
}: {
  settingKey: string
  setting: Setting
  onSave: (key: string, value: any, description?: string) => Promise<void>
  onDelete: (key: string) => Promise<void>
  saving: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(JSON.stringify(setting.value, null, 2))
  const [description, setDescription] = useState(setting.description || '')

  async function handleSave() {
    try {
      let parsedValue = value
      try {
        parsedValue = JSON.parse(value)
      } catch {
        // Not JSON, use as string
      }
      await onSave(settingKey, parsedValue, description)
      setIsEditing(false)
    } catch (error: any) {
      alert('Error saving: ' + error.message)
    }
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="text-lg font-semibold font-mono">{settingKey}</h3>
          {setting.description && (
            <p className="text-gray-400 text-sm mt-1">{setting.description}</p>
          )}
          {setting.updatedAt && (
            <p className="text-gray-500 text-xs mt-1">
              Updated: {new Date(setting.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex space-x-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setValue(JSON.stringify(setting.value, null, 2))
                  setDescription(setting.description || '')
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded transition"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="text-purple-400 hover:text-purple-300 px-3 py-1 rounded transition"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(settingKey)}
                className="text-red-400 hover:text-red-300 px-3 py-1 rounded transition"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="space-y-2 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Value</label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white font-mono text-sm"
              rows={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <pre className="bg-gray-900/50 p-3 rounded text-sm overflow-x-auto">
            {JSON.stringify(setting.value, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

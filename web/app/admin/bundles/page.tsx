'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface Bundle {
  id: string
  name: string
  slug: string
  description: string
  productIds: string[]
  originalPrice: number
  bundlePrice: number
  savingsPercent: number
  artwork?: string
  status: string
}

const emptyBundle: Omit<Bundle, 'id'> = {
  name: '',
  slug: '',
  description: '',
  productIds: [],
  originalPrice: 0,
  bundlePrice: 0,
  savingsPercent: 0,
  artwork: '',
  status: 'active',
}

export default function AdminBundlesPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null)
  const [form, setForm] = useState(emptyBundle)
  const [productIdInput, setProductIdInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) loadBundles()
  }, [isAdmin])

  async function loadBundles() {
    try {
      const res = await fetch('/api/admin/bundles')
      if (res.ok) {
        const data = await res.json()
        setBundles(data.bundles || [])
      }
    } catch (err) {
      console.error('Error loading bundles:', err)
    } finally {
      setLoadingData(false)
    }
  }

  function startCreate() {
    setEditingBundle(null)
    setForm(emptyBundle)
    setProductIdInput('')
    setShowForm(true)
  }

  function startEdit(bundle: Bundle) {
    setEditingBundle(bundle)
    setForm({
      name: bundle.name,
      slug: bundle.slug,
      description: bundle.description,
      productIds: bundle.productIds,
      originalPrice: bundle.originalPrice,
      bundlePrice: bundle.bundlePrice,
      savingsPercent: bundle.savingsPercent,
      artwork: bundle.artwork || '',
      status: bundle.status,
    })
    setProductIdInput(bundle.productIds.join(', '))
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const productIds = productIdInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const savings =
        form.originalPrice > 0
          ? Math.round(((form.originalPrice - form.bundlePrice) / form.originalPrice) * 100)
          : 0

      const bundle = {
        id: editingBundle?.id || `bundle-${form.slug || Date.now()}`,
        ...form,
        productIds,
        savingsPercent: savings,
      }

      const res = await fetch('/api/admin/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      })

      if (res.ok) {
        setShowForm(false)
        loadBundles()
      }
    } catch (err) {
      console.error('Error saving bundle:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bundle?')) return
    try {
      const res = await fetch(`/api/admin/bundles/${id}`, { method: 'DELETE' })
      if (res.ok) loadBundles()
    } catch (err) {
      console.error('Error deleting bundle:', err)
    }
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  if (loading || !isAdmin) return null

  const activeBundles = bundles.filter((b) => b.status === 'active')
  const totalProducts = bundles.reduce((sum, b) => sum + b.productIds.length, 0)
  const combinedSavings = bundles.reduce(
    (sum, b) => sum + (b.originalPrice - b.bundlePrice),
    0
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bundles</h1>
          <p className="text-gray-400 text-sm mt-1">Create and manage product bundles</p>
        </div>
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-all"
        >
          + Create Bundle
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Bundles</p>
          <p className="text-2xl font-bold text-white">{bundles.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Active</p>
          <p className="text-2xl font-bold text-green-400">{activeBundles.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Products Bundled</p>
          <p className="text-2xl font-bold text-blue-400">{totalProducts}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Combined Savings</p>
          <p className="text-2xl font-bold text-green-400">{formatPrice(combinedSavings)}</p>
        </div>
      </div>

      {/* Inline Form */}
      {showForm && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingBundle ? 'Edit Bundle' : 'Create Bundle'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">
                Product IDs (comma-separated)
              </label>
              <input
                type="text"
                value={productIdInput}
                onChange={(e) => setProductIdInput(e.target.value)}
                placeholder="ep-are-we-awake, ep-vice-and-virtues"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Original Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.originalPrice}
                onChange={(e) =>
                  setForm({ ...form, originalPrice: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bundle Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.bundlePrice}
                onChange={(e) =>
                  setForm({ ...form, bundlePrice: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Artwork URL</label>
              <input
                type="text"
                value={form.artwork}
                onChange={(e) => setForm({ ...form, artwork: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-all"
            >
              {saving ? 'Saving...' : editingBundle ? 'Update Bundle' : 'Create Bundle'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bundle List */}
      {loadingData ? (
        <div className="text-gray-400 animate-pulse">Loading...</div>
      ) : (
        <div className="space-y-4">
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className="bg-gray-900/50 border border-gray-800 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-semibold">{bundle.name}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        bundle.status === 'active'
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}
                    >
                      {bundle.status}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">{bundle.description}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-white font-bold">{formatPrice(bundle.bundlePrice)}</p>
                  <p className="text-gray-500 text-xs line-through">
                    {formatPrice(bundle.originalPrice)}
                  </p>
                  <span className="text-green-400 text-xs font-medium">
                    -{bundle.savingsPercent}%
                  </span>
                </div>
              </div>
              {bundle.productIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {bundle.productIds.map((id: string) => (
                    <span
                      key={id}
                      className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => startEdit(bundle)}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-all"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(bundle.id)}
                  className="px-3 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs rounded transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {bundles.length === 0 && (
            <div className="text-gray-500 text-center py-8">
              No bundles configured. Click &quot;+ Create Bundle&quot; to get started.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

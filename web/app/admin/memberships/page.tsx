'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface Membership {
  id: string
  stripe_subscription_id: string
  customer_email: string
  plan_id: string
  status: string
  current_period_end: string
  cancel_at_period_end: boolean
  created_at: string
}

interface Plan {
  id: string
  name: string
  price: number
  interval: string
  stripePriceId: string
  features: string[]
  color?: string
}

export default function AdminMembershipsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [selectedMember, setSelectedMember] = useState<Membership | null>(null)
  const [savingPlans, setSavingPlans] = useState(false)
  const [planEdits, setPlanEdits] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      loadMemberships()
      loadPlans()
    }
  }, [isAdmin])

  async function loadMemberships() {
    try {
      const res = await fetch('/api/admin/memberships')
      if (res.ok) {
        const data = await res.json()
        setMemberships(data.memberships || [])
      }
    } catch (err) {
      console.error('Error loading memberships:', err)
    } finally {
      setLoadingData(false)
    }
  }

  async function loadPlans() {
    try {
      const res = await fetch('/api/admin/membership-plans')
      if (res.ok) {
        const data = await res.json()
        setPlans(data.plans || [])
        const edits: Record<string, string> = {}
        data.plans?.forEach((p: Plan) => {
          edits[p.id] = p.stripePriceId || ''
        })
        setPlanEdits(edits)
      }
    } catch (err) {
      console.error('Error loading plans:', err)
    }
  }

  async function savePlanConfig() {
    setSavingPlans(true)
    try {
      const updatedPlans = plans.map((p) => ({
        ...p,
        stripePriceId: planEdits[p.id] || '',
      }))
      const res = await fetch('/api/admin/membership-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans: updatedPlans }),
      })
      if (res.ok) {
        loadPlans()
      }
    } catch (err) {
      console.error('Error saving plans:', err)
    } finally {
      setSavingPlans(false)
    }
  }

  if (loading || !isAdmin) return null

  const active = memberships.filter((m) => m.status === 'active')
  const planPrices: Record<string, number> = { supporter: 499, 'inner-circle': 1499 }
  const mrr = active.reduce((sum, m) => sum + (planPrices[m.plan_id] || 0), 0)

  const planBreakdown: Record<string, number> = {}
  memberships.forEach((m) => {
    planBreakdown[m.plan_id] = (planBreakdown[m.plan_id] || 0) + 1
  })

  const filtered =
    planFilter === 'all'
      ? memberships
      : memberships.filter((m) => m.plan_id === planFilter)

  const hasEmptyPriceIds = plans.some((p) => !p.stripePriceId)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Memberships</h1>

      {/* Stripe Price ID Config */}
      {hasEmptyPriceIds && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mb-6">
          <p className="text-yellow-400 text-sm font-medium">
            Stripe Price IDs are missing. Memberships will not work until you configure them in your Stripe Dashboard and enter the IDs below.
          </p>
        </div>
      )}

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">Plan Configuration</h2>
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="flex items-center gap-4">
              <div className="w-32">
                <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                  plan.id === 'inner-circle'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-purple-600/20 text-purple-400'
                }`}>
                  {plan.name}
                </span>
                <span className="text-gray-400 text-xs ml-2">${plan.price}/mo</span>
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={planEdits[plan.id] || ''}
                  onChange={(e) =>
                    setPlanEdits({ ...planEdits, [plan.id]: e.target.value })
                  }
                  placeholder="price_xxxx (from Stripe Dashboard)"
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={savePlanConfig}
          disabled={savingPlans}
          className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-all"
        >
          {savingPlans ? 'Saving...' : 'Save Plan Config'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Active Members</p>
          <p className="text-2xl font-bold text-white">{active.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">MRR</p>
          <p className="text-2xl font-bold text-green-400">${(mrr / 100).toFixed(2)}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total (All Time)</p>
          <p className="text-2xl font-bold text-white">{memberships.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Plan Breakdown</p>
          <div className="flex gap-2 mt-1">
            {Object.entries(planBreakdown).map(([plan, count]) => (
              <span key={plan} className="text-xs text-gray-300">
                {plan}: <span className="font-bold">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Plan Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {['all', 'supporter', 'inner-circle'].map((f) => (
          <button
            key={f}
            onClick={() => setPlanFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              planFilter === f
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? 'All' : f === 'supporter' ? 'Supporter' : 'Inner Circle'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loadingData ? (
        <div className="text-gray-400 animate-pulse">Loading...</div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left p-3 text-gray-400 font-medium">Email</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Plan</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Renews</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Since</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="p-3 text-white">{m.customer_email}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded font-medium ${
                          m.plan_id === 'inner-circle'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-purple-600/20 text-purple-400'
                        }`}
                      >
                        {m.plan_id}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          m.status === 'active'
                            ? 'bg-green-600/20 text-green-400'
                            : m.status === 'past_due'
                            ? 'bg-yellow-600/20 text-yellow-400'
                            : 'bg-red-600/20 text-red-400'
                        }`}
                      >
                        {m.status}
                      </span>
                      {m.cancel_at_period_end && (
                        <span className="ml-1 text-yellow-400 text-xs">(canceling)</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-400">
                      {m.current_period_end
                        ? new Date(m.current_period_end).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="p-3 text-gray-400">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedMember(m)}
                        className="text-purple-400 hover:text-purple-300 text-xs transition"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-500">No memberships found.</div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Membership Details</h2>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="text-gray-400 hover:text-white transition"
                >
                  X
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-gray-400 text-sm mb-1">Email</div>
                  <div className="text-white">{selectedMember.customer_email}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Plan</div>
                  <div className="text-white">{selectedMember.plan_id}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Status</div>
                  <div className="text-white">
                    {selectedMember.status}
                    {selectedMember.cancel_at_period_end && ' (canceling at period end)'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Stripe Subscription ID</div>
                  <div className="text-white font-mono text-sm">
                    {selectedMember.stripe_subscription_id}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Current Period End</div>
                  <div className="text-white">
                    {selectedMember.current_period_end
                      ? new Date(selectedMember.current_period_end).toLocaleString()
                      : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Member Since</div>
                  <div className="text-white">
                    {new Date(selectedMember.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

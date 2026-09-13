'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

interface AdminUser {
  id: string
  user_id: string
  email: string
  active: boolean
  created_at: string
  updated_at: string
  lastActivity?: string
  user?: {
    id: string
    email: string
    created_at: string
    last_sign_in_at?: string
  }
}

export default function AdminUsers() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '' })
  const [adding, setAdding] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
useEffect(() => {
    if (isAdmin) {
      fetchUsers()
    }
  }, [isAdmin])

  async function fetchUsers() {
    try {
      setLoadingUsers(true)
      const response = await fetch('/api/admin/users')
      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  async function handleAddUser() {
    if (!newUser.email || !newUser.password) {
      alert('Email and password are required')
      return
    }

    if (newUser.password.length < 8) {
      alert('Password must be at least 8 characters')
      return
    }

    try {
      setAdding(true)
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setNewUser({ email: '', password: '' })
      setShowAddModal(false)
      await fetchUsers()
      alert('Admin user created successfully!')
    } catch (error: any) {
      alert('Error creating user: ' + error.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleToggleActive(userId: string, currentActive: boolean) {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update user')
      }

      await fetchUsers()
    } catch (error: any) {
      alert('Error updating user: ' + error.message)
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Are you sure you want to delete admin user "${email}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete user')
      }

      await fetchUsers()
      alert('User deleted successfully')
    } catch (error: any) {
      alert('Error deleting user: ' + error.message)
    }
  }

  if (loading || loadingUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  const currentUserId = user.id

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">User Management</h1>
            <p className="text-gray-400">Manage admin users and permissions</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition"
          >
            Add Admin User
          </button>
        </div>

        {/* Users Table */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Admin Users ({users.length})</h2>

          {users.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No admin users found. Add your first admin user to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Email</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Created</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Last Activity</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((adminUser) => {
                    const userId = adminUser.user_id
                    const isCurrentUser = userId === currentUserId
                    return (
                      <tr
                        key={adminUser.id}
                        className="border-b border-gray-800 hover:bg-gray-800/30 transition"
                      >
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium">{adminUser.email}</div>
                            {isCurrentUser && (
                              <div className="text-xs text-purple-400">(You)</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              adminUser.active
                                ? 'bg-green-900/50 text-green-400'
                                : 'bg-red-900/50 text-red-400'
                            }`}
                          >
                            {adminUser.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-sm">
                          {new Date(adminUser.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-sm">
                          {adminUser.lastActivity
                            ? new Date(adminUser.lastActivity).toLocaleString()
                            : adminUser.user?.last_sign_in_at
                            ? new Date(adminUser.user.last_sign_in_at).toLocaleString()
                            : 'Never'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleToggleActive(userId, adminUser.active)}
                              disabled={isCurrentUser}
                              className={`px-3 py-1 rounded text-sm transition ${
                                adminUser.active
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-green-600 hover:bg-green-700 text-white'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                              title={isCurrentUser ? 'Cannot modify your own account' : ''}
                            >
                              {adminUser.active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => setSelectedUserId(userId)}
                              className="text-blue-400 hover:text-blue-300 px-3 py-1 rounded text-sm transition"
                            >
                              View Activity
                            </button>
                            <button
                              onClick={() => handleDeleteUser(userId, adminUser.email)}
                              disabled={isCurrentUser}
                              className="text-red-400 hover:text-red-300 px-3 py-1 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title={isCurrentUser ? 'Cannot delete your own account' : ''}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Add Admin User</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setNewUser({ email: '', password: '' })
                  }}
                  className="text-gray-400 hover:text-white transition"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
                    placeholder="Minimum 8 characters"
                  />
                </div>
                <div className="flex space-x-2 pt-4">
                  <button
                    onClick={handleAddUser}
                    disabled={adding}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    {adding ? 'Creating...' : 'Create User'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setNewUser({ email: '', password: '' })
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {selectedUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">User Activity</h2>
                <button
                  onClick={() => setSelectedUserId(null)}
                  className="text-gray-400 hover:text-white transition"
                >
                  ✕
                </button>
              </div>
              <UserActivityLogs userId={selectedUserId} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UserActivityLogs({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLogs() {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/logs?admin_id=${userId}&limit=50`)
        const data = await response.json()
        setLogs(data.logs || [])
      } catch (error) {
        console.error('Error fetching activity logs:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [userId])

  if (loading) {
    return <div className="text-gray-400">Loading activity logs...</div>
  }

  if (logs.length === 0) {
    return <div className="text-gray-400 text-center py-8">No activity logs found.</div>
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold">{log.action_type}</span>
                {log.resource_type && (
                  <>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-400">{log.resource_type}</span>
                  </>
                )}
              </div>
              {log.details && (
                <div className="text-sm text-gray-400 mt-1">
                  {JSON.stringify(log.details, null, 2)}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(log.created_at).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

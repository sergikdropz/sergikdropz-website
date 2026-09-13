'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminSetup() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceKey: '',
    setupSQL: '',
  })
  const router = useRouter()

  // Optional: prefill public Supabase fields from .env (never service role — user must paste that).
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    if (!url && !anon) return
    setFormData((prev) => ({
      ...prev,
      ...(url ? { supabaseUrl: url } : {}),
      ...(anon ? { supabaseAnonKey: anon } : {}),
    }))
  }, [])

  async function handleSetup() {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      // Step 1: Validate Supabase connection
      if (step === 1) {
        const credentials = {
          supabaseUrl: formData.supabaseUrl.trim(),
          supabaseAnonKey: formData.supabaseAnonKey.trim(),
          supabaseServiceKey: formData.supabaseServiceKey.trim(),
        }
        if (!credentials.supabaseUrl || !credentials.supabaseAnonKey || !credentials.supabaseServiceKey) {
          setError('Please fill in Supabase URL, anon key, and service role key.')
          setLoading(false)
          return
        }

        const response = await fetch('/api/admin/setup/check-supabase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        })

        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Failed to connect to Supabase')
          setLoading(false)
          return
        }

        // Update formData with credentials for next steps
        setFormData((prev) => ({
          ...prev,
          ...credentials,
        }))

        setSuccess('Connected to Supabase successfully!')
        setStep(2)
        setLoading(false)
        return
      }

      // Step 2: Setup database
      if (step === 2) {
        const response = await fetch('/api/admin/setup/setup-database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabaseUrl: formData.supabaseUrl,
            supabaseServiceKey: formData.supabaseServiceKey,
          }),
        })

        const data = await response.json()

        if (!response.ok || data.requiresManualSetup) {
          if (data.sql) {
            setFormData((prev) => ({ ...prev, setupSQL: data.sql }))
          }
          if (data.requiresManualSetup) {
            setSuccess('manual')
            setError('')
          } else {
            setError(data.error || 'Failed to setup database')
            setSuccess('')
          }
          setLoading(false)
          return
        }

        setSuccess('Database setup complete!')
        setStep(3)
        setLoading(false)
        return
      }

      // Step 3: Create admin user
      if (step === 3) {
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match')
          setLoading(false)
          return
        }

        if (formData.password.length < 8) {
          setError('Password must be at least 8 characters')
          setLoading(false)
          return
        }

        const response = await fetch('/api/admin/setup/create-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            supabaseUrl: formData.supabaseUrl,
            supabaseAnonKey: formData.supabaseAnonKey,
            supabaseServiceKey: formData.supabaseServiceKey,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Failed to create admin user')
          setLoading(false)
          return
        }

        setSuccess('Admin user created successfully!')
        setStep(4)
        setLoading(false)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  async function handleComplete() {
    // Auto-login and redirect
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      })

      if (response.ok) {
        router.push('/admin')
        router.refresh()
      } else {
        router.push('/admin/login')
      }
    } catch (err) {
      router.push('/admin/login')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-2xl">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Admin Setup</h1>
            <p className="text-gray-400">Set up your admin panel in a few simple steps</p>
          </div>

          {/* Progress indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`flex-1 h-2 rounded ${
                    s <= step ? 'bg-purple-600' : 'bg-gray-700'
                  } ${s < step ? 'mr-2' : ''}`}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Connect</span>
              <span>Database</span>
              <span>Create User</span>
              <span>Complete</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {success && !success.includes('manual') && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg text-sm mb-6">
              {success}
            </div>
          )}
          {copyMessage && (
            <div className="bg-blue-500/10 border border-blue-500/50 text-blue-400 px-4 py-3 rounded-lg text-sm mb-6">
              {copyMessage}
            </div>
          )}

          {/* Step 1: Supabase Connection */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Step 1: Connect to Supabase</h2>
              <p className="text-gray-400 text-sm mb-6">
                Enter your Supabase credentials. You can find these in your Supabase project settings.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Supabase URL
                </label>
                <input
                  type="text"
                  value={formData.supabaseUrl}
                  onChange={(e) => setFormData({ ...formData, supabaseUrl: e.target.value })}
                  placeholder="https://xxxxx.supabase.co"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Supabase Anon Key
                </label>
                <input
                  type="password"
                  value={formData.supabaseAnonKey}
                  onChange={(e) => setFormData({ ...formData, supabaseAnonKey: e.target.value })}
                  placeholder="eyJhbGc..."
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Supabase Service Role Key
                </label>
                <input
                  type="password"
                  value={formData.supabaseServiceKey}
                  onChange={(e) => setFormData({ ...formData, supabaseServiceKey: e.target.value })}
                  placeholder="eyJhbGc..."
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                />
                <p className="text-gray-400 text-xs mt-2">
                  ⚠️ This key has admin privileges. Keep it secure.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Database Setup */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Step 2: Setup Database</h2>
              <p className="text-gray-400 text-sm mb-6">
                We'll create the necessary database tables for admin management.
              </p>
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <p className="text-gray-300 text-sm">
                  This will create:
                </p>
                <ul className="list-disc list-inside text-gray-400 text-sm mt-2 space-y-1">
                  <li>admins table for user management</li>
                  <li>Required indexes and security policies</li>
                  <li>Database triggers for timestamps</li>
                </ul>
              </div>
              {success && success.includes('manual') && (
                <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
                  <p className="text-yellow-400 text-sm mb-3">
                    ⚠️ Please run the SQL manually in Supabase SQL Editor
                  </p>
                  <details className="text-xs mb-3">
                    <summary className="text-yellow-300 cursor-pointer mb-2">Click to view SQL</summary>
                    <pre className="bg-black/50 p-3 rounded mt-2 overflow-x-auto text-gray-300 text-[10px] max-h-60 overflow-y-auto">
                      {formData.setupSQL || 'SQL will appear here'}
                    </pre>
                    <button
                      onClick={async () => {
                        if (formData.setupSQL) {
                          try {
                            await navigator.clipboard.writeText(formData.setupSQL)
                            setCopyMessage('SQL copied to clipboard! Paste it in Supabase SQL Editor.')
                            setTimeout(() => setCopyMessage(''), 3000)
                          } catch (err) {
                            setCopyMessage('Failed to copy. Please select and copy manually.')
                            setTimeout(() => setCopyMessage(''), 3000)
                          }
                        }
                      }}
                      className="mt-2 bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs"
                    >
                      Copy SQL
                    </button>
                  </details>
                  <p className="text-yellow-300 text-xs mb-3">
                    1. Go to Supabase Dashboard → SQL Editor<br/>
                    2. Paste the SQL above<br/>
                    3. Click "Run"<br/>
                    4. Click "Continue" below once done
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Create Admin User */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Step 3: Create Admin User</h2>
              <p className="text-gray-400 text-sm mb-6">
                Create your first admin account to access the admin panel.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@example.com"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                />
                <p className="text-gray-400 text-xs mt-2">Minimum 8 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                />
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 4 && (
            <div className="space-y-6 text-center">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-xl font-semibold text-white mb-4">Setup Complete!</h2>
              <p className="text-gray-400 mb-6">
                Your admin panel is ready to use. You'll be automatically logged in.
              </p>
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-left">
                <p className="text-gray-300 text-sm mb-2 font-semibold">Next steps:</p>
                <ul className="list-disc list-inside text-gray-400 text-sm space-y-1">
                  <li>Add your Supabase credentials to <code className="text-purple-400">.env.local</code></li>
                  <li>Start managing your content through the admin panel</li>
                  <li>Add more admin users from the dashboard</li>
                </ul>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-between">
            {step > 1 && step < 4 && (
              <button
                onClick={() => {
                  setStep(step - 1)
                  setError('')
                  setSuccess('')
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition"
                disabled={loading}
              >
                ← Back
              </button>
            )}
            <div className="ml-auto">
              {step < 4 ? (
                <>
                  {step === 2 && success && success.includes('manual') ? (
                    <button
                      onClick={() => {
                        setStep(3)
                        setSuccess('')
                        setError('')
                      }}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200"
                    >
                      Continue →
                    </button>
                  ) : (
                    <button
                      onClick={handleSetup}
                      disabled={loading}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Processing...' : step === 1 ? 'Test Connection' : step === 2 ? 'Setup Database' : 'Create Admin'}
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={handleComplete}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200"
                >
                  Go to Admin Panel →
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-gray-400 hover:text-white text-sm transition"
            >
              ← Back to website
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

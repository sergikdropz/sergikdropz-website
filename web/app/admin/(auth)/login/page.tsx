'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'

// Simple encryption/decryption for storing credentials
function encrypt(text: string, key: string): string {
  // Simple XOR encryption (not for production, but good enough for this use case)
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return btoa(result) // Base64 encode
}

function decrypt(encrypted: string, key: string): string {
  try {
    const text = atob(encrypted) // Base64 decode
    let result = ''
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return result
  } catch {
    return ''
  }
}

const STORAGE_KEY = 'admin_remember_me'
const ENCRYPTION_KEY = 'sergik_admin_2024' // In production, use a more secure key

function getRememberedCredentials() {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const decrypted = decrypt(stored, ENCRYPTION_KEY)
    const parsed = JSON.parse(decrypted)
    return { email: parsed.email, password: parsed.password }
  } catch {
    return null
  }
}

function saveRememberedCredentials(email: string, password: string) {
  if (typeof window === 'undefined') return
  try {
    const encrypted = encrypt(JSON.stringify({ email, password }), ENCRYPTION_KEY)
    localStorage.setItem(STORAGE_KEY, encrypted)
  } catch {
    // Ignore storage errors
  }
}

function clearRememberedCredentials() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage errors
  }
}

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoLoggingIn, setAutoLoggingIn] = useState(false)
  const hasAutoLoginAttemptedRef = useRef(false)

  useEffect(() => {
    if (hasAutoLoginAttemptedRef.current) return
    hasAutoLoginAttemptedRef.current = true

    // Server layout redirects authenticated admins to /admin.
    // Only run remembered-credentials / dev URL auto-login when still on this page.
    const remembered = getRememberedCredentials()
    const urlParams = new URLSearchParams(window.location.search)
    const urlEmail = urlParams.get('email')
    const urlPassword = urlParams.get('password')
    const urlError = urlParams.get('error')
    const wantEnvAutoLogin = urlParams.get('autologin') === '1'

    if (urlError) {
      setError(
        urlError === 'auto-login-not-configured'
          ? 'Dev auto-login is not configured. Set ADMIN_AUTO_LOGIN_EMAIL and ADMIN_AUTO_LOGIN_PASSWORD in web/.env.local.'
          : urlError
      )
    }

    if (urlEmail && urlPassword) {
      setEmail(urlEmail)
      setPassword(urlPassword)
      setRememberMe(true)
      setTimeout(() => {
        setAutoLoggingIn(true)
        void handleAutoLogin(urlEmail, urlPassword)
      }, 300)
      return
    }

    if (wantEnvAutoLogin) {
      setTimeout(() => {
        setAutoLoggingIn(true)
        void handleEnvAutoLogin()
      }, 200)
      return
    }

    if (remembered) {
      setEmail(remembered.email)
      setPassword(remembered.password)
      setRememberMe(true)
      setTimeout(() => {
        setAutoLoggingIn(true)
        void handleAutoLogin(remembered.email, remembered.password)
      }, 500)
    }
  }, [])

  async function finishAutoLogin(
    email: string,
    password: string,
    data: { session?: { access_token: string; refresh_token: string }; error?: string },
    responseOk: boolean
  ) {
    if (responseOk) {
      if (data.session) {
        try {
          const supabase = getSupabaseClient()
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
        } catch {
          // Ignore errors setting session
        }
      }

      if (email && password) {
        saveRememberedCredentials(email, password)
      }

      const sessionCheck = await fetch('/api/auth/session', { credentials: 'include' })
      const sessionData = await sessionCheck.json()
      if (sessionCheck.ok && sessionData.authenticated && sessionData.isAdmin) {
        window.location.replace('/admin')
        return
      }

      clearRememberedCredentials()
      setAutoLoggingIn(false)
      setError('Login succeeded, but session was not established. Please try again.')
      return
    }

    clearRememberedCredentials()
    setAutoLoggingIn(false)
    setError(data.error || 'Auto-login failed. Please sign in manually.')
  }

  async function handleEnvAutoLogin() {
    try {
      const response = await fetch('/api/auth/auto-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromEnv: true }),
      })
      const data = await response.json()
      await finishAutoLogin(data.user?.email || '', '', data, response.ok)
    } catch {
      clearRememberedCredentials()
      setAutoLoggingIn(false)
      setError('Auto-login failed. Please sign in manually.')
    }
  }

  async function handleAutoLogin(email: string, password: string) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, rememberMe: true }),
      })

      const data = await response.json()
      await finishAutoLogin(email, password, data, response.ok)
    } catch {
      clearRememberedCredentials()
      setAutoLoggingIn(false)
      setError('Auto-login failed. Please sign in manually.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, rememberMe }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      // Set the Supabase client session so AuthContext can detect it
      if (data.session) {
        try {
          const supabase = getSupabaseClient()
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
        } catch (err: any) {
          // Ignore errors setting session
        }
      }

      // Save credentials if "Remember me" is checked
      if (rememberMe) {
        saveRememberedCredentials(email, password)
      } else {
        clearRememberedCredentials()
      }

      const sessionCheck = await fetch('/api/auth/session', { credentials: 'include' })
      const sessionData = await sessionCheck.json()
      if (sessionCheck.ok && sessionData.authenticated && sessionData.isAdmin) {
        // Success - redirect to admin dashboard
        // Use window.location.replace for a full page reload that doesn't add to history
        window.location.replace('/admin')
        return
      }

      setError('Login succeeded, but session was not established. Please try again.')
      setLoading(false)
    } catch (err: any) {
      setError(err.message || 'Login failed')
      setLoading(false)
    }
  }

  if (autoLoggingIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 shadow-2xl text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Auto-logging in...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Admin Login</h1>
            <p className="text-gray-400">SERGIK Backend Management</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                placeholder="admin@example.com"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                placeholder="••••••••"
                disabled={loading || autoLoggingIn}
              />
            </div>

            <div className="flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 bg-gray-800 border-gray-700 rounded text-purple-600 focus:ring-purple-500 focus:ring-2"
                disabled={loading || autoLoggingIn}
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-300 cursor-pointer">
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || autoLoggingIn}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {autoLoggingIn ? 'Auto-logging in...' : loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center">
            <Link
              href="/"
              className="text-gray-400 hover:text-white text-sm transition block"
            >
              ← Back to website
            </Link>
            {process.env.NODE_ENV === 'development' && (
              <p className="text-xs text-gray-400">
                Dev: open /admin/login?autologin=1 (uses ADMIN_AUTO_LOGIN_* in .env.local)
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

export default function DebugPage() {
  const [checks, setChecks] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function runChecks() {
      const results: any = {
        timestamp: new Date().toISOString(),
        environment: typeof window !== 'undefined' ? 'client' : 'server',
      }

      // Check data files
      try {
        const artistData = await import('@/data/artist.json')
        results.artistData = {
          exists: !!artistData.default,
          keys: artistData.default ? Object.keys(artistData.default) : [],
        }
      } catch (e: any) {
        results.artistData = { error: e.message }
      }

      try {
        const releasesData = await import('@/data/releases.json')
        results.releasesData = {
          exists: !!releasesData.default,
          count: releasesData.default?.releases?.length || 0,
        }
      } catch (e: any) {
        results.releasesData = { error: e.message }
      }

      try {
        const musicLibraryData = await import('@/data/music-library.json')
        results.musicLibraryData = {
          exists: !!musicLibraryData.default,
          foldersCount: musicLibraryData.default?.folders?.length || 0,
          playlistsCount: musicLibraryData.default?.playlists?.length || 0,
        }
      } catch (e: any) {
        results.musicLibraryData = { error: e.message }
      }

      // Check environment variables (client-side)
      results.envVars = {
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NODE_ENV: process.env.NODE_ENV,
      }

      // Check API endpoints
      try {
        const supabaseCheck = await fetch('/api/supabase-check')
        results.supabaseCheck = {
          status: supabaseCheck.status,
          ok: supabaseCheck.ok,
        }
        if (supabaseCheck.ok) {
          const data = await supabaseCheck.json()
          results.supabaseCheckData = data
        }
      } catch (e: any) {
        results.supabaseCheck = { error: e.message }
      }

      setChecks(results)
      setLoading(false)
    }

    runChecks()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <h1 className="text-3xl font-bold mb-4">Debug Diagnostics</h1>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Debug Diagnostics</h1>
      <p className="text-gray-400 mb-8">Timestamp: {checks.timestamp}</p>

      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-semibold mb-2">Data Files</h2>
          <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(
              {
                artistData: checks.artistData,
                releasesData: checks.releasesData,
                musicLibraryData: checks.musicLibraryData,
              },
              null,
              2
            )}
          </pre>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-2">Environment Variables</h2>
          <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(checks.envVars, null, 2)}
          </pre>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-2">Supabase Check</h2>
          <pre className="bg-gray-900 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(checks.supabaseCheckData || checks.supabaseCheck, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  )
}

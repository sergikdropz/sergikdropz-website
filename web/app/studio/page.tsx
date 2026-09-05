'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from '@/components/studio/StudioPageShell'
import ReleaseReadinessRing from '@/components/studio/ReleaseReadinessRing'
import { WORKFLOW_STEPS } from '@/lib/studio/constants'
import {
  FaUpload,
  FaFileImport,
  FaCompactDisc,
  FaRocket,
  FaSatellite,
  FaArrowRight,
} from 'react-icons/fa'

export default function StudioDashboard() {
  const { user, isAdmin, loading } = useAuth()
  const [stats, setStats] = useState({
    totalTracks: 0,
    totalReleases: 0,
    draftReleases: 0,
    liveReleases: 0,
    avgReadiness: 0,
  })

  useEffect(() => {
    if (!isAdmin) return
    async function load() {
      const [tracksRes, releasesRes] = await Promise.all([
        fetch('/api/studio/tracks'),
        fetch('/api/studio/releases'),
      ])
      let totalTracks = 0
      let releases: any[] = []
      if (tracksRes.ok) {
        const d = await tracksRes.json()
        totalTracks = d.tracks?.length || 0
      }
      if (releasesRes.ok) {
        const d = await releasesRes.json()
        releases = d.releases || []
      }
      const scores = releases
        .map((r: any) => r.copyright?.readiness_score)
        .filter((n: number) => typeof n === 'number')
      setStats({
        totalTracks,
        totalReleases: releases.length,
        draftReleases: releases.filter((r: any) => r.distributor_status === 'draft').length,
        liveReleases: releases.filter((r: any) => r.distributor_status === 'live').length,
        avgReadiness: scores.length
          ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
          : 0,
      })
    }
    load()
  }, [isAdmin])

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-zinc-500">
        Loading Release Studio…
      </div>
    )
  }

  if (!user || !isAdmin) return null

  const actions = [
    {
      href: '/studio/releases/new',
      title: 'New release',
      desc: 'Package tracks, artwork, metadata',
      icon: FaCompactDisc,
      gradient: 'from-violet-600 to-indigo-600',
    },
    {
      href: '/studio/catalog/import',
      title: 'Bulk import',
      desc: 'ISRCs & split sheets via CSV',
      icon: FaFileImport,
      gradient: 'from-cyan-600 to-blue-600',
    },
    {
      href: '/studio/tracks/new',
      title: 'Upload track',
      desc: 'WAV + metadata',
      icon: FaUpload,
      gradient: 'from-teal-600 to-cyan-600',
    },
    {
      href: '/studio/releases/command-center',
      title: 'Command center',
      desc: 'Rights, risk, and ops queues',
      icon: FaSatellite,
      gradient: 'from-fuchsia-600 to-pink-600',
    },
    {
      href: '/studio/releases',
      title: 'All releases',
      desc: 'Pipeline and go-live',
      icon: FaRocket,
      gradient: 'from-amber-600 to-orange-600',
    },
  ]

  return (
    <StudioPageShell
      title="Your distribution stack"
      subtitle="Run SERGIK like a label: own the catalog, copyright checklist, marketing copy, DSP links, and publish to your site — no DistroKid required."
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        {[
          { label: 'Tracks', value: stats.totalTracks },
          { label: 'Releases', value: stats.totalReleases },
          { label: 'In draft', value: stats.draftReleases, accent: 'text-amber-400' },
          { label: 'Live', value: stats.liveReleases, accent: 'text-emerald-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-sm"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.accent || 'text-white'}`}>{s.value}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 flex items-center justify-center col-span-2 lg:col-span-1">
          <div className="text-center">
            <ReleaseReadinessRing score={stats.avgReadiness} size={56} />
            <p className="text-xs text-zinc-500 mt-2">Avg readiness</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-12">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group relative overflow-hidden rounded-2xl border border-zinc-800 p-6 hover:border-violet-500/50 transition"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${a.gradient} opacity-0 group-hover:opacity-10 transition`}
              />
              <Icon className="text-2xl text-zinc-500 group-hover:text-violet-400 mb-4 transition" />
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {a.title}
                <FaArrowRight className="text-xs opacity-0 group-hover:opacity-100 transition" />
              </h3>
              <p className="text-sm text-zinc-500 mt-1">{a.desc}</p>
            </Link>
          )
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8">
        <h2 className="text-lg font-semibold mb-6">Release pipeline</h2>
        <ol className="flex flex-wrap gap-4 md:gap-0 md:justify-between">
          {WORKFLOW_STEPS.map((step, i) => (
            <li key={step.id} className="flex items-center gap-3 md:flex-col md:text-center md:flex-1">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600/20 text-violet-300 text-sm font-bold ring-1 ring-violet-500/30">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-white text-sm">{step.label}</p>
                <p className="text-xs text-zinc-500">{step.description}</p>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <span className="hidden md:block text-zinc-700 mx-2">→</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </StudioPageShell>
  )
}

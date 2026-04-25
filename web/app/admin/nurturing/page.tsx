'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { FaSpinner } from 'react-icons/fa'
import {
  FaLink,
  FaUsers,
  FaEnvelope,
  FaCode,
  FaChartLine,
  FaArrowRight,
  FaRocket,
} from 'react-icons/fa'

interface PipelineRelease {
  id: string
  title: string
  release_date: string
  artwork: string | null
  campaign: { id: string; name: string; status: string } | null
  smart_link_data: { id: string; slug: string; total_clicks: number } | null
}

export default function NurturingHub() {
  const { user, loading } = useAuth()
  const [pipelineReleases, setPipelineReleases] = useState<PipelineRelease[]>([])
  const [loadingPipeline, setLoadingPipeline] = useState(true)

  useEffect(() => {
    fetch('/api/studio/release-pipeline')
      .then((res) => (res.ok ? res.json() : { releases: [] }))
      .then((data) => {
        const upcoming = (data.releases || [])
          .filter((r: any) => new Date(r.release_date) > new Date())
          .sort(
            (a: any, b: any) =>
              new Date(a.release_date).getTime() - new Date(b.release_date).getTime()
          )
          .slice(0, 3)
        setPipelineReleases(upcoming)
      })
      .catch(() => {})
      .finally(() => setLoadingPipeline(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="animate-spin text-4xl text-purple-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-5xl font-bold mb-4">Fan Nurturing Engine</h1>
          <p className="text-xl text-gray-400 max-w-2xl">
            Automate fan engagement, track smart links, schedule campaigns, and grow your audience organically.
          </p>
        </div>

        {/* Release Pipeline Widget */}
        {!loadingPipeline && pipelineReleases.length > 0 && (
          <div className="mb-12 bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FaRocket className="text-purple-400" /> Release Pipeline
              </h2>
              <Link
                href="/studio/releases/pipeline"
                className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition"
              >
                View Pipeline <FaArrowRight className="text-xs" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pipelineReleases.map((release) => (
                <div
                  key={release.id}
                  className="bg-gray-800 rounded-lg p-4 flex items-start gap-3"
                >
                  {release.artwork ? (
                    <img
                      src={release.artwork}
                      alt={release.title}
                      className="w-12 h-12 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                      <FaRocket className="text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{release.title}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(release.release_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          release.campaign
                            ? 'bg-green-900/50 text-green-400'
                            : 'bg-gray-700 text-gray-500'
                        }`}
                      >
                        {release.campaign ? release.campaign.status : 'No campaign'}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          release.smart_link_data
                            ? 'bg-green-900/50 text-green-400'
                            : 'bg-gray-700 text-gray-500'
                        }`}
                      >
                        {release.smart_link_data ? 'Link active' : 'No link'}
                      </span>
                    </div>
                    {!release.campaign && (
                      <Link
                        href="/studio/releases/pipeline"
                        className="text-xs text-purple-400 hover:text-purple-300 mt-1.5 inline-block transition"
                      >
                        Set Up Marketing
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-12">
          <StatCard label="Build email sequences with drag-and-drop" value="Sequences" />
          <StatCard label="Personalize campaigns with variables" value="Templates" />
          <StatCard label="Track all fan interactions" value="Smart Links" />
          <StatCard label="Real-time engagement metrics" value="Analytics" />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Smart Links Section */}
          <NavCard
            icon={<FaLink className="text-4xl text-blue-400" />}
            title="Smart Links"
            description="Create trackable links for releases, socials, and campaigns with UTM parameter tracking."
            links={[
              { label: 'Manage Links', href: '/admin/nurturing/smart-links' },
              { label: 'View Analytics', href: '/admin/nurturing/analytics' },
            ]}
          />

          {/* Fans Section */}
          <NavCard
            icon={<FaUsers className="text-4xl text-green-400" />}
            title="Fans"
            description="Manage your fan database, tag superfans, export data, and track engagement sources."
            links={[
              { label: 'Browse Fans', href: '/admin/nurturing/fans' },
              { label: 'Add Superfan', href: '/admin/nurturing/fans' },
            ]}
          />

          {/* Campaigns Section */}
          <NavCard
            icon={<FaEnvelope className="text-4xl text-purple-400" />}
            title="Campaigns"
            description="Schedule multi-email campaigns with T-timing (T-3, T0, T+2, T+7) for releases and engagement."
            links={[
              { label: 'Create Campaign', href: '/admin/nurturing/campaigns' },
              { label: 'View All', href: '/admin/nurturing/campaigns' },
            ]}
          />

          {/* Templates Section */}
          <NavCard
            icon={<FaCode className="text-4xl text-yellow-400" />}
            title="Email Templates"
            description="Design reusable email templates with variable support (${fanName}, ${releaseTitle}, etc)."
            links={[
              { label: 'Create Template', href: '/admin/nurturing/templates' },
              { label: 'Browse Templates', href: '/admin/nurturing/templates' },
            ]}
          />
        </div>

        {/* Analytics & Insights */}
        <NavCard
          icon={<FaChartLine className="text-4xl text-red-400" />}
          title="Analytics Dashboard"
          description="View comprehensive metrics: fan growth, email performance, click-through rates, top campaigns, and trends."
          links={[
            { label: 'Open Analytics', href: '/admin/nurturing/analytics' },
          ]}
          className="col-span-2"
        />

        {/* Quick Start */}
        <div className="mt-16 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-4">🚀 Get Started in 5 Minutes</h2>
          <ol className="space-y-3 text-gray-300">
            <li className="flex gap-3">
              <span className="font-bold text-purple-400">1.</span>
              <span>Go to <Link href="/admin/nurturing/templates" className="text-purple-400 hover:text-purple-300 underline">Templates</Link> and create your first email template (copy/paste HTML)</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-purple-400">2.</span>
              <span>Go to <Link href="/admin/nurturing/campaigns" className="text-purple-400 hover:text-purple-300 underline">Campaigns</Link> and create a new campaign for your next release</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-purple-400">3.</span>
              <span>Click into the campaign and add sequences (T-3, T0, T+2, T+7) using the sequence builder</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-purple-400">4.</span>
              <span>Click "Schedule Campaign" and pick your release date</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-purple-400">5.</span>
              <span>System automatically sends emails on schedule; watch metrics in Analytics</span>
            </li>
          </ol>
        </div>

        {/* Feature Grid */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold mb-8">Feature Highlights</h2>
          <div className="grid grid-cols-3 gap-6">
            <Feature
              icon="🎯"
              title="Smart Links"
              description="Track every click with UTM params, IP, device, and fan matching"
            />
            <Feature
              icon="📧"
              title="Automated Campaigns"
              description="Schedule campaigns with T-offset timing for precise release planning"
            />
            <Feature
              icon="👥"
              title="Fan Database"
              description="Organize fans into segments (superfans, superfans, etc) with tagging"
            />
            <Feature
              icon="📊"
              title="Real-time Analytics"
              description="Track open rates, click rates, and campaign performance"
            />
            <Feature
              icon="🎨"
              title="HTML Templates"
              description="Create once, reuse forever. Supports variable personalization"
            />
            <Feature
              icon="🔗"
              title="Email Personalization"
              description="Use ${variables} to customize every email for each fan"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  )
}

function NavCard({
  icon,
  title,
  description,
  links,
  className = '',
}: {
  icon: React.ReactNode
  title: string
  description: string
  links: { label: string; href: string }[]
  className?: string
}) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg p-8 hover:border-purple-500/50 transition ${className}`}>
      <div className="mb-4">{icon}</div>
      <h3 className="text-2xl font-bold mb-2">{title}</h3>
      <p className="text-gray-400 mb-6">{description}</p>
      <div className="flex flex-wrap gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium transition"
          >
            {link.label}
            <FaArrowRight className="text-sm" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="text-4xl mb-3">{icon}</div>
      <h4 className="text-lg font-bold mb-2">{title}</h4>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  )
}

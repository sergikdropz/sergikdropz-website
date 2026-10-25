'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from './StudioPageShell'
import StudioHubTabs from './StudioHubTabs'
import NewReleaseWizard from './NewReleaseWizard'
import TrackUploadPanel from './TrackUploadPanel'
import CatalogImportPanel from './CatalogImportPanel'
import { parseStudioCreateTab, studioCreateHref } from '@/lib/studio/studio-ia'

const TABS = [
  {
    id: 'release',
    label: 'Release',
    href: studioCreateHref('release'),
    hint: 'Package tracks, artwork, and metadata',
  },
  {
    id: 'track',
    label: 'Track',
    href: studioCreateHref('track'),
    hint: 'Upload a WAV into the catalog',
  },
  {
    id: 'import',
    label: 'Import',
    href: studioCreateHref('import'),
    hint: 'DistroKid, store URL, ISRCs, splits',
  },
]

function CreateHubInner() {
  const { user, isAdmin, loading } = useAuth()
  const searchParams = useSearchParams()
  const active = parseStudioCreateTab(searchParams.get('tab'))

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <StudioPageShell>
      <StudioHubTabs tabs={TABS} active={active} label="Create ingest" centered />
      {active === 'track' ? (
        <TrackUploadPanel />
      ) : active === 'import' ? (
        <CatalogImportPanel />
      ) : (
        <NewReleaseWizard />
      )}
    </StudioPageShell>
  )
}

export default function CreateHubPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
          Loading…
        </div>
      }
    >
      <CreateHubInner />
    </Suspense>
  )
}

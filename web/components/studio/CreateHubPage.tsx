'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from './StudioPageShell'
import StudioHubTabs from './StudioHubTabs'
import NewReleaseWizard from './NewReleaseWizard'
import TrackUploadPanel from './TrackUploadPanel'
import CatalogImportPanel from './CatalogImportPanel'
import {
  parseStudioCreateTab,
  studioCreateHref,
  type StudioCreateTab,
} from '@/lib/studio/studio-ia'

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

const COPY: Record<StudioCreateTab, { title: string; subtitle: string }> = {
  release: {
    title: 'Create',
    subtitle: 'Start a release, add a catalog track, or import ISRCs, splits, and DistroKid — one ingest path.',
  },
  track: {
    title: 'Create',
    subtitle: 'Upload a WAV, then mint an ISRC. Vault EPs still import from the Release tab.',
  },
  import: {
    title: 'Create',
    subtitle:
      'Migrate & keep streams: DistroKid JSON or Spotify/Apple URL, plus bulk ISRCs and split sheets.',
  },
}

function CreateHubInner() {
  const { user, isAdmin, loading } = useAuth()
  const searchParams = useSearchParams()
  const active = parseStudioCreateTab(searchParams.get('tab'))
  const copy = COPY[active]

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <StudioPageShell title={copy.title} subtitle={copy.subtitle}>
      <StudioHubTabs tabs={TABS} active={active} label="Create ingest" />
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

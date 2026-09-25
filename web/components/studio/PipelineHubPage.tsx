'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from './StudioPageShell'
import StudioHubTabs from './StudioHubTabs'
import CommandCenterPanel from './CommandCenterPanel'
import MarketingPipelinePanel from './MarketingPipelinePanel'
import ReleaseCalendarPanel from './ReleaseCalendarPanel'
import SoundExchangePanel from './SoundExchangePanel'
import DistroKidQueuePanel from './DistroKidQueuePanel'
import {
  parseStudioPipelineTab,
  studioPipelineHref,
  type StudioPipelineTab,
} from '@/lib/studio/studio-ia'

const TABS = [
  {
    id: 'ops',
    label: 'Ops',
    href: studioPipelineHref('ops'),
    hint: 'Risk, DSP ingest, contracts, UGC, collab',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    href: studioPipelineHref('marketing'),
    hint: 'Campaigns, smart links, press, DSP connect',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: studioPipelineHref('calendar'),
    hint: 'Yearly slate and spacing',
  },
  {
    id: 'distrokid',
    label: 'DistroKid',
    href: studioPipelineHref('distrokid'),
    hint: 'Scheduled uploads until Revelator',
  },
  {
    id: 'isrcs',
    label: 'ISRCs',
    href: studioPipelineHref('isrcs'),
    hint: 'SoundExchange lookup and history',
  },
]

const COPY: Record<StudioPipelineTab, { subtitle: string }> = {
  ops: {
    subtitle:
      'Cross-release ops with DSP ingest, contract emails, SERGIK UGC, store links, and Release Collab — risk, owners, and the next best action.',
  },
  marketing: {
    subtitle:
      'Campaigns, smart links, press notes, DSP connect, and collab — filtered by launch phase, not calendar placeholders.',
  },
  calendar: {
    subtitle: 'The yearly slate. Add placeholders here, then create the real package when masters land.',
  },
  distrokid: {
    subtitle:
      'Scheduled DSP delivery through DistroKid until Revelator Partner API keys are live. Upload on DistroKid, then mark the release submitted.',
  },
  isrcs: {
    subtitle:
      'Local-first SoundExchange registry — lookup, register QTA53 codes, export USISRC locker CSV, and mark accepted.',
  },
}

function PipelineHubInner() {
  const { user, isAdmin, loading } = useAuth()
  const searchParams = useSearchParams()
  const active = parseStudioPipelineTab(searchParams.get('tab'))
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
    <StudioPageShell title="Pipeline" subtitle={copy.subtitle}>
      <StudioHubTabs tabs={TABS} active={active} label="Release pipeline" />
      {active === 'marketing' ? (
        <MarketingPipelinePanel />
      ) : active === 'calendar' ? (
        <ReleaseCalendarPanel />
      ) : active === 'distrokid' ? (
        <DistroKidQueuePanel />
      ) : active === 'isrcs' ? (
        <SoundExchangePanel />
      ) : (
        <CommandCenterPanel />
      )}
    </StudioPageShell>
  )
}

export default function PipelineHubPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
          Loading…
        </div>
      }
    >
      <PipelineHubInner />
    </Suspense>
  )
}

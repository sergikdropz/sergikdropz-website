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
import { parseStudioPipelineTab, studioPipelineHref } from '@/lib/studio/studio-ia'

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

function PipelineHubInner() {
  const { user, isAdmin, loading } = useAuth()
  const searchParams = useSearchParams()
  const active = parseStudioPipelineTab(searchParams.get('tab'))

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
      <StudioHubTabs tabs={TABS} active={active} label="Release pipeline" centered />
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

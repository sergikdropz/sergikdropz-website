'use client'

import { useAuth } from '@/contexts/AdminAuthContext'
import { useParams } from 'next/navigation'
import ReleaseStudioWorkspace from '@/components/studio/ReleaseStudioWorkspace'
import StudioPageShell from '@/components/studio/StudioPageShell'

export default function ReleaseDetailPage() {
  const { user, isAdmin, loading } = useAuth()
  const params = useParams()
  const releaseId = params.id as string

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <StudioPageShell subtitle="Workflow: catalog → rights → copy → delivery → launch">
      <ReleaseStudioWorkspace releaseId={releaseId} />
    </StudioPageShell>
  )
}

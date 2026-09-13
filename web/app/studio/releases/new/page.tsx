'use client'

import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from '@/components/studio/StudioPageShell'
import NewReleaseWizard from '@/components/studio/NewReleaseWizard'

export default function NewReleasePage() {
  const { user, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <StudioPageShell
      title="New release"
      subtitle="Step through metadata, artwork, tracks, and copy — then open Release Studio to go live"
    >
      <NewReleaseWizard />
    </StudioPageShell>
  )
}

'use client'

import { useAuth } from '@/contexts/AdminAuthContext'
import StudioPageShell from '@/components/studio/StudioPageShell'
import CatalogImportPanel from '@/components/studio/CatalogImportPanel'

export default function CatalogImportPage() {
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
      title="Catalog import"
      subtitle="Bulk-assign ISRCs and split sheets from CSV — match by track_id or title"
    >
      <CatalogImportPanel />
    </StudioPageShell>
  )
}

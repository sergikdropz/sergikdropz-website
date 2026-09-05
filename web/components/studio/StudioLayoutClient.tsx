'use client'

import Link from 'next/link'
import AdminAiAssistant from '@/components/AdminAiAssistant'
import { AdminAiPageProvider } from '@/contexts/AdminAiPageContext'
import { AppShellWithCommands } from '@/components/shell/AppShellWithCommands'

export default function StudioLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AdminAiPageProvider surface="studio">
      <main
        className="min-h-screen pt-shell-top transition-[padding] duration-ui ease-out md:pt-0 md:pl-[calc(var(--shell-nav-width)+var(--admin-ai-dock-inset-left,0px))]"
        style={{ paddingRight: 'var(--admin-ai-dock-inset-right, var(--admin-ai-dock-inset, 0px))' }}
      >
        <AppShellWithCommands
          surface="studio"
          title="Release Studio"
          subtitle="Catalog, rights, copy, and go-live without DistroKid"
          headerAction={
            <Link href="/admin" className="text-sm text-ink-subtle transition hover:text-ink">
              Admin dashboard →
            </Link>
          }
        >
          {children}
        </AppShellWithCommands>
      </main>
      <AdminAiAssistant defaultOpen={false} />
    </AdminAiPageProvider>
  )
}

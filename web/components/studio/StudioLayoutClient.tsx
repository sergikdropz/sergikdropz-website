'use client'

import DeferredAdminAiAssistant from '@/components/DeferredAdminAiAssistant'
import { AdminAiPageProvider } from '@/contexts/AdminAiPageContext'
import { AppShellWithCommands } from '@/components/shell/AppShellWithCommands'

export default function StudioLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AdminAiPageProvider surface="studio">
      <main
        className="min-h-screen pt-shell-top transition-[padding] duration-ui ease-out md:pt-0 md:pl-[calc(var(--shell-nav-width)+var(--admin-ai-dock-inset-left,0px))]"
        style={{ paddingRight: 'var(--admin-ai-dock-inset-right, var(--admin-ai-dock-inset, 0px))' }}
      >
        <AppShellWithCommands surface="studio" showBreadcrumbs={false}>
          {children}
        </AppShellWithCommands>
      </main>
      <DeferredAdminAiAssistant defaultOpen={false} />
    </AdminAiPageProvider>
  )
}

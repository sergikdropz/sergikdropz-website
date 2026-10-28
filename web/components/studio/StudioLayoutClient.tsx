'use client'

import DeferredAdminAiAssistant from '@/components/DeferredAdminAiAssistant'
import { AdminAiPageProvider } from '@/contexts/AdminAiPageContext'
import { AppShellWithCommands } from '@/components/shell/AppShellWithCommands'

export default function StudioLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AdminAiPageProvider surface="studio">
      <main
        className="shell-main min-h-screen transition-[padding] duration-ui ease-out"
        style={{
          paddingRight:
            'calc(var(--shell-safe-right) + var(--admin-ai-dock-inset-right, var(--admin-ai-dock-inset, 0px)))',
        }}
      >
        <AppShellWithCommands surface="studio" showBreadcrumbs={false}>
          {children}
        </AppShellWithCommands>
      </main>
      <DeferredAdminAiAssistant defaultOpen={false} />
    </AdminAiPageProvider>
  )
}

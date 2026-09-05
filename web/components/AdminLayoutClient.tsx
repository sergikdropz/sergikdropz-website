'use client'

import { usePathname } from 'next/navigation'
import { AdminAiPageProvider } from '@/contexts/AdminAiPageContext'
import { MusicPlayerProvider } from '@/contexts/MusicPlayerContext'
import AdminNav from './AdminNav'
import AdminAiAssistant from './AdminAiAssistant'
import { AppShellWithCommands } from '@/components/shell/AppShellWithCommands'
import LazyGlobalMusicPlayer from '@/components/LazyGlobalMusicPlayer'

function isAdminMusicRoute(pathname: string | null) {
  return Boolean(pathname?.startsWith('/admin/music'))
}

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <MusicPlayerProvider>
      <AdminAiPageProvider surface="admin">
        <div className="min-h-screen bg-surface">
          <AdminNav />
          <main
            className="min-h-screen pt-shell-top transition-[padding] duration-ui ease-out md:pt-0 md:pl-[calc(var(--shell-nav-width)+var(--admin-ai-dock-inset-left,0px))] [padding-bottom:var(--global-music-player-height,0px)]"
            style={{ paddingRight: 'var(--admin-ai-dock-inset-right, var(--admin-ai-dock-inset, 0px))' }}
          >
            <AppShellWithCommands surface="admin">{children}</AppShellWithCommands>
          </main>
          <AdminAiAssistant defaultOpen={false} />
          {isAdminMusicRoute(pathname) ? <LazyGlobalMusicPlayer /> : null}
        </div>
      </AdminAiPageProvider>
    </MusicPlayerProvider>
  )
}

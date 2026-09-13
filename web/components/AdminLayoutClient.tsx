'use client'

import { usePathname } from 'next/navigation'
import { AdminAiPageProvider } from '@/contexts/AdminAiPageContext'
import { MusicPlayerProvider } from '@/contexts/MusicPlayerContext'
import AdminNav from './AdminNav'
import DeferredAdminAiAssistant from './DeferredAdminAiAssistant'
import { AppShellWithCommands } from '@/components/shell/AppShellWithCommands'
import LazyGlobalMusicPlayer from '@/components/LazyGlobalMusicPlayer'

function isAdminMusicRoute(pathname: string | null) {
  if (!pathname) return false
  return (
    pathname.startsWith('/admin/music') ||
    pathname.startsWith('/admin/music-library') ||
    pathname.startsWith('/admin/music-vault') ||
    pathname.startsWith('/admin/sonic-dna')
  )
}

function AdminChrome({
  children,
  withPlayer,
}: {
  children: React.ReactNode
  withPlayer: boolean
}) {
  return (
    <div className="min-h-screen bg-surface">
      <AdminNav />
      <main
        className="min-h-screen pt-shell-top transition-[padding] duration-ui ease-out md:pt-0 md:pl-[calc(var(--shell-nav-width)+var(--admin-ai-dock-inset-left,0px))] [padding-bottom:var(--global-music-player-height,0px)]"
        style={{ paddingRight: 'var(--admin-ai-dock-inset-right, var(--admin-ai-dock-inset, 0px))' }}
      >
        <AppShellWithCommands surface="admin">{children}</AppShellWithCommands>
      </main>
      <DeferredAdminAiAssistant defaultOpen={false} />
      {withPlayer ? <LazyGlobalMusicPlayer /> : null}
    </div>
  )
}

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'
  const musicRoute = isAdminMusicRoute(pathname)

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <AdminAiPageProvider surface="admin">
      {musicRoute ? (
        // Provider must wrap page content — music-vault / music use useMusicPlayer().
        <MusicPlayerProvider>
          <AdminChrome withPlayer>{children}</AdminChrome>
        </MusicPlayerProvider>
      ) : (
        <AdminChrome withPlayer={false}>{children}</AdminChrome>
      )}
    </AdminAiPageProvider>
  )
}

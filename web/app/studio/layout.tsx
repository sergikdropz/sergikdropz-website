import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import AdminNav from '@/components/AdminNav'
import StudioLayoutClient from '@/components/studio/StudioLayoutClient'
import NotificationToast from '@/components/NotificationToast'

export const dynamic = 'force-dynamic'

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()

  if (!session?.isAdmin) {
    redirect('/admin/login')
  }

  return (
    <AdminAuthProvider initialSession={session}>
      <NotificationProvider>
        <div className="min-h-screen bg-surface">
          <AdminNav />
          <StudioLayoutClient>
            {children}
            <NotificationToast />
          </StudioLayoutClient>
        </div>
      </NotificationProvider>
    </AdminAuthProvider>
  )
}

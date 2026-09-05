import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getServerSession } from '@/lib/auth'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import AdminLayoutClient from '@/components/AdminLayoutClient'
import NotificationToast from '@/components/NotificationToast'

export const dynamic = 'force-dynamic'

export default async function AdminProtectedLayout({
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
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-black">
              <div className="text-white text-xl">Loading...</div>
            </div>
          }
        >
          <AdminLayoutClient>{children}</AdminLayoutClient>
          <NotificationToast />
        </Suspense>
      </NotificationProvider>
    </AdminAuthProvider>
  )
}

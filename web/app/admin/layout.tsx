import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getServerSession } from '@/lib/auth'
import { AuthProvider } from '@/contexts/AuthContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import AdminLayoutClient from '@/components/AdminLayoutClient'
import NotificationToast from '@/components/NotificationToast'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''
  const session = await getServerSession()

  // Skip auth check for login and setup pages (route group doesn't prevent layout execution)
  const isAuthRoute = pathname === '/admin/login' || pathname === '/admin/setup'
  
  if (isAuthRoute) {
    if (session?.isAdmin && pathname === '/admin/login') {
      redirect('/admin')
    }
    return <>{children}</>
  }
  
  try {
    if (!session?.isAdmin) {
      redirect('/admin/login')
    }

    // Always wrap with AuthProvider and NotificationProvider
    // MusicPlayerProvider is provided by root layout - don't create duplicate provider
    // Use Suspense to handle loading states during hot reload
    return (
      <AuthProvider>
        <NotificationProvider>
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-black">
              <div className="text-white text-xl">Loading...</div>
            </div>
          }>
            <AdminLayoutClient>
              {children}
            </AdminLayoutClient>
            <NotificationToast />
            {/* GlobalMusicPlayer is rendered by root layout - no need to duplicate here */}
          </Suspense>
        </NotificationProvider>
      </AuthProvider>
    )
  } catch (error: any) {
    // If there's any error (e.g., Supabase not configured), redirect to login
    console.error('Admin layout error:', error)
    redirect('/admin/login')
  }
}

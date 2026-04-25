import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import { AuthProvider } from '@/contexts/AuthContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import AdminNav from '@/components/AdminNav'
import NotificationToast from '@/components/NotificationToast'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check authentication - reuse existing auth system
  const session = await getServerSession()

  if (!session || !session.isAdmin) {
    redirect('/admin/login')
  }

  return (
    <AuthProvider>
      <NotificationProvider>
        <div className="min-h-screen bg-black">
          <AdminNav />
          <main className="pt-14 md:pt-0 md:pl-56">
            <div className="bg-gray-900 border-b border-gray-800">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-white">Studio</h1>
                    <p className="text-gray-400 text-sm">Distribution workflow & ISRC management</p>
                  </div>
                  <Link
                    href="/admin"
                    className="text-gray-400 hover:text-white text-sm transition"
                  >
                    ← Back to Dashboard
                  </Link>
                </div>
              </div>
            </div>
            {children}
            <NotificationToast />
          </main>
        </div>
      </NotificationProvider>
    </AuthProvider>
  )
}

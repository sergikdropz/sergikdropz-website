import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Login/setup only — no AdminAuthProvider (avoids competing auth listeners). */
export default async function AdminAuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''

  if (pathname === '/admin/login') {
    const session = await getServerSession()
    if (session?.isAdmin) {
      redirect('/admin')
    }
  }

  return children
}

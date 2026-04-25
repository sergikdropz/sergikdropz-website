'use client'

import { usePathname } from 'next/navigation'
import AdminNav from './AdminNav'

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  // Login page doesn't need the full layout
  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-black">
      <AdminNav />
      <main className="pt-14 md:pt-0 md:pl-56 min-h-screen">
        {children}
      </main>
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function AdminInstagram() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user || !isAdmin) {
        router.push('/admin/login')
      } else {
        // Redirect to unified Instagram Helper page
        router.push('/instagram-helper')
      }
    }
  }, [user, isAdmin, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-white text-xl">Redirecting to Instagram Helper...</div>
    </div>
  )
}

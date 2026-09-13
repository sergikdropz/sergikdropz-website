'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Book() {
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to Contact page
    router.replace('/contact')
  }, [router])

  return (
    <div className="pt-20 min-h-screen relative flex items-center justify-center">
      <div className="container mx-auto px-4 py-16 relative z-10 text-center">
        <p className="text-gray-400">Redirecting to Contact...</p>
      </div>
    </div>
  )
}


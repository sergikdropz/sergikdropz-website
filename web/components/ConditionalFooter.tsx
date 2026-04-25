'use client'

import { usePathname } from 'next/navigation'
import Footer from './Footer'

export default function ConditionalFooter() {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin')
  const isStudioRoute = pathname?.startsWith('/studio')
  
  // Don't show website footer on admin or studio routes
  if (isAdminRoute || isStudioRoute) {
    return null
  }
  
  return <Footer />
}

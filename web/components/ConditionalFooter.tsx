'use client'

import { usePathname } from 'next/navigation'
import Footer from './Footer'

export default function ConditionalFooter() {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin')
  const isStudioRoute = pathname?.startsWith('/studio')
  const isMusicLibraryRoute = pathname?.startsWith('/music-library')
  
  // Don't show website footer on admin, studio, or music vault (player + in-page socials)
  if (isAdminRoute || isStudioRoute || isMusicLibraryRoute) {
    return null
  }
  
  return <Footer />
}

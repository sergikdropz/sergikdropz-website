'use client'

import { usePathname } from 'next/navigation'
import NavigationButtons from './NavigationButtons'

export default function ConditionalNavigationButtons() {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin')
  const isStudioRoute = pathname?.startsWith('/studio')
  const isMusicLibraryMain =
    pathname === '/music-library' || pathname === '/music-library/'
  const isMusicPage = pathname === '/music' || pathname === '/music/'
  const isVideosPage = pathname === '/videos' || pathname === '/videos/'

  // Don't show navigation buttons on admin or studio routes
  if (isAdminRoute || isStudioRoute) {
    return null
  }

  // These pages embed the same links inside their own layout.
  if (isMusicLibraryMain || isMusicPage || isVideosPage) {
    return null
  }

  return <NavigationButtons />
}

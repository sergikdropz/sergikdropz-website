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

  // Don't show navigation buttons on admin or studio routes
  if (isAdminRoute || isStudioRoute) {
    return null
  }

  // Music Library / Music embed these links inside their page containers
  if (isMusicLibraryMain || isMusicPage) {
    return null
  }

  return <NavigationButtons />
}

'use client'

import { usePathname } from 'next/navigation'
import NavigationButtons from './NavigationButtons'

export default function ConditionalNavigationButtons() {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin')
  const isStudioRoute = pathname?.startsWith('/studio')
  const isMusicLibraryMain =
    pathname === '/music-library' || pathname === '/music-library/'

  // Don't show navigation buttons on admin or studio routes
  if (isAdminRoute || isStudioRoute) {
    return null
  }

  // Music Library embeds these links at the bottom of the vault container
  if (isMusicLibraryMain) {
    return null
  }

  return <NavigationButtons />
}

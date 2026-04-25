'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Header from './Header'

export default function ConditionalHeader() {
  const pathname = usePathname()
  const [isDJMode, setIsDJMode] = useState(false)
  
  const isAdminRoute = pathname?.startsWith('/admin')
  const isStudioRoute = pathname?.startsWith('/studio')
  
  // Check for DJ mode via body data attribute
  useEffect(() => {
    const checkDJMode = () => {
      setIsDJMode(document.body.getAttribute('data-dj-mode') === 'true')
    }
    
    // Initial check
    checkDJMode()
    
    // Watch for changes
    const observer = new MutationObserver(checkDJMode)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-dj-mode']
    })
    
    return () => observer.disconnect()
  }, [])
  
  // Don't show website header on admin, studio routes, or in DJ mode
  if (isAdminRoute || isStudioRoute || isDJMode) {
    return null
  }
  
  return <Header />
}

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache for 5 minutes (matching API revalidate)
            staleTime: 5 * 60 * 1000,
            // Keep in cache for 10 minutes
            gcTime: 10 * 60 * 1000,
            // Retry failed requests 3 times
            retry: 3,
            // Don't refetch on window focus for music data
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtoolsWrapper />
    </QueryClientProvider>
  )
}

function ReactQueryDevtoolsWrapper() {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin') ?? false

  if (!isAdminRoute) {
    return null
  }

  return <ReactQueryDevtools initialIsOpen={false} />
}
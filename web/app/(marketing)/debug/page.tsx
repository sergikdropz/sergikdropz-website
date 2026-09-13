import { notFound } from 'next/navigation'

// Debug diagnostics are intentionally restricted to local development.
// In production this URL returns 404.
export default function DebugPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  return <DebugClient />
}

// Dynamically import the heavy client component so production builds
// tree-shake it completely.
import dynamic from 'next/dynamic'
const DebugClient = dynamic(() => import('./DebugClient'), { ssr: false })

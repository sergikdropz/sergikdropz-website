import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SERGIK TV',
  description: 'Watch SERGIK videos and browse releases with a remote.',
  robots: { index: false, follow: false },
}

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black text-white">{children}</div>
}

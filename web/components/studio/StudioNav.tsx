'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FaCompactDisc, FaComments, FaHome, FaPlus, FaProjectDiagram } from 'react-icons/fa'
import { STUDIO_PATHS, isStudioNavActive, type StudioNavId } from '@/lib/studio/studio-ia'

const links: { href: string; label: string; icon: typeof FaHome; id: StudioNavId }[] = [
  { id: 'home', href: STUDIO_PATHS.home, label: 'Home', icon: FaHome },
  { id: 'releases', href: STUDIO_PATHS.releases, label: 'Releases', icon: FaCompactDisc },
  { id: 'create', href: STUDIO_PATHS.create, label: 'Create', icon: FaPlus },
  { id: 'pipeline', href: STUDIO_PATHS.pipeline, label: 'Pipeline', icon: FaProjectDiagram },
  { id: 'collab', href: STUDIO_PATHS.collab, label: 'Release Collab', icon: FaComments },
]

export default function StudioNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2 mb-8" aria-label="Release Studio">
      {links.map(({ href, label, icon: Icon, id }) => {
        const active = isStudioNavActive(id, pathname)
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition border ${
              active
                ? 'bg-violet-600/20 border-violet-500/50 text-violet-200'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
            }`}
          >
            <Icon className="text-xs opacity-80" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FaCompactDisc,
  FaHome,
  FaRocket,
  FaDatabase,
  FaUpload,
  FaSatellite,
  FaFileImport,
} from 'react-icons/fa'

const links = [
  { href: '/studio', label: 'Home', icon: FaHome, exact: true },
  { href: '/studio/releases', label: 'Releases', icon: FaCompactDisc },
  { href: '/studio/releases/new', label: 'New release', icon: FaRocket },
  { href: '/studio/catalog/import', label: 'Import', icon: FaFileImport },
  { href: '/studio/tracks/new', label: 'Upload', icon: FaUpload },
  { href: '/studio/releases/command-center', label: 'Command', icon: FaSatellite },
  { href: '/studio/soundexchange', label: 'SoundExchange', icon: FaDatabase },
]

export default function StudioNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2 mb-8" aria-label="Release Studio">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname?.startsWith(`${href}/`)
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

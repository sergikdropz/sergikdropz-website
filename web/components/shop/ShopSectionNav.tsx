'use client'

type ShopSection = {
  id: string
  label: string
}

type ShopSectionNavProps = {
  sections: ShopSection[]
}

export default function ShopSectionNav({ sections }: ShopSectionNavProps) {
  if (sections.length === 0) return null

  return (
    <nav
      aria-label="Shop sections"
      className="sticky top-[var(--site-header-offset,5rem)] z-40 -mx-4 px-4 py-3 mb-8 border-y border-gray-800/80 bg-black/90 backdrop-blur-md transition-[top] duration-300 ease-out motion-reduce:transition-none safe-area-top"
    >
      <div className="overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        <ul className="mx-auto flex w-max max-w-full flex-wrap justify-center gap-2 sm:flex-nowrap">
          {sections.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

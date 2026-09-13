'use client'

export type TabItem = { id: string; label: string }

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line" role="tablist">
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={[
              'px-3 py-2 text-sm transition-colors duration-ui',
              active
                ? 'border-b-2 border-brand text-ink'
                : 'text-ink-subtle hover:text-ink',
            ].join(' ')}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

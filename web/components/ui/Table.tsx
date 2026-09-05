import type { ReactNode } from 'react'

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['overflow-x-auto rounded-panel border border-line', className].join(' ')}>
      <table className="min-w-full divide-y divide-line text-left text-sm text-ink">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-subtle">{children}</thead>
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line bg-surface-raised/40">{children}</tbody>
}

export function TR({ children }: { children: ReactNode }) {
  return <tr className="hover:bg-surface-muted/40">{children}</tr>
}

export function TH({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>
}

export function TD({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-middle">{children}</td>
}

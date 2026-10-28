'use client'

import { useEffect, useState } from 'react'
import { FloatingMenuPortal } from '@/components/ui/FloatingMenuPortal'

interface SizeGuideProps {
  onClose: () => void
  /** Printful catalog product id — enables the real, per-product size table. */
  productId?: number | null
  /** Sizes actually sold for this design, used to trim the table. */
  sizes?: (string | null)[]
}

type SizeTable = {
  type: string
  unit: string
  description?: string
  columns: string[]
  rows: Array<{ size: string; values: string[] }>
}

// Generic fallback used when a product has no Printful size data.
const FALLBACK: SizeTable = {
  type: 'fallback',
  unit: 'inches',
  description: 'Measurements in inches. Unisex / standard fit.',
  columns: ['Chest', 'Length', 'Sleeve'],
  rows: [
    { size: 'S', values: ['34-36', '27', '8'] },
    { size: 'M', values: ['38-40', '28', '8.5'] },
    { size: 'L', values: ['42-44', '29', '9'] },
    { size: 'XL', values: ['46-48', '30', '9.5'] },
    { size: '2XL', values: ['50-52', '31', '10'] },
    { size: '3XL', values: ['54-56', '32', '10.5'] },
  ],
}

function stripHtml(html?: string): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function SizeGuide({ onClose, productId, sizes }: SizeGuideProps) {
  const [unit, setUnit] = useState<'inches' | 'cm'>('inches')
  const [tables, setTables] = useState<SizeTable[] | null>(null)
  const [loading, setLoading] = useState(Boolean(productId))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!productId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setFailed(false)
    const sold = (sizes || []).filter(Boolean).join(',')
    const qs = new URLSearchParams({ unit })
    if (sold) qs.set('sizes', sold)
    fetch(`/api/merch/catalog/${productId}/sizes?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('no sizes'))))
      .then((data) => {
        if (cancelled) return
        const got = Array.isArray(data.tables) ? (data.tables as SizeTable[]) : []
        if (got.length === 0) {
          setFailed(true)
          setTables(null)
        } else {
          setTables(got)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [productId, unit, sizes])

  const usingReal = Boolean(productId) && !failed && Boolean(tables?.length)
  // Prefer the garment measurement table; fall back to the first available one.
  const active =
    tables?.find((t) => t.type === 'product_measure') || tables?.[0] || (usingReal ? null : FALLBACK)

  return (
    <FloatingMenuPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60" onClick={onClose} />
        <div className="relative bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Size Guide</h3>
            <div className="flex items-center gap-3">
              {usingReal && (
                <div className="flex rounded-md border border-gray-700 overflow-hidden text-xs">
                  {(['inches', 'cm'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnit(u)}
                      className={`px-2 py-1 transition-colors ${
                        unit === u ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {u === 'inches' ? 'in' : 'cm'}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 animate-pulse" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-7 bg-gray-800 rounded" />
              ))}
            </div>
          ) : active ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-400 font-medium">Size</th>
                    {active.columns.map((col) => (
                      <th key={col} className="text-left py-2 text-gray-400 font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((row) => (
                    <tr key={row.size} className="border-b border-gray-800/50">
                      <td className="py-2 text-white font-semibold">{row.size}</td>
                      {row.values.map((value, i) => (
                        <td key={i} className="py-2 text-gray-300">
                          {value}
                          {value ? (active.unit === 'cm' ? ' cm' : '"') : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-gray-500 text-xs mt-4">
                {usingReal
                  ? stripHtml(active.description) ||
                    'Product measurements may vary by up to 2".'
                  : 'Measurements in inches. Unisex / standard fit.'}
              </p>
              <p className="text-gray-500 text-xs mt-2">
                Tip: If you&#39;re between sizes, we recommend going one size up.
              </p>
            </>
          ) : (
            <p className="text-gray-400 text-sm">Size guide unavailable for this product.</p>
          )}
        </div>
      </div>
    </FloatingMenuPortal>
  )
}

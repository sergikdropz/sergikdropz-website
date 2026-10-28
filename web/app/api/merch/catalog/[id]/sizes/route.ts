import { NextRequest, NextResponse } from 'next/server'
import { printfulCatalogFetch } from '@/lib/printful'

export const dynamic = 'force-dynamic'
// Size tables rarely change; let the edge cache hold them for a day.
export const revalidate = 86400

type RawValue = { size?: string; value?: string; min_value?: string; max_value?: string }
type RawMeasurement = { type_label?: string; values?: RawValue[] }
type RawTable = {
  type?: string
  unit?: string
  description?: string
  measurements?: RawMeasurement[]
}

function formatValue(v: RawValue): string {
  if (v.value != null && v.value !== '') return v.value
  if (v.min_value || v.max_value) return [v.min_value, v.max_value].filter(Boolean).join('–')
  return ''
}

/** Normalize one Printful size table into aligned columns + per-size rows. */
function normalizeTable(table: RawTable, sizeFilter?: Set<string>) {
  const measurements = Array.isArray(table.measurements) ? table.measurements : []
  const columns = measurements.map((m) => m.type_label || '').filter(Boolean)

  // Collect every size that appears, preserving first-seen order.
  const order: string[] = []
  const bySize = new Map<string, Record<string, string>>()
  measurements.forEach((m) => {
    const label = m.type_label || ''
    for (const v of m.values || []) {
      const size = v.size || ''
      if (!size) continue
      if (sizeFilter && sizeFilter.size > 0 && !sizeFilter.has(size)) continue
      if (!bySize.has(size)) {
        bySize.set(size, {})
        order.push(size)
      }
      bySize.get(size)![label] = formatValue(v)
    }
  })

  const rows = order.map((size) => ({
    size,
    values: columns.map((col) => bySize.get(size)?.[col] ?? ''),
  }))

  return {
    type: table.type || 'size',
    unit: table.unit || 'inches',
    description: typeof table.description === 'string' ? table.description : undefined,
    columns,
    rows,
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const productId = Number(params.id)
  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })
  }

  const unit = request.nextUrl.searchParams.get('unit') === 'cm' ? 'cm' : 'inches'
  // Optionally limit rows to the sizes actually sold for this design.
  const sizeParam = request.nextUrl.searchParams.get('sizes')
  const sizeFilter = sizeParam
    ? new Set(sizeParam.split(',').map((s) => s.trim()).filter(Boolean))
    : undefined

  try {
    const data = await printfulCatalogFetch(`/products/${productId}/sizes?unit=${unit}`)
    const result = data?.result || {}
    const rawTables = Array.isArray(result.size_tables) ? (result.size_tables as RawTable[]) : []
    const tables = rawTables
      .map((table) => normalizeTable(table, sizeFilter))
      .filter((table) => table.columns.length > 0 && table.rows.length > 0)

    return NextResponse.json({
      productId,
      unit,
      availableSizes: Array.isArray(result.available_sizes) ? result.available_sizes : [],
      tables,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not load size guide'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

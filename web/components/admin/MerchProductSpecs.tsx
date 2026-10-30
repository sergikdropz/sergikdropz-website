'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { CatalogPrintFile, CatalogProductDetail } from '@/lib/merch/printful-catalog-types'
import { guidelinesForTypes, type FileGuidelineRow } from '@/lib/merch/product-specs'
import { readStudioDockOpen, writeStudioDockOpen } from '@/lib/merch/studio-session'

type Tab = 'description' | 'shipping' | 'guidelines' | 'availability' | 'source'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'description', label: 'Description' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'guidelines', label: 'File guidelines' },
  { id: 'availability', label: 'Availability' },
  { id: 'source', label: 'Source' },
]

type Props = {
  detail: CatalogProductDetail
  printFiles: CatalogPrintFile[]
  technique: string
  layout: 'stage' | 'rail'
}

export default function MerchProductSpecs({ detail, printFiles, technique, layout }: Props) {
  const specs = detail.specs
  const [tab, setTab] = useState<Tab>(layout === 'rail' ? 'guidelines' : 'description')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(readStudioDockOpen('product-specs', false))
  }, [])
  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    writeStudioDockOpen('product-specs', next)
  }
  if (!specs) return null

  const guidelines = guidelinesForTypes(
    specs.guidelines,
    printFiles.map((file) => file.type)
  )
  const techniqueLabel = detail.techniques.find((item) => item.key === technique)?.label || technique

  if (layout === 'rail') {
    return (
      <GuidelineBlock
        rows={guidelines}
        live={specs.guidelinesLive}
        compact
      />
    )
  }

  const product = detail.product
  const subtitle = [product.brand, product.model, product.typeName].filter(Boolean).join(' · ')
  const inStockRegions = specs.regions.filter((region) => region.inStock > 0).length

  return (
    <div className="divide-y divide-white/10">
      {/* Header: what this is + section tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="product-specs-body"
          onClick={toggleOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Product specs</p>
            <p className="mt-0.5 truncate text-sm text-white">{product.title}</p>
            {subtitle && <p className="truncate text-[11px] text-white/45">{subtitle}</p>}
          </div>
          <span
            aria-hidden
            className={`ml-auto shrink-0 text-white/45 transition ${open ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
        {open ? (
        <div role="tablist" aria-label="Product spec sections" className="flex gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[10px] uppercase tracking-wide ${
                tab === item.id ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:bg-white/15'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        ) : null}
      </div>

      {open ? (
      <div id="product-specs-body">
      {/* At-a-glance facts in even columns */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-4 md:grid-cols-3">
        <SummaryColumn label="Customization">
          <p className="text-sm text-white">{techniqueLabel}</p>
          {printFiles.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {printFiles.map((file) => (
                <span
                  key={file.fileId || file.type}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/75"
                >
                  {file.title}
                  {file.additionalPrice != null && file.additionalPrice > 0 ? (
                    <span className="text-white/45"> +${file.additionalPrice.toFixed(2)}</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-white/45">No placements for this technique.</p>
          )}
        </SummaryColumn>

        <SummaryColumn label="Style and fit">
          {specs.styleLines.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {specs.styleLines.slice(0, 6).map((line) => (
                <span key={line} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                  {line}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-white/45">Printful lists no fit notes for this blank.</p>
          )}
          {specs.materials.length > 0 && (
            <p className="mt-1.5 text-[11px] text-white/55">
              {specs.materials.map((item) => `${item.percentage}% ${item.name}`).join(' · ')}
            </p>
          )}
        </SummaryColumn>

        <SummaryColumn label="Fulfillment">
          <dl className="space-y-1 text-[11px]">
            <Fact term="Avg. fulfillment" value={product.avgFulfillmentDays != null ? `~${product.avgFulfillmentDays} days` : '—'} />
            <Fact
              term="Regions"
              value={specs.regions.length > 0 ? `${inStockRegions}/${specs.regions.length} stocked` : '—'}
            />
            <Fact term="Sourced from" value={specs.sourcedFrom || specs.originCountry || '—'} />
          </dl>
        </SummaryColumn>
      </div>

      {/* Detail for the selected tab */}
      <div className="max-h-[320px] overflow-y-auto px-6 py-4">
        {tab === 'description' && <DescriptionTab lead={specs.lead} bullets={specs.bullets} />}
        {tab === 'shipping' && <ShippingTab regions={specs.regions} fulfillmentDays={detail.product.avgFulfillmentDays} />}
        {tab === 'guidelines' && <GuidelineBlock rows={guidelines} live={specs.guidelinesLive} />}
        {tab === 'availability' && <AvailabilityTab regions={specs.regions} />}
        {tab === 'source' && (
          <SourceTab
            brand={detail.product.brand}
            model={detail.product.model}
            typeName={detail.product.typeName}
            originCountry={specs.originCountry}
            sourcedFrom={specs.sourcedFrom}
            materials={specs.materials}
          />
        )}
      </div>
      </div>
      ) : null}
    </div>
  )
}

function SummaryColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</p>
      {children}
    </div>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/45">{term}</dt>
      <dd className="text-right text-white/80">{value}</dd>
    </div>
  )
}

function DescriptionTab({ lead, bullets }: { lead: string; bullets: string[] }) {
  if (!lead && bullets.length === 0) {
    return <p className="text-[11px] text-white/45">Printful has no description for this blank.</p>
  }
  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-white/70">
      {lead && <p>{lead}</p>}
      {bullets.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ShippingTab({
  regions,
  fulfillmentDays,
}: {
  regions: Array<{ region: string; label: string }>
  fulfillmentDays: number | null
}) {
  return (
    <div className="space-y-1 text-[11px] leading-relaxed text-white/70">
      {fulfillmentDays != null && <p>Average fulfillment is about {fulfillmentDays} days.</p>}
      {regions.length > 0 ? (
        <p>Printful fulfills this blank in {regions.map((region) => region.label).join(', ')}.</p>
      ) : (
        <p>Fulfillment regions appear when Printful reports stock locations for this blank.</p>
      )}
    </div>
  )
}

function AvailabilityTab({
  regions,
}: {
  regions: Array<{ region: string; label: string; inStock: number; total: number }>
}) {
  if (regions.length === 0) {
    return <p className="text-[11px] text-white/45">No regional stock counts on this blank.</p>
  }
  return (
    <ul className="space-y-1">
      {regions.map((region) => (
        <li key={region.region} className="flex items-center justify-between gap-3 text-[11px] text-white/75">
          <span>{region.label}</span>
          <span className="tabular-nums text-white/50">
            {region.inStock}/{region.total} in stock
          </span>
        </li>
      ))}
    </ul>
  )
}

function SourceTab({
  brand,
  model,
  typeName,
  originCountry,
  sourcedFrom,
  materials,
}: {
  brand: string | null
  model: string | null
  typeName: string
  originCountry: string | null
  sourcedFrom: string | null
  materials: Array<{ name: string; percentage: number }>
}) {
  const rows = [
    ['Brand', brand],
    ['Model', model],
    ['Type', typeName],
    ['Origin', originCountry],
    ['Sourced from', sourcedFrom],
  ].filter((row): row is [string, string] => Boolean(row[1]))
  return (
    <div className="space-y-2 text-[11px] text-white/75">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-white/40">{label}</span>
          <span className="text-right">{value}</span>
        </div>
      ))}
      {materials.length > 0 && (
        <p className="text-white/60">
          {materials.map((item) => `${item.name} ${item.percentage}%`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function GuidelineBlock({
  rows,
  live,
  compact = false,
}: {
  rows: FileGuidelineRow[]
  live: boolean
  compact?: boolean
}) {
  if (rows.length === 0) {
    return <p className="text-[11px] text-white/45">This technique has no print placements.</p>
  }
  return (
    <div>
      <p className={`mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 ${compact ? '' : 'sr-only'}`}>
        File guidelines
      </p>
      <div className={compact ? 'space-y-2' : 'overflow-x-auto'}>
        {compact ? (
          rows.map((row) => <GuidelineCard key={row.types.join('-')} row={row} />)
        ) : (
          <table className="w-full min-w-[520px] text-left text-[11px] text-white/75">
            <thead className="text-[10px] uppercase tracking-wide text-white/40">
              <tr>
                <th className="py-1 pr-3 font-medium">Placement</th>
                <th className="py-1 pr-3 font-medium">Sizes</th>
                <th className="py-1 pr-3 font-medium">Max print area</th>
                <th className="py-1 pr-3 font-medium">Print file size</th>
                <th className="py-1 font-medium">Template</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.types.join('-')} className="border-t border-white/10">
                  <td className="py-1.5 pr-3">
                    {row.placement}
                    {priceSuffix(row.additionalPrice)}
                  </td>
                  <td className="py-1.5 pr-3 text-white/55">{row.sizes}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{row.maxPrintArea || '—'}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.printFileSize || '—'}
                    {row.printWidth && row.printHeight ? (
                      <span className="block text-[10px] text-white/35">
                        {row.printWidth} × {row.printHeight} px
                        {row.dpi ? ` · ${row.dpi} DPI` : ''}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5">
                    <TemplateLink url={row.templateUrl} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!live && (
        <p className="mt-2 text-[10px] leading-relaxed text-white/40">
          Placement names come from the Printful catalog. Print area, file size, and template downloads load when
          PRINTFUL_API_KEY is set.
        </p>
      )}
      <ul className="mt-3 space-y-1 text-[10px] leading-relaxed text-white/50">
        <li>PNG or JPEG, at least 150 DPI (300 DPI for paper).</li>
        <li>sRGB color profile.</li>
        <li>Delete template guide layers before you save the print file.</li>
      </ul>
    </div>
  )
}

function GuidelineCard({ row }: { row: FileGuidelineRow }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[11px] text-white">
        {row.placement}
        {priceSuffix(row.additionalPrice)}
      </p>
      <p className="mt-0.5 text-[10px] text-white/45">{row.sizes}</p>
      <p className="mt-1 text-[10px] text-white/60">
        Max print area {row.maxPrintArea || '—'}
      </p>
      <p className="text-[10px] text-white/60">
        Print file {row.printFileSize || '—'}
        {row.printWidth && row.printHeight ? ` · ${row.printWidth}×${row.printHeight}px` : ''}
      </p>
      {row.templateUrl && (
        <p className="mt-1">
          <TemplateLink url={row.templateUrl} />
        </p>
      )}
    </div>
  )
}

function TemplateLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-white/30">—</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-wide text-white/70 hover:text-white">
      Download
    </a>
  )
}

function priceSuffix(price: number | null): string {
  if (price == null || price <= 0) return ''
  return ` +$${price.toFixed(2)}`
}

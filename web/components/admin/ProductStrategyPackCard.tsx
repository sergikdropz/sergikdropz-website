'use client'

import type { ReactNode } from 'react'
import { AdminAssistantRichText } from '@/components/AdminChatMessageContent'

function CopyButton({ label, text }: { label: string; text: string }) {
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="rounded border border-indigo-500/40 bg-indigo-950/50 px-2 py-0.5 text-[10px] font-medium text-indigo-100 hover:bg-indigo-900/60"
    >
      {label}
    </button>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-indigo-500/30 bg-indigo-950/40 px-2 py-0.5 text-[10px] text-indigo-100/95">
      {children}
    </span>
  )
}

function DetailsSection({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      className="rounded-lg border border-gray-700/80 bg-gray-900/40 text-[11px] text-gray-200"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none px-2 py-1.5 font-semibold text-gray-100 hover:bg-gray-800/60">
        {title}
      </summary>
      <div className="border-t border-gray-800/90 px-2 py-2">{children}</div>
    </details>
  )
}

export function isProductStrategyPackOutput(output: Record<string, unknown>): boolean {
  return output.packVersion === '1.0.0' && typeof output.generatedAt === 'string'
}

export function ProductStrategyPackCard({
  output,
  density = 'full',
  onSendPolishToChat,
}: {
  output: Record<string, unknown>
  density?: 'compact' | 'full'
  /** Append the markdown polish block as a new assistant message in the thread. */
  onSendPolishToChat?: (markdown: string) => void
}) {
  if (!isProductStrategyPackOutput(output)) {
    return (
      <pre className="max-h-48 overflow-auto rounded border border-gray-700 bg-black/40 p-2 text-[10px] text-gray-400">
        {JSON.stringify(output, null, 2)}
      </pre>
    )
  }

  const brandName = String(output.brandName ?? '')
  const primaryGoal = String(output.primaryGoal ?? '')
  const siteUrl = output.siteUrl != null ? String(output.siteUrl) : ''
  const timelineWeeks = Number(output.timelineWeeks ?? 4)
  const focusAreas = Array.isArray(output.focusAreas) ? output.focusAreas.map(String) : []
  const refinedMarkdown =
    typeof output.refinedMarkdown === 'string' && output.refinedMarkdown.trim()
      ? output.refinedMarkdown.trim()
      : null
  const refinementMeta = output.refinementMeta as { provider?: string | null; modelId?: string } | undefined

  const siteAudit = output.siteAudit as Record<string, unknown> | null | undefined
  const conversionWorkflow = output.conversionWorkflow as Record<string, unknown> | null | undefined
  const seoStrategy = output.seoStrategy as Record<string, unknown> | null | undefined
  const campaignBlueprint = output.campaignBlueprint as Record<string, unknown> | null | undefined
  const adminConfigTemplates = output.adminConfigTemplates as Record<string, unknown> | null | undefined

  const contextReminder = Array.isArray(output.contextReminder) ? output.contextReminder.map(String) : []

  return (
    <div className="space-y-2 rounded-xl border border-indigo-600/35 bg-gradient-to-b from-indigo-950/50 to-gray-950/90 p-3 text-[11px] text-gray-100 shadow-inner shadow-black/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300/90">
            Marketing &amp; product strategy pack
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">{brandName}</p>
          <p className="mt-1 text-[11px] leading-snug text-gray-300">{primaryGoal}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {focusAreas.map((f) => (
              <Chip key={f}>{f.replace(/_/g, ' ')}</Chip>
            ))}
            <Chip>{timelineWeeks} wk horizon</Chip>
            {siteUrl ? <Chip>{siteUrl}</Chip> : null}
          </div>
        </div>
        <CopyButton label="Copy JSON" text={JSON.stringify(output, null, 2)} />
      </div>

      {contextReminder.length > 0 && density === 'full' ? (
        <ul className="list-inside list-disc text-[10px] text-gray-400">
          {contextReminder.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}

      {refinedMarkdown ? (
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/25 p-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">LLM polish</p>
            {refinementMeta?.provider ? (
              <span className="text-[9px] text-gray-500">
                {refinementMeta.provider}
                {refinementMeta.modelId ? ` · ${refinementMeta.modelId}` : ''}
              </span>
            ) : null}
          </div>
          <div className="mt-2 max-w-none text-[11px] leading-relaxed text-gray-100">
            <AdminAssistantRichText content={refinedMarkdown} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <CopyButton label="Copy polish" text={refinedMarkdown} />
            {onSendPolishToChat ?
              <button
                type="button"
                onClick={() => onSendPolishToChat(refinedMarkdown)}
                aria-label="Add LLM strategy polish to chat thread"
                className="rounded border border-emerald-500/50 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-50 hover:bg-emerald-800/50"
              >
                Add polish to thread
              </button>
            : null}
          </div>
        </div>
      ) : null}

      {density === 'compact' ? null : (
        <>
          {siteAudit ?
            <DetailsSection title="Site audit" defaultOpen>
              <AuditSection data={siteAudit} />
            </DetailsSection>
          : null}

          {conversionWorkflow ?
            <DetailsSection title="Conversion workflow">
              <ConversionSection data={conversionWorkflow} />
            </DetailsSection>
          : null}

          {seoStrategy ?
            <DetailsSection title="SEO">
              <SeoSection data={seoStrategy} />
            </DetailsSection>
          : null}

          {campaignBlueprint ?
            <DetailsSection title="Campaign blueprint">
              <CampaignSection data={campaignBlueprint} />
            </DetailsSection>
          : null}

          {adminConfigTemplates ?
            <DetailsSection title="Admin snippets">
              <AdminSnippetsSection data={adminConfigTemplates} />
            </DetailsSection>
          : null}
        </>
      )}
    </div>
  )
}

function AuditSection({ data }: { data: Record<string, unknown> }) {
  const qs = Array.isArray(data.stakeholderQuestions) ? data.stakeholderQuestions.map(String) : []
  const prompts = Array.isArray(data.capturePrompts) ? data.capturePrompts.map(String) : []
  const checklist = Array.isArray(data.heuristicChecklist) ? data.heuristicChecklist : []

  return (
    <div className="space-y-2">
      {typeof data.howToUse === 'string' ?
        <p className="text-gray-400">{data.howToUse}</p>
      : null}
      {qs.length ?
        <>
          <p className="font-medium text-gray-300">Stakeholder questions</p>
          <ul className="list-inside list-disc text-gray-400">
            {qs.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      : null}
      {prompts.length ?
        <>
          <p className="font-medium text-gray-300">Screenshot prompts</p>
          <ul className="list-inside list-disc text-gray-400">
            {prompts.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      : null}
      {checklist.map((row, i) => {
        const r = row as { area?: string; checks?: string[] }
        const checks = Array.isArray(r.checks) ? r.checks : []
        return (
          <div key={i}>
            <p className="font-medium text-indigo-200/90">{r.area}</p>
            <ul className="ml-2 list-inside list-disc text-gray-400">
              {checks.map((c, j) => (
                <li key={j}>{c}</li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function ConversionSection({ data }: { data: Record<string, unknown> }) {
  const funnel = Array.isArray(data.funnel) ? data.funnel : []
  const landing = Array.isArray(data.landingPageTemplate) ? data.landingPageTemplate : []
  const emails = Array.isArray(data.emailSequenceOutline) ? data.emailSequenceOutline : []

  return (
    <div className="space-y-2">
      {typeof data.northStarMetric === 'string' ?
        <p className="text-indigo-200/90">{data.northStarMetric}</p>
      : null}
      {funnel.length ?
        <>
          <p className="font-medium text-gray-300">Funnel</p>
          <ul className="space-y-1 text-gray-400">
            {funnel.map((row, i) => {
              const r = row as Record<string, string>
              return (
                <li key={i}>
                  <span className="text-gray-200">{r.stage}</span> — {r.objective}{' '}
                  <span className="text-gray-500">({r.metricHint})</span>
                </li>
              )
            })}
          </ul>
        </>
      : null}
      {landing.map((block, i) => {
        const b = block as { block?: string; content?: string[] }
        const lines = Array.isArray(b.content) ? b.content : []
        return (
          <div key={i}>
            <p className="font-medium text-gray-300">{b.block}</p>
            <ul className="ml-2 list-inside list-disc text-gray-400">
              {lines.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
          </div>
        )
      })}
      {emails.length ?
        <>
          <p className="font-medium text-gray-300">Email beats</p>
          <ul className="space-y-1 text-gray-400">
            {emails.map((row, i) => {
              const r = row as Record<string, string | number>
              return (
                <li key={i}>
                  <span className="text-gray-200">Day {r.dayOffset}</span> — {String(r.subjectAngle)} ·{' '}
                  {String(r.bodyGoals)}
                </li>
              )
            })}
          </ul>
        </>
      : null}
    </div>
  )
}

function SeoSection({ data }: { data: Record<string, unknown> }) {
  const buckets = Array.isArray(data.seedKeywordBuckets) ? data.seedKeywordBuckets : []
  const briefs = Array.isArray(data.contentBriefs) ? data.contentBriefs : []
  const structure = Array.isArray(data.proposedSiteStructure) ? data.proposedSiteStructure : []
  const tech = Array.isArray(data.technicalNotes) ? data.technicalNotes.map(String) : []

  return (
    <div className="space-y-2">
      {buckets.map((row, i) => {
        const r = row as { bucket?: string; examples?: string[] }
        const ex = Array.isArray(r.examples) ? r.examples : []
        return (
          <div key={i}>
            <p className="font-medium text-gray-300">{r.bucket}</p>
            <p className="text-gray-400">{ex.join(' · ')}</p>
          </div>
        )
      })}
      {briefs.map((row, i) => {
        const r = row as { slugIdea?: string; intent?: string; outline?: string[] }
        const outline = Array.isArray(r.outline) ? r.outline : []
        return (
          <div key={i}>
            <p className="font-medium text-indigo-200/90">{r.slugIdea}</p>
            <p className="text-gray-400">{r.intent}</p>
            <ul className="ml-2 list-inside list-disc text-gray-500">
              {outline.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
          </div>
        )
      })}
      {structure.length ?
        <>
          <p className="font-medium text-gray-300">IA draft</p>
          <ul className="text-gray-400">
            {structure.map((row, i) => {
              const r = row as { path?: string; role?: string }
              return (
                <li key={i}>
                  <span className="font-mono text-indigo-200/80">{r.path}</span> — {r.role}
                </li>
              )
            })}
          </ul>
        </>
      : null}
      {tech.length ?
        <>
          <p className="font-medium text-gray-300">Technical</p>
          <ul className="list-inside list-disc text-gray-500">
            {tech.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </>
      : null}
    </div>
  )
}

function CampaignSection({ data }: { data: Record<string, unknown> }) {
  const checklist = Array.isArray(data.launchChecklist) ? data.launchChecklist.map(String) : []
  const weeks = Array.isArray(data.socialCalendarScaffold) ? data.socialCalendarScaffold : []
  const timing = Array.isArray(data.timingNotes) ? data.timingNotes.map(String) : []

  return (
    <div className="space-y-2">
      {checklist.length ?
        <>
          <p className="font-medium text-gray-300">Launch checklist</p>
          <ul className="list-inside list-disc text-gray-400">
            {checklist.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </>
      : null}
      {weeks.map((row, i) => {
        const w = row as Record<string, unknown>
        const themes = Array.isArray(w.themes) ? w.themes.map(String) : []
        const slots = Array.isArray(w.slots) ? w.slots : []
        return (
          <div key={i} className="rounded border border-gray-800/80 bg-black/20 p-2">
            <p className="font-semibold text-gray-200">Week {String(w.week)}</p>
            <p className="text-gray-500">{themes.join(' · ')}</p>
            <p className="text-[10px] text-gray-500">{String(w.cadenceHint ?? '')}</p>
            <ul className="mt-1 space-y-0.5 text-gray-400">
              {slots.map((slot, j) => {
                const s = slot as { channel?: string; idea?: string }
                return (
                  <li key={j}>
                    <span className="text-gray-300">{s.channel}</span> — {s.idea}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      {timing.length ?
        <>
          <p className="font-medium text-gray-300">Timing</p>
          <ul className="list-inside list-disc text-gray-500">
            {timing.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </>
      : null}
    </div>
  )
}

function AdminSnippetsSection({ data }: { data: Record<string, unknown> }) {
  const blocks = Array.isArray(data.pasteBlocks) ? data.pasteBlocks : []
  const hints = Array.isArray(data.envHints) ? data.envHints.map(String) : []

  return (
    <div className="space-y-2">
      {blocks.map((row, i) => {
        const b = row as { label?: string; template?: string }
        const body = String(b.template ?? '')
        return (
          <div key={i} className="flex flex-col gap-1 rounded border border-gray-800 bg-black/25 p-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[10px] font-medium text-gray-300">{b.label}</span>
              <CopyButton label="Copy" text={body} />
            </div>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-gray-400">
              {body}
            </pre>
          </div>
        )
      })}
      {hints.length ?
        <>
          <p className="font-medium text-gray-300">Config hygiene</p>
          <ul className="list-inside list-disc text-gray-500">
            {hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </>
      : null}
    </div>
  )
}

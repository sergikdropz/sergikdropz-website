/**
 * Read-only grounding injected into Admin AI chat when the user points at a
 * control or asks about the open desk / active release. Never writes or clicks.
 */

import { runAdminBrowserAction } from '@/lib/ai/admin-browser'
import { deskCardForUrl, formatDeskCard } from '@/lib/ai/admin-ai-desks'
import { fetchReleaseStudioSnapshot } from '@/lib/studio/release-snapshot'

const MAX_LIVE_CHARS = 6_000
const MAX_FIELDS = 36
const MAX_PAGE_TEXT = 1_800

export function messageWantsLiveContext(message: string): boolean {
  const t = message.trim()
  if (!t) return false
  if (/(^|\n)(Page:|Selected:|DOM Path:|Visible:)/.test(t)) return true
  if (/@(?:release|growth|ops|due|desk:)/i.test(t)) return true
  if (
    /\b(upc|isrc|this field|this control|this form|open page|on the page|probe|what does this|leave blank|already have)\b/i.test(
      t,
    )
  ) {
    return true
  }
  return /distrokid|revelator|soundexchange|spotify artists|youtube studio|sx direct|us isrc/i.test(t)
}

export function messageWantsFormProbe(message: string): boolean {
  return (
    /\b(upc|isrc|field|form|input|blank|required|invalid|fill|prefill|songwriter|genre|release date)\b/i.test(
      message,
    ) || /<(input|textarea|select)\b/i.test(message)
  )
}

/** Skip a second form probe when the picker already sent live State for a control. */
export function messageAlreadyHasControlState(message: string): boolean {
  return /^State:\s+/m.test(message) && /<(input|textarea|select)\b/i.test(message)
}

function slimReleaseBlock(snapshot: Awaited<ReturnType<typeof fetchReleaseStudioSnapshot>>): string {
  const r = snapshot.release
  const tracks = snapshot.tracks || []
  const upc = String(r.upc || '').trim() || '(empty — DistroKid may assign on new upload)'
  const blockers =
    snapshot.copyright && Array.isArray((snapshot.copyright as { blockers?: unknown }).blockers)
      ? ((snapshot.copyright as { blockers: string[] }).blockers || []).slice(0, 8)
      : []
  const isrcs = tracks
    .map((track, i) => {
      const title = String(track.title || `Track ${i + 1}`).trim()
      const isrc = String(track.isrc || '').trim() || '(missing)'
      return `${i + 1}. ${title}: ${isrc}`
    })
    .slice(0, 20)
  return [
    `Release: ${String(r.title || '').trim() || r.id}`,
    `id: ${r.id}`,
    `distributor_status: ${String(r.distributor_status || '').trim() || '—'}`,
    `release_date: ${String(r.release_date || '').trim() || '—'}`,
    `upc: ${upc}`,
    `previously_released: ${Boolean(r.previously_released)}`,
    `tracks: ${tracks.length}`,
    ...isrcs.map((line) => `  ${line}`),
    blockers.length ? `blockers: ${blockers.join('; ')}` : 'blockers: none listed',
  ].join('\n')
}

function formatFieldProbe(fields: NonNullable<Awaited<ReturnType<typeof runAdminBrowserAction>>['fieldProbe']>): string {
  const rows = fields.slice(0, MAX_FIELDS).map((f) => {
    const bits = [
      f.label || f.placeholder || f.name || f.id || f.tag,
      f.type ? `type=${f.type}` : '',
      f.value ? `value=${JSON.stringify(f.value)}` : 'value=(empty)',
      f.required ? 'required' : '',
      f.invalid ? 'invalid' : '',
      f.checked != null ? `checked=${f.checked}` : '',
    ].filter(Boolean)
    return `- ${bits.join(' · ')}`
  })
  const more = fields.length > MAX_FIELDS ? `\n… ${fields.length - MAX_FIELDS} more fields omitted` : ''
  return `Form fields (${Math.min(fields.length, MAX_FIELDS)} of ${fields.length}):\n${rows.join('\n')}${more}`
}

/** Builds a LIVE CONTEXT block, or '' when nothing useful is available. */
export async function buildAdminAiLiveContextPrompt(input: {
  message: string
  releaseId?: string | null
  chatSessionId?: string | null
}): Promise<string> {
  if (!messageWantsLiveContext(input.message)) return ''

  const parts: string[] = []
  const wantsProbe =
    messageWantsFormProbe(input.message) && !messageAlreadyHasControlState(input.message)
  const pageMatch = input.message.match(/^Page:\s*(\S+)/m)
  const pageUrl = pageMatch?.[1] || ''

  const browserPromise = (async () => {
    try {
      const status = await runAdminBrowserAction({
        action: 'status',
        actor: 'assistant',
        includeImage: false,
        chatSessionId: input.chatSessionId || undefined,
      })
      if (!status.enabled) {
        return 'Browser: unavailable on this host.'
      }
      if (!status.running) {
        return 'Browser: not open. Open a desk bookmark or /exec admin_browser navigate first.'
      }
      const lines = [
        `Browser open: ${status.url || '(no url)'}`,
        status.title ? `Title: ${status.title}` : '',
        `You drive: ${status.youDrive ? 'yes (assistant will not click or type)' : 'no'}`,
      ]
      const desk = deskCardForUrl(status.url || pageUrl)
      if (desk) lines.push(formatDeskCard(desk))

      if (wantsProbe) {
        const probe = await runAdminBrowserAction({
          action: 'probe_fields',
          actor: 'assistant',
          includeImage: false,
          chatSessionId: input.chatSessionId || undefined,
        })
        if (probe.error) {
          lines.push(`Form probe: ${probe.error}`)
        } else if (probe.fieldProbe?.length) {
          lines.push(formatFieldProbe(probe.fieldProbe))
        } else {
          const read = await runAdminBrowserAction({
            action: 'read',
            actor: 'assistant',
            includeImage: false,
            chatSessionId: input.chatSessionId || undefined,
          })
          if (read.text?.trim()) {
            lines.push(`Page text (truncated):\n${read.text.trim().slice(0, MAX_PAGE_TEXT)}`)
          }
        }
      }
      return lines.filter(Boolean).join('\n')
    } catch (err) {
      return `Browser: ${err instanceof Error ? err.message : 'lookup failed'}`
    }
  })()

  const releasePromise = (async () => {
    const releaseId = input.releaseId?.trim()
    if (!releaseId) return ''
    const wantsRelease =
      wantsProbe ||
      /\b(upc|isrc|this release|release studio|metadata|blocker|distrokid|revelator)\b/i.test(
        input.message,
      ) ||
      Boolean(deskCardForUrl(pageUrl)?.skillHint === 'studio_release')
    if (!wantsRelease) return ''
    try {
      const snapshot = await fetchReleaseStudioSnapshot(releaseId)
      return `Release Studio (auto):\n${slimReleaseBlock(snapshot)}`
    } catch (err) {
      return `Release Studio: ${err instanceof Error ? err.message : 'lookup failed'}`
    }
  })()

  const [browserBlock, releaseBlock] = await Promise.all([browserPromise, releasePromise])
  if (browserBlock) parts.push(browserBlock)
  if (releaseBlock) parts.push(releaseBlock)
  if (!parts.length) return ''

  let body = ['LIVE CONTEXT (read-only, captured for this turn — treat as tool output)', ...parts].join(
    '\n\n',
  )
  if (body.length > MAX_LIVE_CHARS) {
    body = `${body.slice(0, MAX_LIVE_CHARS)}\n… [live context truncated]`
  }
  return body
}

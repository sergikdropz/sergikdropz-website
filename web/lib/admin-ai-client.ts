/** Client helpers to open the floating Admin AI from Release Studio UI. */

import type { AdminAiFocusContext } from '@/lib/ai/admin-ai-focus-context'
import type { AdminBrowserHydrateDetail } from '@/lib/ai/admin-browser-hydrate'
import {
  ADMIN_AI_BROWSER_HYDRATE_CHANNEL,
  ADMIN_AI_BROWSER_HYDRATE_EVENT,
  ADMIN_AI_BROWSER_HYDRATE_STORAGE_KEY,
} from '@/lib/ai/admin-browser-hydrate'

export type AdminAiPromptDetail = {
  message: string
  agentMode?: string
}

const PENDING_PROMPT_KEY = '__sergikAdminAiLastPrompt'
const PENDING_BROWSER_HYDRATE_KEY = '__sergikAdminAiBrowserHydrate'

let hydrateChannel: BroadcastChannel | null = null

function getHydrateChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!hydrateChannel) {
    try {
      hydrateChannel = new BroadcastChannel(ADMIN_AI_BROWSER_HYDRATE_CHANNEL)
    } catch {
      hydrateChannel = null
    }
  }
  return hydrateChannel
}

function publishBrowserHydrate(detail: AdminBrowserHydrateDetail) {
  const envelope = { t: Date.now(), detail }
  try {
    localStorage.setItem(ADMIN_AI_BROWSER_HYDRATE_STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    /* quota / private mode */
  }
  try {
    getHydrateChannel()?.postMessage(envelope)
  } catch {
    /* ignore */
  }
}

export function dispatchAdminAiPrompt(detail: AdminAiPromptDetail) {
  if (typeof window === 'undefined') return
  ;(window as Window & { [PENDING_PROMPT_KEY]?: AdminAiPromptDetail })[PENDING_PROMPT_KEY] = detail
  window.dispatchEvent(
    new CustomEvent('admin-ai:prompt', {
      detail,
    })
  )
}

export function consumePendingAdminAiPrompt(): AdminAiPromptDetail | null {
  if (typeof window === 'undefined') return null
  const host = window as Window & { [PENDING_PROMPT_KEY]?: AdminAiPromptDetail }
  const pending = host[PENDING_PROMPT_KEY] || null
  delete host[PENDING_PROMPT_KEY]
  return pending
}

export function openAdminAiAssistant() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('admin-ai:open'))
}

/**
 * Open Admin AI browser dock on the matching HOMES desk and stage paste text
 * (social caption or DistroKid worksheet). Never auto-typed — dock waits for user Paste.
 * Also publishes to BroadcastChannel + localStorage so the Admin AI popout window receives it.
 */
export function dispatchAdminAiBrowserHydrate(detail: AdminBrowserHydrateDetail) {
  if (typeof window === 'undefined') return
  ;(window as Window & { [PENDING_BROWSER_HYDRATE_KEY]?: AdminBrowserHydrateDetail })[
    PENDING_BROWSER_HYDRATE_KEY
  ] = detail
  openAdminAiAssistant()
  window.dispatchEvent(new CustomEvent(ADMIN_AI_BROWSER_HYDRATE_EVENT, { detail }))
  publishBrowserHydrate(detail)
}

export function consumePendingAdminAiBrowserHydrate(): AdminBrowserHydrateDetail | null {
  if (typeof window === 'undefined') return null
  const host = window as Window & { [PENDING_BROWSER_HYDRATE_KEY]?: AdminBrowserHydrateDetail }
  const pending = host[PENDING_BROWSER_HYDRATE_KEY] || null
  delete host[PENDING_BROWSER_HYDRATE_KEY]
  return pending
}

/** Subscribe to hydrate from Studio (same tab event + popout BroadcastChannel/storage). */
export function subscribeAdminAiBrowserHydrate(
  onDetail: (detail: AdminBrowserHydrateDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined

  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<AdminBrowserHydrateDetail>).detail
    onDetail(detail)
  }
  window.addEventListener(ADMIN_AI_BROWSER_HYDRATE_EVENT, onEvent as EventListener)

  const onStorage = (event: StorageEvent) => {
    if (event.key !== ADMIN_AI_BROWSER_HYDRATE_STORAGE_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as { detail?: unknown }
      if (parsed?.detail) onDetail(parsed.detail as AdminBrowserHydrateDetail)
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('storage', onStorage)

  const channel = getHydrateChannel()
  const onMessage = (event: MessageEvent) => {
    const detail = (event.data as { detail?: unknown } | null)?.detail
    if (detail) onDetail(detail as AdminBrowserHydrateDetail)
  }
  channel?.addEventListener('message', onMessage)

  return () => {
    window.removeEventListener(ADMIN_AI_BROWSER_HYDRATE_EVENT, onEvent as EventListener)
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onMessage)
  }
}

/** Probe OlliN Pro harness + Crowe Logic + optional release Sonic DNA unified roll-up. */
export function dispatchAdminAiSergikaiChat(content: string, opts?: { sessionId?: string; dryRun?: boolean }) {
  dispatchAdminAiPrompt({
    message: `/exec query_sergikai_chat ${JSON.stringify({
      content,
      sessionId: opts?.sessionId,
      dryRun: opts?.dryRun !== false,
    })}`,
    agentMode: 'sergik_intelligence',
  })
  openAdminAiAssistant()
}

export function dispatchAdminAiIntelligenceStack(input?: {
  releaseId?: string
  query?: string
  mode?: 'stack' | 'probe' | 'catalog' | 'knowledge' | 'ping' | 'dev_mode'
}) {
  const payload: Record<string, unknown> = {
    mode: input?.mode ?? 'stack',
  }
  if (input?.query?.trim()) payload.query = input.query.trim()
  if (input?.releaseId?.trim()) payload.releaseId = input.releaseId.trim()
  dispatchAdminAiPrompt({
    message: `/exec query_intelligence_harness ${JSON.stringify(payload)}`,
    agentMode: 'sergik_intelligence',
  })
  openAdminAiAssistant()
}

export function dispatchAdminAiApplyField(detail: { fieldId: string; value: string }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('admin-ai:apply-field', {
      detail,
    })
  )
}

/** Open assistant with a prompt tailored to the currently focused field. */
export function dispatchAdminAiSuggestForFocus(
  focus: AdminAiFocusContext,
  mode: 'suggest' | 'improve' | 'fill' = 'suggest'
) {
  const verb =
    mode === 'fill'
      ? 'Draft a value for this empty field'
      : mode === 'improve'
        ? 'Improve this field value'
        : 'Suggest a value for this field'

  const lines = [
    `${verb}: **${focus.fieldLabel}** (\`${focus.fieldKey}\`).`,
    focus.entityType
      ? `Entity: ${focus.entityType}${focus.entityId ? ` \`${focus.entityId}\`` : ''}${focus.entityLabel ? ` — ${focus.entityLabel}` : ''}.`
      : '',
    focus.hint ? `Hint: ${focus.hint}` : '',
    `Current value: ${focus.value ? JSON.stringify(focus.value) : '(empty)'}`,
    'Reply with the exact text to use. End with a ```ai-apply {"value":"..."}``` block when ready to paste into the field.',
  ].filter(Boolean)

  dispatchAdminAiPrompt({
    message: lines.join('\n'),
    agentMode: 'studio_release',
  })
  openAdminAiAssistant()
}

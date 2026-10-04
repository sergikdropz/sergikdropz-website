'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyFieldValue,
  parseAiApplyBlock,
  refreshFocusFromDom,
  scrollToField,
  setFieldHighlight,
  type AdminAiFocusContext,
} from '@/lib/ai/admin-ai-focus-context'
import {
  buildFieldCopilotPrompt,
  getFieldCopilotQuickActions,
  type FieldCopilotIntent,
} from '@/lib/ai/admin-ai-field-copilot'
import { dispatchAdminAiPrompt, dispatchAdminAiSuggestForFocus } from '@/lib/admin-ai-client'

type FieldCopilotDraft = {
  actionLabel: string
  reply: string
  applyValue: string | null
}

export type FieldCopilotPanelProps = {
  focus: AdminAiFocusContext
  enabled: boolean
  busy: boolean
  onClear: () => void
  onFocusUpdate: (focus: AdminAiFocusContext) => void
  /** Inline copilot call — should not append to main chat unless user opens in chat. */
  requestCopilot: (prompt: string) => Promise<{ reply: string }>
}

export default function FieldCopilotPanel({
  focus,
  enabled,
  busy,
  onClear,
  onFocusUpdate,
  requestCopilot,
}: FieldCopilotPanelProps) {
  const [liveFocus, setLiveFocus] = useState(focus)
  const [draft, setDraft] = useState<FieldCopilotDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLiveFocus(focus)
    setDraft(null)
    setError(null)
  }, [focus.fieldId])

  useEffect(() => {
    setLiveFocus(focus)
  }, [focus])

  useEffect(() => {
    setFieldHighlight(focus.fieldId, true)
    return () => setFieldHighlight(null, false)
  }, [focus.fieldId])

  useEffect(() => {
    const el = document.querySelector(
      `[data-ai-field-id="${CSS.escape(focus.fieldId)}"]`
    ) as HTMLElement | null
    if (!el) return

    function syncFromDom() {
      const next = refreshFocusFromDom(focus)
      if (next) {
        setLiveFocus(next)
        onFocusUpdate(next)
      }
    }

    el.addEventListener('input', syncFromDom)
    el.addEventListener('change', syncFromDom)
    return () => {
      el.removeEventListener('input', syncFromDom)
      el.removeEventListener('change', syncFromDom)
    }
  }, [focus, onFocusUpdate])

  const quickActions = useMemo(() => getFieldCopilotQuickActions(liveFocus), [liveFocus])
  const charCount = liveFocus.value?.length ?? 0
  const baselineValueRef = useRef(focus.value)
  useEffect(() => {
    baselineValueRef.current = focus.value
  }, [focus.fieldId, focus.capturedAt, focus.value])
  const isDirty = liveFocus.value !== baselineValueRef.current

  const runIntent = useCallback(
    async (intent: FieldCopilotIntent, actionLabel: string) => {
      if (!enabled || busy || loading) return
      setLoading(true)
      setError(null)
      setDraft(null)
      try {
        const prompt = buildFieldCopilotPrompt(liveFocus, intent)
        const { reply } = await requestCopilot(prompt)
        const applyValue = parseAiApplyBlock(reply)
        setDraft({ actionLabel, reply, applyValue })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Copilot request failed')
      } finally {
        setLoading(false)
      }
    },
    [enabled, busy, loading, liveFocus, requestCopilot]
  )

  const openInChat = useCallback(
    (mode: 'suggest' | 'improve' | 'fill') => {
      dispatchAdminAiSuggestForFocus(liveFocus, mode)
    },
    [liveFocus]
  )

  function handleApply() {
    const value = draft?.applyValue ?? (draft ? parseAiApplyBlock(draft.reply) : null)
    if (!value) return
    if (applyFieldValue(liveFocus.fieldId, value)) {
      const next = refreshFocusFromDom(liveFocus)
      if (next) {
        setLiveFocus(next)
        onFocusUpdate(next)
      }
      setDraft(null)
    }
  }

  function handleRefineInChat() {
    if (!draft) return
    const value = draft.applyValue ?? parseAiApplyBlock(draft.reply)
    const lines = [
      `Refine this draft for **${liveFocus.fieldLabel}** (\`${liveFocus.fieldKey}\`):`,
      value ? JSON.stringify(value) : draft.reply.replace(/```ai-apply[\s\S]*?```/gi, '').trim(),
      'Keep facts accurate; reply with an improved value and ```ai-apply {"value":"..."}``` when ready.',
    ].filter(Boolean)
    dispatchAdminAiPrompt({ message: lines.join('\n'), agentMode: 'studio_release' })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(liveFocus.value || '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy to clipboard')
    }
  }

  const previewValue = draft?.applyValue ?? (draft ? parseAiApplyBlock(draft.reply) : null)

  const chip =
    'rounded-full border px-2 py-0.5 text-[10px] font-medium disabled:opacity-40'

  return (
    <div className="px-2 pb-1 pt-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="max-w-[12rem] truncate text-[10px] font-medium text-violet-200 hover:text-white"
          title={`${liveFocus.fieldLabel} · ${liveFocus.fieldKey}`}
          onClick={() => scrollToField(liveFocus.fieldId)}
        >
          {liveFocus.fieldLabel}
          {isDirty ? <span className="text-amber-200/90"> · edited</span> : null}
        </button>
        <button
          type="button"
          disabled={!enabled || busy || loading}
          className={`${chip} border-violet-500/50 bg-violet-900/50 text-violet-100 hover:bg-violet-800/60`}
          onClick={() => void runIntent({ kind: 'suggest' }, 'Suggest')}
        >
          Suggest
        </button>
        {liveFocus.value?.trim() ? (
          <button
            type="button"
            disabled={!enabled || busy || loading}
            className={`${chip} border-gray-600 bg-gray-900 text-gray-300 hover:bg-gray-800`}
            onClick={() => void runIntent({ kind: 'improve' }, 'Improve')}
          >
            Improve
          </button>
        ) : (
          <button
            type="button"
            disabled={!enabled || busy || loading}
            className={`${chip} border-gray-600 bg-gray-900 text-gray-300 hover:bg-gray-800`}
            onClick={() => void runIntent({ kind: 'fill' }, 'Fill')}
          >
            Fill
          </button>
        )}
        {quickActions.slice(0, 2).map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!enabled || busy || loading}
            className={`${chip} border-violet-500/35 bg-violet-950/40 text-violet-200/90 hover:bg-violet-900/50`}
            onClick={() => void runIntent(action.intent, action.label)}
          >
            {action.label}
          </button>
        ))}
        {liveFocus.value?.trim() ? (
          <button
            type="button"
            className="text-[10px] text-gray-500 hover:text-gray-300"
            onClick={() => void handleCopy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        ) : null}
        <button
          type="button"
          className="ml-auto text-[10px] text-gray-500 hover:text-gray-300"
          aria-label="Clear focused field"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!enabled || busy}
          className="text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-40"
          title="Send to the chat thread"
          onClick={() => openInChat(liveFocus.value?.trim() ? 'improve' : 'suggest')}
        >
          Chat
        </button>
      </div>
      {loading ? <p className="mt-1 text-[10px] text-violet-200/80">Drafting…</p> : null}
      {error ? <p className="mt-1 text-[10px] text-red-300/90">{error}</p> : null}
      {draft && !loading ? (
        <div className="mt-1.5">
          <div
            className="max-h-28 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(110,231,183,0.65)_rgba(6,78,59,0.35)] [scrollbar-width:thin]"
            tabIndex={0}
            aria-label={`${draft.actionLabel} preview`}
          >
            <p className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-emerald-100/95">
              {previewValue ||
                draft.reply.replace(/```ai-apply[\s\S]*?```/gi, '').trim() ||
                draft.reply}
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={!previewValue || !liveFocus.canApply}
              className="rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
              onClick={handleApply}
            >
              Apply
            </button>
            <button
              type="button"
              className="text-[10px] text-gray-500 hover:text-gray-300"
              onClick={() => setDraft(null)}
            >
              Discard
            </button>
            <button
              type="button"
              className="text-[10px] text-gray-500 hover:text-gray-300"
              onClick={handleRefineInChat}
            >
              Refine
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

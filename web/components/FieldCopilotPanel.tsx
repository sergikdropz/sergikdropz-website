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

  return (
    <div className="mb-2 rounded-lg border border-violet-500/30 bg-violet-950/25">
      <div className="flex items-start justify-between gap-2 border-b border-violet-500/20 px-2.5 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">
            Field copilot
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-100">
            {liveFocus.fieldLabel}
            <span className="text-gray-500"> · {liveFocus.fieldKey}</span>
            {liveFocus.section ? (
              <span className="text-gray-600"> · {liveFocus.section}</span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isDirty ? (
            <span className="rounded-full bg-amber-950/80 px-1.5 py-0.5 text-[9px] font-medium text-amber-200/90">
              Edited
            </span>
          ) : null}
          <button
            type="button"
            className="text-[10px] text-violet-300/80 hover:text-violet-200"
            onClick={() => scrollToField(liveFocus.fieldId)}
          >
            Go to field
          </button>
          <button
            type="button"
            className="text-[10px] text-gray-500 hover:text-gray-300"
            aria-label="Clear focused field"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="px-2.5 py-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {liveFocus.value?.trim() ? (
              <p className="line-clamp-3 rounded border border-gray-800/80 bg-gray-950/60 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-gray-300">
                {liveFocus.value}
              </p>
            ) : (
              <p className="rounded border border-dashed border-gray-700/80 bg-gray-950/40 px-2 py-1.5 text-[10px] italic text-gray-500">
                Empty field — use Suggest or Fill to draft
              </p>
            )}
            {charCount > 0 ? (
              <p className="mt-1 text-[9px] text-gray-600">{charCount} characters</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!liveFocus.value}
            className="shrink-0 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
            onClick={() => void handleCopy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {quickActions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={!enabled || busy || loading}
                className="rounded-full border border-violet-500/35 bg-violet-950/50 px-2 py-0.5 text-[10px] text-violet-200/90 hover:bg-violet-900/50 disabled:opacity-40"
                onClick={() => void runIntent(action.intent, action.label)}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!enabled || busy || loading}
            className="rounded-full border border-violet-500/50 bg-violet-900/50 px-2.5 py-0.5 text-[10px] font-medium text-violet-100 hover:bg-violet-800/60 disabled:opacity-40"
            onClick={() => void runIntent({ kind: 'suggest' }, 'Suggest')}
          >
            Suggest
          </button>
          <button
            type="button"
            disabled={!enabled || busy || loading || !liveFocus.value?.trim()}
            className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            onClick={() => void runIntent({ kind: 'improve' }, 'Improve')}
          >
            Improve
          </button>
          {!liveFocus.value?.trim() ? (
            <button
              type="button"
              disabled={!enabled || busy || loading}
              className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              onClick={() => void runIntent({ kind: 'fill' }, 'Fill')}
            >
              Fill
            </button>
          ) : null}
          <button
            type="button"
            disabled={!enabled || busy}
            className="ml-auto rounded-full border border-gray-700/80 px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-40"
            title="Send to full chat thread"
            onClick={() => openInChat(liveFocus.value?.trim() ? 'improve' : 'suggest')}
          >
            Open in chat
          </button>
        </div>

        {loading ? (
          <div className="mt-2 flex items-center gap-2 rounded border border-violet-500/25 bg-violet-950/40 px-2.5 py-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300" />
            <span className="text-[10px] text-violet-200/80">Drafting…</span>
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 text-[10px] text-red-300/90">{error}</p>
        ) : null}

        {draft && !loading ? (
          <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-2">
            <p className="text-[10px] font-medium text-emerald-200/90">
              {draft.actionLabel} preview
            </p>
            {previewValue ? (
              <>
                {liveFocus.value?.trim() && previewValue !== liveFocus.value ? (
                  <p className="mt-1.5 text-[9px] text-gray-500 line-through opacity-70">
                    {liveFocus.value}
                  </p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap rounded border border-emerald-500/20 bg-gray-950/50 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-emerald-100/95">
                  {previewValue}
                </p>
              </>
            ) : (
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[10px] text-gray-400">
                {draft.reply.replace(/```ai-apply[\s\S]*?```/gi, '').trim() || draft.reply}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!previewValue || !liveFocus.canApply}
                className="rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                onClick={handleApply}
              >
                Apply to field
              </button>
              <button
                type="button"
                className="rounded-full border border-gray-600 bg-gray-900 px-2.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800"
                onClick={() => setDraft(null)}
              >
                Discard
              </button>
              <button
                type="button"
                className="rounded-full border border-gray-700 px-2.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
                onClick={handleRefineInChat}
              >
                Refine in chat
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

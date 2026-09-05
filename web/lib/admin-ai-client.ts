/** Client helpers to open the floating Admin AI from Release Studio UI. */

import type { AdminAiFocusContext } from '@/lib/ai/admin-ai-focus-context'

export type AdminAiPromptDetail = {
  message: string
  agentMode?: string
}

export function dispatchAdminAiPrompt(detail: AdminAiPromptDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('admin-ai:prompt', {
      detail,
    })
  )
}

export function openAdminAiAssistant() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('admin-ai:open'))
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

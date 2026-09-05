/** What the user is focused on in the app (field, entity, section). */
export type AdminAiFocusContext = {
  /** Stable DOM id for apply-to-field (`data-ai-field-id`). */
  fieldId: string
  fieldKey: string
  fieldLabel: string
  fieldType: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'unknown'
  value: string
  placeholder?: string
  section?: string
  entityType?: string
  entityId?: string
  entityLabel?: string
  formId?: string
  hint?: string
  canApply: boolean
  capturedAt: number
}

const FOCUSABLE =
  'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'

function readLabelFor(el: HTMLElement): string | undefined {
  const id = el.getAttribute('id')
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim().replace(/\s*\*$/, '')
  }
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const title = el.getAttribute('title')?.trim()
  if (title) return title
  const parentLabel = el.closest('label')
  if (parentLabel?.textContent?.trim()) {
    return parentLabel.textContent.trim().replace(/\s*\*$/, '').slice(0, 120)
  }
  const prev = el.previousElementSibling
  if (prev?.tagName === 'LABEL' && prev.textContent?.trim()) {
    return prev.textContent.trim().replace(/\s*\*$/, '')
  }
  return undefined
}

function readSectionHeading(el: HTMLElement): string | undefined {
  let node: HTMLElement | null = el.parentElement
  for (let i = 0; i < 8 && node; i++) {
    const heading = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4')
    if (heading?.textContent?.trim()) return heading.textContent.trim().slice(0, 80)
    node = node.parentElement
  }
  return undefined
}

function inferFieldKey(el: HTMLElement, label?: string): string {
  const explicit = el.getAttribute('data-ai-field') || el.closest('[data-ai-field]')?.getAttribute('data-ai-field')
  if (explicit) return explicit

  const name = (el as HTMLInputElement).name
  if (name) return name

  const id = el.id
  if (id && !id.startsWith(':')) return id

  const labelSlug = label
    ? label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
    : 'field'
  return labelSlug
}

function readScope(el: HTMLElement): {
  entityType?: string
  entityId?: string
  entityLabel?: string
  formId?: string
  hint?: string
} {
  const scopeEl = el.closest('[data-ai-scope]')
  if (!scopeEl) {
    return {
      entityType: el.getAttribute('data-ai-entity-type') || undefined,
      entityId: el.getAttribute('data-ai-entity-id') || undefined,
      entityLabel: el.getAttribute('data-ai-entity-label') || undefined,
      formId: el.getAttribute('data-ai-form') || undefined,
      hint: el.getAttribute('data-ai-hint') || undefined,
    }
  }

  const raw = scopeEl.getAttribute('data-ai-scope')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      return {
        entityType: parsed.entityType || parsed.entity,
        entityId: parsed.entityId || parsed.id,
        entityLabel: parsed.entityLabel || parsed.label,
        formId: parsed.formId || parsed.form,
        hint: parsed.hint,
      }
    } catch {
      /* use attributes below */
    }
  }

  return {
    entityType: scopeEl.getAttribute('data-ai-entity-type') || undefined,
    entityId: scopeEl.getAttribute('data-ai-entity-id') || undefined,
    entityLabel: scopeEl.getAttribute('data-ai-entity-label') || undefined,
    formId: scopeEl.getAttribute('data-ai-form') || undefined,
    hint: scopeEl.getAttribute('data-ai-hint') || el.getAttribute('data-ai-hint') || undefined,
  }
}

function fieldTypeFor(el: HTMLElement): AdminAiFocusContext['fieldType'] {
  if (el instanceof HTMLTextAreaElement) return 'textarea'
  if (el instanceof HTMLSelectElement) return 'select'
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return 'checkbox'
    if (el.type === 'number') return 'number'
    return 'text'
  }
  if (el.isContentEditable) return 'textarea'
  return 'unknown'
}

function readValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked ? 'true' : 'false'
    return el.value
  }
  if (el instanceof HTMLSelectElement) return el.value
  if (el instanceof HTMLTextAreaElement) return el.value
  if (el.isContentEditable) return el.textContent || ''
  return ''
}

export function ensureAiFieldId(el: HTMLElement): string {
  const existing = el.getAttribute('data-ai-field-id')
  if (existing) return existing
  const id = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  el.setAttribute('data-ai-field-id', id)
  return id
}

export function extractFocusFromElement(target: EventTarget | null): AdminAiFocusContext | null {
  if (!target || !(target instanceof HTMLElement)) return null
  const el = target.closest(FOCUSABLE) as HTMLElement | null
  if (!el) return null
  if (el.closest('[data-admin-ai-root]')) return null
  if (el.closest('[data-ai-ignore-focus]')) return null

  const label = readLabelFor(el)
  const scope = readScope(el)
  const fieldKey = inferFieldKey(el, label)
  const fieldId = ensureAiFieldId(el)

  return {
    fieldId,
    fieldKey,
    fieldLabel: label || fieldKey,
    fieldType: fieldTypeFor(el),
    value: readValue(el),
    placeholder: el.getAttribute('placeholder') || undefined,
    section: readSectionHeading(el),
    ...scope,
    hint: scope.hint || el.getAttribute('data-ai-hint') || undefined,
    canApply: fieldTypeFor(el) !== 'unknown',
    capturedAt: Date.now(),
  }
}

const FIELD_HIGHLIGHT_CLASS = 'admin-ai-field-highlight'

export function getFieldElement(fieldId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector(`[data-ai-field-id="${CSS.escape(fieldId)}"]`) as HTMLElement | null
}

export function refreshFocusFromDom(focus: AdminAiFocusContext): AdminAiFocusContext | null {
  const el = getFieldElement(focus.fieldId)
  if (!el) return null
  const next = extractFocusFromElement(el)
  if (!next) return null
  return { ...next, fieldId: focus.fieldId, capturedAt: Date.now() }
}

export function setFieldHighlight(fieldId: string | null, on: boolean) {
  if (typeof document === 'undefined') return
  document.querySelectorAll(`.${FIELD_HIGHLIGHT_CLASS}`).forEach((node) => {
    node.classList.remove(FIELD_HIGHLIGHT_CLASS)
  })
  if (!on || !fieldId) return
  const el = getFieldElement(fieldId)
  el?.classList.add(FIELD_HIGHLIGHT_CLASS)
}

export function scrollToField(fieldId: string) {
  const el = getFieldElement(fieldId)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus({ preventScroll: true })
}

export function applyFieldValue(fieldId: string, value: string): boolean {
  if (typeof document === 'undefined') return false
  const el = document.querySelector(
    `[data-ai-field-id="${CSS.escape(fieldId)}"]`
  ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!el) return false

  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    el.checked = value === 'true' || value === '1' || value.toLowerCase() === 'yes'
  } else if (el instanceof HTMLSelectElement) {
    el.value = value
  } else {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    if (descriptor?.set) descriptor.set.call(el, value)
    else (el as HTMLInputElement | HTMLTextAreaElement).value = value
  }

  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.focus()
  return true
}

export function formatAdminAiFocusForPrompt(focus: AdminAiFocusContext | null | undefined): string {
  if (!focus) return ''

  const lines = [
    '',
    '---',
    'USER FOCUS (active form field — treat as primary intent):',
    `- field: ${focus.fieldLabel} (${focus.fieldKey})`,
    `- type: ${focus.fieldType}`,
    focus.section ? `- section: ${focus.section}` : '',
    focus.entityType ? `- entity: ${focus.entityType}${focus.entityId ? ` id=${focus.entityId}` : ''}` : '',
    focus.entityLabel ? `- entity_label: ${focus.entityLabel}` : '',
    focus.formId ? `- form: ${focus.formId}` : '',
    focus.hint ? `- hint: ${focus.hint}` : '',
    `- current_value: ${JSON.stringify(focus.value)}`,
    focus.placeholder ? `- placeholder: ${focus.placeholder}` : '',
    '',
    'Copilot rules for focused field:',
    '- Interpret vague requests ("help", "improve", "fill this") as about THIS field unless they say otherwise.',
    '- Suggest a concrete replacement value; match tone of SERGIK / electronic music brand when writing copy.',
    '- For empty fields, draft content; for non-empty, improve or extend without inventing false facts (ISRC, dates, credits).',
    '- When user approves, you may end your reply with a fenced block:',
    '```ai-apply',
    '{"value":"the exact text to put in the field"}',
    '```',
    '  (only the string value, no markdown inside JSON).',
    '- Prefer studio/admin tools when the change needs a server write (marketing_copy, copyright checklist, ISRCs) and mention /exec with payload.',
  ]

  return lines.filter(Boolean).join('\n')
}

/** Pull ```ai-apply { "value": "..." } ``` from assistant text. */
export function parseAiApplyBlock(content: string): string | null {
  const match = content.match(/```ai-apply\s*([\s\S]*?)```/i)
  if (!match?.[1]) return null
  try {
    const parsed = JSON.parse(match[1].trim()) as { value?: string }
    if (typeof parsed.value === 'string') return parsed.value
  } catch {
    const trimmed = match[1].trim()
    if (trimmed.startsWith('"') || trimmed.startsWith('{')) return null
    return trimmed
  }
  return null
}

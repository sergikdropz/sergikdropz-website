import type { AdminAiFocusContext } from '@/lib/ai/admin-ai-focus-context'

export type FieldCopilotIntent =
  | { kind: 'suggest' }
  | { kind: 'improve' }
  | { kind: 'fill' }
  | { kind: 'custom'; instruction: string }

export type FieldCopilotQuickAction = {
  id: string
  label: string
  intent: FieldCopilotIntent
  /** Show only when field has a value */
  whenFilled?: boolean
  /** Show only when field is empty */
  whenEmpty?: boolean
}

function keyMatches(focus: AdminAiFocusContext, patterns: string[]): boolean {
  const key = focus.fieldKey.toLowerCase()
  const label = focus.fieldLabel.toLowerCase()
  return patterns.some((p) => key.includes(p) || label.includes(p))
}

export function getFieldCopilotQuickActions(focus: AdminAiFocusContext): FieldCopilotQuickAction[] {
  const hasValue = Boolean(focus.value?.trim())
  const actions: FieldCopilotQuickAction[] = []

  if (keyMatches(focus, ['genre'])) {
    actions.push(
      {
        id: 'genre-spotify',
        label: 'Spotify-style',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction:
            'Rewrite as a Spotify-friendly genre string (e.g. "Deep House / Minimal"). Keep it accurate; do not invent subgenres unrelated to the release.',
        },
      },
      {
        id: 'genre-specific',
        label: 'More specific',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Make the genre label more specific and DJ-friendly while staying truthful to the sound.',
        },
      },
      {
        id: 'genre-broad',
        label: 'Broader',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Use a slightly broader genre umbrella suitable for store listings and playlists.',
        },
      }
    )
  }

  if (keyMatches(focus, ['description', 'bio', 'about', 'summary'])) {
    actions.push(
      {
        id: 'desc-short',
        label: 'Shorter',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Shorten to 1–2 tight sentences. Keep the core mood and facts.',
        },
      },
      {
        id: 'desc-punch',
        label: 'Punchier',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Make the copy more punchy and evocative for electronic music fans; no hype clichés.',
        },
      },
      {
        id: 'desc-hook',
        label: 'Add hook',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Lead with a strong opening hook, then keep the rest concise.',
        },
      }
    )
  }

  if (keyMatches(focus, ['title', 'name', 'track'])) {
    actions.push(
      {
        id: 'title-alt',
        label: 'Alternatives',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Suggest one strong alternative title in the same spirit (not a list — pick the best single option).',
        },
      },
      {
        id: 'title-short',
        label: 'Shorter',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Shorten the title if possible without losing meaning; respect existing branding.',
        },
      }
    )
  }

  if (keyMatches(focus, ['pitch', 'caption', 'press', 'editorial'])) {
    actions.push(
      {
        id: 'pitch-editorial',
        label: 'Editorial',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Rewrite for Spotify/editorial pitch tone: factual, compelling, under 500 characters if possible.',
        },
      },
      {
        id: 'pitch-social',
        label: 'Social',
        whenFilled: true,
        intent: {
          kind: 'custom',
          instruction: 'Adapt for an Instagram caption: engaging, 1–3 short lines, optional emoji sparingly.',
        },
      }
    )
  }

  return actions.filter((a) => {
    if (a.whenEmpty && hasValue) return false
    if (a.whenFilled && !hasValue) return false
    return true
  })
}

export function buildFieldCopilotPrompt(focus: AdminAiFocusContext, intent: FieldCopilotIntent): string {
  const hasValue = Boolean(focus.value?.trim())
  let instruction: string

  switch (intent.kind) {
    case 'suggest':
      instruction = hasValue
        ? 'Suggest a refined value for this field.'
        : 'Draft a strong value for this empty field.'
      break
    case 'improve':
      instruction = 'Improve this field value: clearer, more professional, on-brand for SERGIK / electronic music.'
      break
    case 'fill':
      instruction = 'Draft a complete value for this empty field using only context you have; do not invent ISRCs, dates, or credits.'
      break
    case 'custom':
      instruction = intent.instruction
      break
  }

  const lines = [
    `Field copilot — ${instruction}`,
    `Field: **${focus.fieldLabel}** (\`${focus.fieldKey}\`, type: ${focus.fieldType}).`,
    focus.section ? `Section: ${focus.section}.` : '',
    focus.entityType
      ? `Entity: ${focus.entityType}${focus.entityId ? ` (${focus.entityId})` : ''}${focus.entityLabel ? ` — ${focus.entityLabel}` : ''}.`
      : '',
    focus.hint ? `Hint: ${focus.hint}` : '',
    `Current value: ${hasValue ? JSON.stringify(focus.value) : '(empty)'}`,
    focus.placeholder ? `Placeholder: ${focus.placeholder}` : '',
    '',
    'Reply with ONLY the exact text to put in the field (no preamble). End with:',
    '```ai-apply',
    '{"value":"..."}',
    '```',
  ]

  return lines.filter(Boolean).join('\n')
}

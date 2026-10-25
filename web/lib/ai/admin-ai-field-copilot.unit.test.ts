import { describe, expect, it } from 'vitest'
import { buildFieldCopilotPrompt } from '@/lib/ai/admin-ai-field-copilot'
import type { AdminAiFocusContext } from '@/lib/ai/admin-ai-focus-context'

const subject: AdminAiFocusContext = {
  fieldId: 'subject',
  fieldKey: 'subject',
  fieldLabel: 'Subject',
  fieldType: 'text',
  value: '',
  canApply: true,
  capturedAt: 0,
}

describe('field copilot prompt', () => {
  it('drafts a subject from the attached message', () => {
    const prompt = buildFieldCopilotPrompt(
      subject,
      { kind: 'fill' },
      'Press for Staying A Vibe:\nSERGIK feat. Janis presents "Staying A Vibe", a 5-track EP.',
    )
    expect(prompt).toContain('Draft one email subject line from the attached message.')
    expect(prompt).toContain('Staying A Vibe')
    expect(prompt).toContain('under 70 characters')
    expect(prompt).not.toContain('Draft a complete value for this empty field')
  })

  it('leaves other empty fields on the generic draft', () => {
    const prompt = buildFieldCopilotPrompt(
      { ...subject, fieldKey: 'notes', fieldLabel: 'Notes' },
      { kind: 'fill' },
      'A note.',
    )
    expect(prompt).toContain('Draft a complete value for this empty field')
    expect(prompt).toContain('Attached message:')
  })
})

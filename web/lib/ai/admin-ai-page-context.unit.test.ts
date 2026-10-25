import { describe, expect, it } from 'vitest'
import { collectSignedInFormFields, formatAdminAiPageContextForPrompt } from '@/lib/ai/admin-ai-page-context'

function fakeField(overrides: Record<string, unknown>) {
  const attrs: Record<string, string> = (overrides.attrs as Record<string, string>) || {}
  return {
    closest: (selector: string) => (overrides.inPanel && selector.includes('data-admin-ai-panel') ? {} : null),
    tagName: 'INPUT',
    type: overrides.type || 'text',
    name: overrides.name || '',
    id: overrides.id || '',
    value: overrides.value || '',
    required: Boolean(overrides.required),
    getAttribute: (name: string) => attrs[name] ?? null,
    getBoundingClientRect: () => ({ width: 20, height: 12 }),
    ownerDocument: { querySelector: () => null },
  }
}

describe('formatAdminAiPageContextForPrompt', () => {
  it('includes signed-in form values on every turn that has them', () => {
    const prompt = formatAdminAiPageContextForPrompt({
      surface: 'studio',
      pathname: '/studio/releases/abc',
      studio: { releaseId: 'abc', title: 'Night Drive' },
      formFields: [{ label: 'UPC', name: 'upc', value: '', required: true, invalid: false }],
    })
    expect(prompt).toContain('Open form on the signed-in page')
    expect(prompt).toContain('UPC: (empty)')
    expect(prompt).toContain('required')
  })
})

describe('collectSignedInFormFields', () => {
  it('keeps visible fields and drops the chat panel and secrets', () => {
    const doc = {
      querySelectorAll: () => [
        fakeField({ name: 'upc', id: 'upc', value: '012345678905', attrs: { 'aria-label': 'UPC' } }),
        fakeField({ name: 'password', value: 'nope' }),
        fakeField({ name: 'note', value: 'draft', inPanel: true }),
        fakeField({ type: 'hidden', name: 'csrf', value: 'x' }),
      ],
    }
    const fields = collectSignedInFormFields(doc as unknown as Document)
    expect(fields.map((field) => field.name)).toEqual(['upc'])
    expect(fields[0]?.value).toBe('012345678905')
  })
})

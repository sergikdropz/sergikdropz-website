import { describe, expect, it } from 'vitest'
import {
  parseAdminChatActionChoices,
  stripAdminChatActionChoiceMarkup,
} from '@/lib/ai/admin-chat-action-choices'

describe('parseAdminChatActionChoices', () => {
  it('turns an or-question into choice buttons plus proceed with all', () => {
    const parsed = parseAdminChatActionChoices(
      'The release is missing a few codes.\n\nWant me to pull the full track ISRC list next, or tackle the genre conflict first?',
    )
    expect(parsed?.options.map((option) => option.label)).toEqual([
      'Pull the full track ISRC list next',
      'Tackle the genre conflict first',
    ])
    expect(parsed?.options[0]?.message).toBe('Pull the full track ISRC list next.')
    expect(parsed?.proceedAll?.label).toBe(
      'Proceed with all with recommended steps for best results',
    )
    expect(parsed?.proceedAll?.message).toContain('1. Pull the full track ISRC list next')
    expect(parsed?.proceedAll?.message).toContain('2. Tackle the genre conflict first')
  })

  it('uses the list above a which-question', () => {
    const parsed = parseAdminChatActionChoices(
      ['- Pull the full track ISRC list', '- Tackle the genre conflict', '', 'Which should I do first?'].join(
        '\n',
      ),
    )
    expect(parsed?.options.map((option) => option.label)).toEqual([
      'Pull the full track ISRC list',
      'Tackle the genre conflict',
    ])
  })

  it('reads a want-me-to list', () => {
    const parsed = parseAdminChatActionChoices('Want me to:\n- Assign the house ISRCs\n- Fix the genre tags')
    expect(parsed?.options.map((option) => option.label)).toEqual([
      'Assign the house ISRCs',
      'Fix the genre tags',
    ])
  })

  it('keeps a single offer as one button', () => {
    const parsed = parseAdminChatActionChoices('Should I pull the full track ISRC list next?')
    expect(parsed?.options).toHaveLength(1)
    expect(parsed?.proceedAll).toBeNull()
  })

  it('reads a choices fence from any chat and hides it from the prose', () => {
    const content = [
      'Two ways to finish the smartlink.',
      '',
      '```choices',
      'Use the site player link',
      'Use the HyperFollow link',
      '```',
    ].join('\n')
    const parsed = parseAdminChatActionChoices(content)
    expect(parsed?.options.map((option) => option.label)).toEqual([
      'Use the site player link',
      'Use the HyperFollow link',
    ])
    expect(parsed?.proceedAll).not.toBeNull()
    expect(stripAdminChatActionChoiceMarkup(content)).toBe('Two ways to finish the smartlink.')
  })

  it('turns other choice phrasings into buttons', () => {
    expect(
      parseAdminChatActionChoices('Do you want the short version or the full audit?')?.options.map(
        (option) => option.label,
      ),
    ).toEqual(['The short version', 'The full audit'])
    expect(
      parseAdminChatActionChoices('Pull the ISRC list or fix the genre conflict?')?.options.map(
        (option) => option.label,
      ),
    ).toEqual(['Pull the ISRC list', 'Fix the genre conflict'])
  })

  it('turns a yes or no confirmation into two buttons', () => {
    const parsed = parseAdminChatActionChoices('Is the UPC already on this release?')
    expect(parsed?.options.map((option) => option.label)).toEqual(['Yes', 'No'])
    expect(parsed?.options[0]?.message).toBe('Yes. Is the UPC already on this release?')
    expect(parsed?.proceedAll).toBeNull()
  })

  it('treats a Yes and No fence as a confirmation, not a proceed-all list', () => {
    const parsed = parseAdminChatActionChoices('Register this with SoundExchange?\n\n```choices\nYes\nNo\n```')
    expect(parsed?.options.map((option) => option.label)).toEqual(['Yes', 'No'])
    expect(parsed?.options[0]?.message).toContain('Register this with SoundExchange?')
    expect(parsed?.proceedAll).toBeNull()
  })

  it('turns a shall-I-run command into a button in any chat', () => {
    const parsed = parseAdminChatActionChoices(
      [
        'Next step I would recommend is reading the live dropdown.',
        '',
        'Shall I run:',
        '',
        '```',
        '/exec admin_browser {"action":"probe_fields","description":"Read the genre dropdown"}',
        '```',
        '',
        'That will return the actual dropdown options so we pick the right one. Your call.',
      ].join('\n'),
    )
    expect(parsed?.options.map((option) => option.label)).toEqual(['Read the genre dropdown'])
    expect(parsed?.options[0]?.message).toContain('/exec admin_browser')
    expect(parsed?.proceedAll).toBeNull()
  })

  it('ignores a factual question and earlier offers once the reply moves on', () => {
    const parsed = parseAdminChatActionChoices(
      'Want me to pull the ISRC list, or fix the genre?\n\nDistroKid already assigned the UPC. The house prefix is QTA53.',
    )
    expect(parsed).toBeNull()
  })

  it('ignores errors and placeholder turns', () => {
    expect(parseAdminChatActionChoices('Error: Failed to contact AI chat API.')).toBeNull()
    expect(parseAdminChatActionChoices('Working…')).toBeNull()
  })
})

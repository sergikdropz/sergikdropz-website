import { describe, expect, it } from 'vitest'
import {
  buildAudioRerunRewriteMessage,
  collectSonicDnaAdminGuidance,
} from './sonic-dna-admin-guidance'

describe('sonic-dna-admin-guidance', () => {
  it('collects live prompt and prior user challenge notes', () => {
    const guidance = collectSonicDnaAdminGuidance(
      'reanalyze as breaks / liquid dnb',
      [
        { role: 'user', content: 'this is more of a breaks/ almost slower liquid dnb jungle type beat.' },
        { role: 'assistant', content: 'CHALLENGE REPORT — Admin Override Applied\nAdmin input identifies this as breaks.' },
      ],
    )
    expect(guidance).toMatch(/liquid dnb/i)
    expect(guidance).toMatch(/reanalyze as breaks/i)
    expect(guidance).toMatch(/Recent challenge findings/i)
  })

  it('builds rewrite message with admin override block when guidance exists', () => {
    const msg = buildAudioRerunRewriteMessage('Prefer breaks / liquid DnB feel.')
    expect(msg).toMatch(/ADMIN ACCURACY GUIDANCE/)
    expect(msg).toMatch(/Prefer breaks/)
  })

  it('keeps default rewrite message when guidance is empty', () => {
    expect(buildAudioRerunRewriteMessage('')).toMatch(/Fresh audio measurement completed/)
    expect(buildAudioRerunRewriteMessage('')).not.toMatch(/ADMIN ACCURACY/)
  })
})

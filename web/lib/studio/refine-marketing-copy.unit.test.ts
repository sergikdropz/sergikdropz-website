import { describe, expect, it } from 'vitest'
import {
  buildRefineMarketingCopyPrompt,
  parseRefinedCopyReply,
  polishMarketingCopyFieldLocally,
  sanitizeRefinedCopy,
  structureProCopy,
} from '@/lib/studio/refine-marketing-copy'
import { dnaCopyInputFromCatalog } from '@/lib/studio/vault-import'

describe('structureProCopy', () => {
  it('breaks run-on text into short paragraphs', () => {
    const out = structureProCopy(
      'First sentence lands. Second sentence follows. Third sentence keeps going. Fourth sentence closes.',
    )
    expect(out).toContain('\n\n')
    expect(out.split(/\n\n/).length).toBe(2)
  })

  it('preserves tracklist blocks', () => {
    const raw = 'Lead sentence here.\n\nTracklist\n1. One\n2. Two'
    expect(structureProCopy(raw)).toMatch(/Tracklist/)
  })
})

describe('parseRefinedCopyReply', () => {
  it('reads JSON text field', () => {
    expect(parseRefinedCopyReply('{"text":"Polished blurb."}')).toBe('Polished blurb.')
  })

  it('reads fenced JSON', () => {
    expect(parseRefinedCopyReply('```json\n{"text":"Hello"}\n```')).toBe('Hello')
  })

  it('strips literal \\n escapes and JSON scaffolding', () => {
    const messy =
      '\\n\\n—\\n\\n  {"text":  \\n\\nPatient pressure.\\n\\n5. Night Drive — keeps the lights low.\\n\\n"}'
    const out = parseRefinedCopyReply(messy)
    expect(out).not.toMatch(/\\n/)
    expect(out).not.toMatch(/\{"text"/)
    expect(out).not.toMatch(/\\\./)
    expect(out).toMatch(/Patient pressure/)
    expect(out).toMatch(/Night Drive/)
  })

  it('unescapes valid JSON newline sequences', () => {
    const out = parseRefinedCopyReply('{"text":"Line one.\\n\\nLine two."}')
    expect(out).toBe('Line one.\n\nLine two.')
  })
})

describe('sanitizeRefinedCopy', () => {
  it('drops lone dash separator lines', () => {
    const out = sanitizeRefinedCopy('First line.\n—\nSecond line.')
    expect(out).toBe('First line.\nSecond line.')
  })
})

describe('polishMarketingCopyFieldLocally', () => {
  it('uses metadata and catalog notes for press blurb structure', () => {
    const catalog = dnaCopyInputFromCatalog({
      title: 'UTOPIA',
      type: 'ep',
      description:
        '"UTOPIA" is a two-track EP listen. It opens warm. It closes late. Play it in order.',
      artist: 'SERGIK',
      tracks: [
        {
          title: 'Jahdelicah',
          track_number: 1,
          identity: {
            description: 'Jahdelicah opens warm and low at 124 BPM.',
            bpm: 124,
            genre: 'Funky House',
          },
        },
        {
          title: 'Night Drive',
          track_number: 2,
          identity: {
            description: 'Night Drive keeps the lights low.',
            bpm: 126,
            genre: 'Funky House',
          },
        },
      ],
    })
    const draft =
      'SERGIK presents UTOPIA and Jahdelicah opens warm and Night Drive keeps the lights low and the room stays late and everything runs together without a break into one long sentence that never stops.'
    const text = polishMarketingCopyFieldLocally({
      field: 'press_blurb',
      draft,
      catalog,
    })
    expect(text.length).toBeGreaterThan(20)
    expect(text).not.toMatch(/and everything runs together without a break into one long sentence/)
    expect(buildRefineMarketingCopyPrompt({ field: 'press_blurb', draft, catalog })).toMatch(
      /Catalog track descriptions/,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'press_blurb', draft, catalog })).toMatch(
      /Release metadata description/,
    )
  })
})

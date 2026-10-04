import { describe, expect, it } from 'vitest'
import {
  buildRefineMarketingCopyPrompt,
  parseRefinedCopyReply,
  polishMarketingCopyFieldLocally,
  sanitizeRefinedCopy,
  structureProCopy,
  clipYoutubeVisualizer,
  mergeStoreTrackCoverage,
  mergeYoutubeVisualizerStructure,
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

describe('mergeYoutubeVisualizerStructure', () => {
  it('grafts missing TRACKLIST / CHAPTERS / CREDITS from the seed', () => {
    const seed =
      'Lead.\n\nTRACKLIST (continuous · no space between tracks)\n00:00–03:00  1. Neon\n\nCHAPTERS\n00:00 Neon\n\nCREDITS\nWritten by SERGIK'
    const out = mergeYoutubeVisualizerStructure('A charged full-EP listen with no gaps.', seed)
    expect(out).toMatch(/charged full-EP/)
    expect(out).toMatch(/TRACKLIST/)
    expect(out).toMatch(/CHAPTERS/)
    expect(out).toMatch(/CREDITS/)
  })

  it('grafts skipped TRACK BY TRACK cuts from the seed', () => {
    const seed = [
      'TRACK BY TRACK',
      '00:00–03:00  1. Neon',
      'Opens warm and low.',
      '',
      '03:00–06:00  2. Horizon',
      'Keeps the lights low.',
      '',
      'TRACKLIST (continuous · no space between tracks)',
      '00:00–03:00  1. Neon',
      '',
      'CHAPTERS',
      '00:00 Neon',
      '',
      'CREDITS',
      'Written by SERGIK',
    ].join('\n')
    const out = mergeYoutubeVisualizerStructure(
      'A charged full-EP listen.\n\nTRACK BY TRACK\n00:00–03:00  1. Neon\nOpens warm and low.',
      seed,
      ['Neon', 'Horizon'],
    )
    expect(out).toMatch(/Neon/)
    expect(out).toMatch(/Horizon/)
    expect(out).toMatch(/Keeps the lights low/)
    expect(out.indexOf('Horizon')).toBeLessThan(out.indexOf('TRACKLIST'))
  })

  it('grafts a walk entry even when the opener already names the missing cut', () => {
    const seed = [
      'TRACK BY TRACK',
      '00:00–03:00  1. Dandelicious',
      'Opens the room.',
      '',
      '03:00–06:00  2. Escapade',
      'Closes the room quietly.',
      '',
      'TRACKLIST (continuous · no space between tracks)',
      '00:00–03:00  1. Dandelicious',
    ].join('\n')
    const out = mergeYoutubeVisualizerStructure(
      'A six-track listen before Escapade closes the room quietly and completely.\n\nTRACK BY TRACK\n00:00–03:00  1. Dandelicious\nOpens the room.',
      seed,
      ['Dandelicious', 'Escapade'],
    )
    expect(out).toMatch(/TRACK BY TRACK/)
    expect((out.match(/Escapade/g) || []).length).toBeGreaterThan(1)
    expect(out).toMatch(/Closes the room quietly/)
    expect(out.indexOf('Closes the room quietly')).toBeLessThan(out.indexOf('TRACKLIST'))
  })
})

describe('clipYoutubeVisualizer', () => {
  it('trims the opener instead of dropping later track walk', () => {
    const walk = [
      'TRACK BY TRACK',
      '00:00–03:00  1. Dandelicious',
      'Opens the room.',
      '',
      '03:00–06:00  2. Escapade',
      'Closes the room quietly.',
      '',
      'TRACKLIST (continuous · no space between tracks)',
      '00:00–03:00  1. Dandelicious',
      '03:00–06:00  2. Escapade',
    ].join('\n')
    const out = clipYoutubeVisualizer(`${'Synthedelics is a long opener. '.repeat(80)}\n\n${walk}`, 500)
    expect(out.length).toBeLessThanOrEqual(500)
    expect(out).toMatch(/Escapade/)
    expect(out).toMatch(/Closes the room quietly/)
    expect(out).toMatch(/TRACK BY TRACK/)
  })
})

describe('mergeStoreTrackCoverage', () => {
  it('restores a full Tracklist when the model only names the opener', () => {
    const seed = [
      'UTOPIA by SERGIK — Funky House EP',
      '',
      'Tracklist',
      '1. Jahdelicah — 124 BPM',
      '   Jahdelicah opens warm.',
      '2. Night Drive — 126 BPM',
      '   Night Drive keeps the lights low.',
    ].join('\n')
    const out = mergeStoreTrackCoverage('UTOPIA by SERGIK — Funky House EP\n\nJahdelicah opens the room.', seed, [
      'Jahdelicah',
      'Night Drive',
    ])
    expect(out).toMatch(/Jahdelicah/)
    expect(out).toMatch(/Night Drive/)
    expect(out).toMatch(/keeps the lights low/)
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
    expect(buildRefineMarketingCopyPrompt({ field: 'press_blurb', draft, catalog })).toMatch(
      /Unified Sonic DNA \+ polymath brief/,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'press_blurb', draft, catalog })).toMatch(
      /Admin AI desk — strategy \+ expansion/,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'press_blurb', draft, catalog, mode: 'draft' })).toMatch(
      /Write a fresh/,
    )
  })

  it('rebuilds the YouTube visualizer from catalog times instead of a run-on draft', () => {
    const catalog = dnaCopyInputFromCatalog({
      title: 'Are We Awake?',
      type: 'ep',
      artist: 'SERGIK',
      tracks: [
        {
          title: 'It Is What It Is',
          track_number: 1,
          duration: 180,
          identity: { description: 'Opens stripped at 124 BPM.', bpm: 124 },
        },
        {
          title: 'Elevator Musik',
          track_number: 2,
          duration: 200,
          identity: { description: 'Arrives sideways.', bpm: 127 },
        },
      ],
    })
    const text = polishMarketingCopyFieldLocally({
      field: 'youtube_visualizer',
      draft: 'A long visualizer blurb that never mentions times and just keeps going without structure.',
      catalog,
    })
    expect(text).toMatch(/Full EP Visualizer/)
    expect(text).toMatch(/00:00–03:00/)
    expect(text).toMatch(/03:00–06:20/)
    expect(text).toMatch(/CHAPTERS/)
    expect(buildRefineMarketingCopyPrompt({ field: 'youtube_visualizer', draft: '', catalog })).toMatch(
      /no space between tracks/i,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'youtube_visualizer', draft: '', catalog })).toMatch(
      /SergikAI/,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'youtube_visualizer', draft: '', catalog })).toMatch(
      /EVERY catalog track/,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'youtube_visualizer', draft: '', catalog })).toMatch(
      /It Is What It Is, Elevator Musik/,
    )
  })

  it('rebuilds platform tags with YouTube keywords and social hashtag blocks', () => {
    const catalog = dnaCopyInputFromCatalog({
      title: 'Are We Awake?',
      type: 'ep',
      artist: 'SERGIK',
      genre: 'Funky House',
      tracks: [
        { title: 'It Is What It Is', track_number: 1, identity: { genre: 'Funky House', bpm: 124 } },
        { title: 'Elevator Musik', track_number: 2, identity: { genre: 'Funky House', bpm: 127 } },
      ],
    })
    const text = polishMarketingCopyFieldLocally({
      field: 'platform_tags',
      draft: 'just hashtag spam #fyp #viral',
      catalog,
    })
    expect(text).toMatch(/YOUTUBE TAGS/)
    expect(text).toMatch(/Official Audio/)
    expect(text).toMatch(/It Is What It Is/)
    expect(text).toMatch(/#Visualizer/)
    expect(text).toMatch(/INSTAGRAM \/ THREADS/)
    expect(buildRefineMarketingCopyPrompt({ field: 'platform_tags', draft: '', catalog })).toMatch(
      /YOUTUBE TAGS/,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'platform_tags', draft: '', catalog })).toMatch(
      /Admin AI desk — strategy \+ expansion/,
    )
    expect(buildRefineMarketingCopyPrompt({ field: 'platform_tags', draft: '', catalog })).toMatch(
      /different discovery surface/,
    )
  })
})

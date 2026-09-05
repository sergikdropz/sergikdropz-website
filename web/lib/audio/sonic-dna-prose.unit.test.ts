import { describe, expect, it } from 'vitest'
import { formatSonicDnaProse, measuredGrooveFacts } from './sonic-dna-prose'

describe('formatSonicDnaProse', () => {
  it('splits usage sentences into a list and leftover copy into paragraphs', () => {
    const blocks = formatSonicDnaProse(
      'Groove class Experimental Bass / Halftime adjacent from measured usage, not from a crate name. Kick is used as a steady four-on-the-floor pulse. Snare/clap is used as a 2-and-4 backbeat. After dubstep peaked, bass music splintered. Broken drums plus sub without a house hat ride is that diaspora.',
    )
    expect(blocks.some((block) => block.type === 'list' && block.items[0].startsWith('Groove class'))).toBe(true)
    expect(blocks.filter((block) => block.type === 'paragraph')).toHaveLength(1)
    const paragraph = blocks.find((block) => block.type === 'paragraph')
    expect(paragraph && paragraph.type === 'paragraph' ? paragraph.text : '').toMatch(/After dubstep peaked/)
  })

  it('splits psychoacoustics labels into a list', () => {
    const blocks = formatSonicDnaProse(
      'Social usage: a shared dance-floor clock. Sonic intent: keep bodies on a house lift. Activation formula: drums → tempo → bass → hats. Listener effect: predicted affect cluster euphoric.',
      { headings: false },
    )
    const list = blocks.find((block) => block.type === 'list')
    expect(list && list.type === 'list' ? list.items : []).toEqual(
      expect.arrayContaining([
        'Social usage: a shared dance-floor clock',
        'Sonic intent: keep bodies on a house lift',
        'Activation formula: drums → tempo → bass → hats',
        'Listener effect: predicted affect cluster euphoric',
      ]),
    )
  })

  it('turns DSP pulse lines into labeled facts', () => {
    const blocks = formatSonicDnaProse(
      'Pulse 144 BPM (full-time). Drum family four-on-the-floor; kick four-on-the-floor; snare backbeat-2-and-4; hats eighths. Bass lock offbeat-syncopated around C#. Root/key C# minor / Camelot 12A.',
      { headings: false },
    )
    const list = blocks.find((block) => block.type === 'list')
    expect(list && list.type === 'list' ? list.items : []).toEqual(
      expect.arrayContaining([
        'Pulse: 144 BPM (full-time)',
        'Drum family: four-on-the-floor',
        'Kick: four-on-the-floor',
        'Snare: backbeat-2-and-4',
        'Hats: eighths',
        'Bass lock: offbeat-syncopated around C#',
        'Root / key: C# minor / Camelot 12A',
      ]),
    )
  })
})

describe('measuredGrooveFacts', () => {
  it('maps DSP fields into labeled rows', () => {
    const rows = measuredGrooveFacts({
      bpm: 123.05,
      timingFeel: 'full-time',
      drumFamily: 'four-on-the-floor',
      key: 'A major',
      camelot: '11B',
      percussion: { kickRole: 'four-on-the-floor', snareRole: 'backbeat-2-and-4', hatGrid: 'offbeat-hats' },
      bass: { lock: 'offbeat-syncopated', rootNote: 'A' },
    })
    expect(rows[0]).toEqual({ label: 'Pulse', value: '123 BPM (full-time)' })
    expect(rows.find((row) => row.label === 'Root / key')?.value).toBe('A major / Camelot 11B')
  })
})

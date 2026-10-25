import { describe, expect, it } from 'vitest'
import {
  ADMIN_AI_WORKING_LINES,
  isGenericWorkingNote,
  pickWorkingLine,
  workingCuesFor,
  workingLineAt,
} from '@/lib/ai/admin-ai-working-lines'

function scripted(values: number[]) {
  let index = 0
  return () => values[index++ % values.length]!
}

describe('admin working lines', () => {
  it('keeps a deck of distinct short status lines', () => {
    expect(ADMIN_AI_WORKING_LINES.length).toBeGreaterThan(12)
    expect(new Set(ADMIN_AI_WORKING_LINES).size).toBe(ADMIN_AI_WORKING_LINES.length)
    for (const line of ADMIN_AI_WORKING_LINES) {
      expect(line.length).toBeGreaterThan(8)
      expect(line.length).toBeLessThan(42)
    }
    expect(ADMIN_AI_WORKING_LINES).toEqual(
      expect.arrayContaining([
        'Pondering',
        'Hypothesizing',
        'Voicing the partials',
        'Tuning the room',
        'Reading the open desk',
        'Following the thread',
        'Listening for the next bar',
        'Tracing the signal',
        'Lining up the facts',
        'Walking the page',
        'Pulling the live picture',
        'Sorting what still matters',
        'Holding the groove',
        'Scanning the desk',
        'Working the problem',
        'Exploring the page',
        'Analyzing the turn',
        'Operating on this chat',
        'Digging through the thread',
        'Mapping the next step',
        'Cross-checking the codes',
        'Warming the answer',
        'Looking under the hood',
        'Riding the live page',
        'Piecing the picture together',
        'Checking the release',
        'Catching the downbeat',
        'Running the sequence',
        'Sifting the page',
        'Keeping time',
        'Opening the next door',
        'Tracking the change',
        'Gathering the live read',
      ]),
    )
  })

  it('wraps the index and treats the stock progress line as generic', () => {
    expect(workingLineAt(0)).toBe(ADMIN_AI_WORKING_LINES[0])
    expect(workingLineAt(ADMIN_AI_WORKING_LINES.length)).toBe(ADMIN_AI_WORKING_LINES[0])
    expect(workingLineAt(-1)).toBe(ADMIN_AI_WORKING_LINES[ADMIN_AI_WORKING_LINES.length - 1])
    expect(isGenericWorkingNote(null)).toBe(true)
    expect(isGenericWorkingNote('In progress: Assistant is working on this chat.')).toBe(true)
    expect(isGenericWorkingNote('In progress: Opened the album page')).toBe(false)
  })

  it('reads the live turn and skips the stock progress sentence', () => {
    expect(workingCuesFor('In progress: Assistant is working on this chat.')).toEqual([])
    expect(workingCuesFor('Opened the DistroKid album page. UPC 700563968501')).toEqual([
      'page',
      'desk',
      'codes',
      'release',
    ])
    expect(workingCuesFor('Draft a campaign brief for the release')).toEqual(['release', 'compose'])
    expect(workingCuesFor('Check Sonic DNA bpm before mastering')).toEqual(['signal'])
  })

  it('shuffles inside the fitting lines and does not walk the deck', () => {
    const context = 'DistroKid album dashboard UPC 700563968501 ISRC'
    const fitted = new Set<string>()
    for (let step = 0; step < 24; step += 1) {
      fitted.add(
        pickWorkingLine({
          context,
          random: scripted([0.1, (step + 0.5) / 24]),
        }),
      )
    }
    expect(fitted.has('Cross-checking the codes')).toBe(true)
    expect(fitted.has('Walking the page')).toBe(true)
    expect(fitted.has('Checking the release')).toBe(true)
    expect(fitted.has('Voicing the partials')).toBe(false)
    expect(fitted.has('Arranging the motif')).toBe(false)

    let previous: string | null = null
    const sequence: string[] = []
    const random = scripted([0.95, 0.15, 0.95, 0.8, 0.95, 0.42, 0.95, 0.63])
    for (let step = 0; step < 8; step += 1) {
      const line = pickWorkingLine({ previous, context: '', random })
      sequence.push(line)
      previous = line
    }
    expect(new Set(sequence).size).toBeGreaterThan(1)
    expect(sequence).not.toEqual(ADMIN_AI_WORKING_LINES.slice(0, sequence.length))
    expect(sequence.some((line, index) => index > 0 && line === sequence[index - 1])).toBe(false)
  })
})

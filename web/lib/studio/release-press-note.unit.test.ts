import { describe, expect, it } from 'vitest'
import {
  buildPressNoteBrief,
  buildPressNotePrompt,
  lyricsFromTranscription,
  parsePressNoteReply,
} from '@/lib/studio/release-press-note'

describe('lyricsFromTranscription', () => {
  it('keeps real lyric lines', () => {
    const out = lyricsFromTranscription('Are we awake in the after hours, still moving')
    expect(out.vocalStatus).toBe('lyrics')
    expect(out.lyrics).toMatch(/Are we awake/)
  })

  it('marks instrumental replies', () => {
    expect(lyricsFromTranscription('INSTRUMENTAL')).toEqual({
      lyrics: null,
      vocalStatus: 'instrumental',
    })
  })
})

describe('press note prompt', () => {
  it('asks for journalist copy and keeps sibling notes unique', () => {
    const brief = buildPressNoteBrief({
      title: 'It Is What It Is',
      releaseTitle: 'Are We Awake?',
      identity: {
        description: null,
        genre: 'Funky House',
        subgenre: 'Boogie',
        bpm: 124,
        key_signature: 'C# major',
        scale: null,
        energy: 4.1,
        danceability: 7,
        drum_style: 'Breakbeat',
        time_signature: '4/4',
        timing_feel: 'full-time',
        intention: 'Open space so bass and delay can act as architecture.',
        instruments: ['Sub / 808 bass', 'Kick drum'],
        dna_complete: true,
      },
      sonicDna: {
        measured: {
          bpm: 124,
          key: 'C# major',
          intelligence: {
            intention: 'Open space so bass and delay can act as architecture.',
            psychoacoustics: { sonicIntent: 'weight and air, not a hat wash' },
          },
        },
      },
      lyrics: 'Are we awake',
      siblings: [
        {
          title: 'Elevator Musik',
          description: 'A tighter warehouse cut with hats that ride the bar.',
        },
      ],
    })
    const prompt = buildPressNotePrompt(brief)
    expect(brief.vocalStatus).toBe('lyrics')
    expect(prompt).toMatch(/journalist/)
    expect(prompt).toMatch(/It Is What It Is/)
    expect(prompt).toMatch(/Elevator Musik/)
    expect(prompt).toMatch(/Are we awake/)
    expect(prompt).not.toMatch(/assign_isrcs/)
  })
})

describe('parsePressNoteReply', () => {
  it('reads fenced JSON', () => {
    const note = parsePressNoteReply(`
\`\`\`json
{"description":"It Is What It Is leaves air around the kick so the sub can speak in full sentences, a late-night house record that would rather haunt the room than rush it.","intention":"Weight and air, not a hat wash."}
\`\`\`
`)
    expect(note.description).toMatch(/It Is What It Is leaves air/)
    expect(note.intention).toMatch(/Weight and air/)
  })
})

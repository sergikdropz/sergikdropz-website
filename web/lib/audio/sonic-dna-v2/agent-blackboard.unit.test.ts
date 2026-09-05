import { describe, expect, it } from 'vitest'
import {
  AGENT_COLLAB_WAVES,
  buildKbSlice,
  createBlackboard,
  formatBlackboardPrompt,
  peerAgentData,
  seedMeasuredFromPreanalysis,
} from '@/lib/audio/sonic-dna-v2/agent-blackboard'
import { mergeAgentWaveOntoBlackboard } from '@/lib/audio/sonic-dna-v2/merge-agent-wave'
import { AgentType } from '@/utils/sonicDNAAgents/agentTypes'

describe('agent-blackboard', () => {
  it('builds encyclopedia KB slice for Funky House and Reggae', () => {
    const house = buildKbSlice({ primary: 'Funky House', drumFamily: 'four-on-the-floor' })
    expect(house.primary).toBe('Funky House')
    expect(house.profileExcerpt.length).toBeGreaterThan(80)
    expect(house.related.length).toBeGreaterThan(0)

    const reggae = buildKbSlice({ primary: 'Dub Reggae', drumFamily: 'boom-bap' })
    expect(reggae.primary).toBe('Reggae')
    expect(reggae.profileExcerpt.length).toBeGreaterThan(80)
  })

  it('formats prompt with quote-the-grid rule', () => {
    const board = createBlackboard({
      trackId: 't1',
      trackTitle: 'Test',
      artistName: 'SERGIK',
      bpm: 123,
      drumFamily: 'four-on-the-floor',
      primaryGenre: 'Funky House',
      key: 'A major',
    })
    const prompt = formatBlackboardPrompt(board)
    expect(prompt).toMatch(/BPM: 123/)
    expect(prompt).toMatch(/Drums: four-on-the-floor/)
    expect(prompt).toMatch(/MUST embed at least one literal measured line/i)
  })

  it('resolves peer payloads whether bare data or AgentResult-shaped', () => {
    expect(peerAgentData({ [AgentType.TECHNICAL_ANALYZER]: { bpm: 120 } }, AgentType.TECHNICAL_ANALYZER)?.bpm).toBe(
      120,
    )
    expect(
      peerAgentData(
        { [AgentType.TECHNICAL_ANALYZER]: { agentType: AgentType.TECHNICAL_ANALYZER, success: true, data: { bpm: 128 } } },
        AgentType.TECHNICAL_ANALYZER,
      )?.bpm,
    ).toBe(128)
  })

  it('defines DAG waves: DSP measure before classify lock, then polymath parallel', () => {
    const ids = AGENT_COLLAB_WAVES.map((w) => w.id)
    expect(AGENT_COLLAB_WAVES[0].agents).toEqual([AgentType.WAVEFORM_GENERATOR])
    expect(AGENT_COLLAB_WAVES[0].parallel).toBe(false)
    const measure = AGENT_COLLAB_WAVES.find((w) => w.id === 'measure-dsp')
    expect(measure?.parallel).toBe(true)
    expect(measure?.agents).toEqual([AgentType.DRUM_PATTERN_EXPERT, AgentType.HARMONY_ANALYST])
    expect(measure?.agents).not.toContain(AgentType.GENRE_SPECIALIST)
    const pocket = AGENT_COLLAB_WAVES.find((w) => w.id === 'measure-pocket')
    expect(pocket?.agents).toEqual([AgentType.BASS_POCKET_ANALYST, AgentType.INSTRUMENT_USAGE_ANALYST])
    expect(pocket?.parallel).toBe(true)
    const classify = AGENT_COLLAB_WAVES.find((w) => w.id === 'classify-lock')
    expect(classify?.agents).toEqual([AgentType.GENRE_SPECIALIST])
    expect(ids.indexOf('measure-dsp')).toBeLessThan(ids.indexOf('measure-pocket'))
    expect(ids.indexOf('measure-pocket')).toBeLessThan(ids.indexOf('classify-lock'))
    expect(classify?.parallel).toBe(false)
    const poly = AGENT_COLLAB_WAVES.find((w) => w.id === 'polymath-specialists')
    expect(poly?.agents).toEqual([
      AgentType.CULTURAL_ANALYST,
      AgentType.MUSICOLOGIST,
      AgentType.EMOTIONAL_PSYCHOLOGIST,
      AgentType.PSYCHOLOGY_ANALYST,
      AgentType.PSYCHOACOUSTICS_ANALYST,
    ])
    expect(poly?.parallel).toBe(true)
  })

  it('merges drum specialist onto measured when seed empty', () => {
    let board = seedMeasuredFromPreanalysis({
      trackId: 'x',
      trackTitle: 'Cut',
      artistName: 'SERGIK',
      audioFeatures: { bpm: 76 },
    })
    board = mergeAgentWaveOntoBlackboard(board, 'measure-dsp', [
      {
        type: AgentType.DRUM_PATTERN_EXPERT,
        result: {
          agentType: AgentType.DRUM_PATTERN_EXPERT,
          success: true,
          confidence: 0.9,
          processingTime: 1,
          data: {
            signatureMatch: { name: 'boom-bap' },
            kickAnalysis: { positions: [0] },
            snareAnalysis: { positions: [8] },
          },
        },
      },
    ])
    expect(board.measured.drumFamily).toBe('boom-bap')
    expect(board.measured.kickSteps).toEqual([0])
    expect(board.wavesCompleted).toContain('measure-dsp')
    expect(board.evidence.length).toBeGreaterThan(0)
  })

  it('merges psychology and psychoacoustics onto measured intelligence', () => {
    let board = seedMeasuredFromPreanalysis({
      trackId: 'x',
      trackTitle: 'Cut',
      artistName: 'SERGIK',
      audioFeatures: { bpm: 124 },
    })
    board = {
      ...board,
      measured: { ...board.measured, drumFamily: 'four-on-the-floor' },
    }
    board = mergeAgentWaveOntoBlackboard(board, 'polymath-specialists', [
      {
        type: AgentType.PSYCHOLOGY_ANALYST,
        result: {
          agentType: AgentType.PSYCHOLOGY_ANALYST,
          success: true,
          confidence: 0.9,
          processingTime: 1,
          data: {
            psychologicalProfile:
              'Predictable 4/4 plus moderate syncopation supports motor coupling and affiliative play on the dancefloor without dissociative overload.',
          },
        },
      },
      {
        type: AgentType.PSYCHOACOUSTICS_ANALYST,
        result: {
          agentType: AgentType.PSYCHOACOUSTICS_ANALYST,
          success: true,
          confidence: 0.9,
          processingTime: 1,
          data: {
            report:
              'Offbeat hats raise temporal prediction error that resolves every beat; kick grid drives entrainment while warm bass lock anchors social coupling.',
            activationFormula: '124 BPM four-on-the-floor + offbeat hats',
            listenerEffects: ['motor coupling', 'prediction error'],
          },
        },
      },
    ])
    expect(String(board.measured.intelligence?.emotional?.psychologicalProfile || '')).toMatch(/motor coupling/)
    expect(String(board.measured.intelligence?.psychoacoustics?.report || '')).toMatch(/entrainment/)
    expect(String(board.measured.report?.layers?.psychological || '')).toMatch(/affiliative/)
    expect(board.wavesCompleted).toContain('polymath-specialists')
  })
})

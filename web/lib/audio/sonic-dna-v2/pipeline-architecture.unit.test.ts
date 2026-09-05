import { describe, expect, it } from 'vitest'
import {
  SONIC_DNA_ARCHITECTURE_VERSION,
  SONIC_DNA_INTEL_PHASES,
  describeSonicDnaOptimumSequence,
} from '@/lib/audio/sonic-dna-v2/pipeline-architecture'
import { AGENT_COLLAB_WAVES } from '@/lib/audio/sonic-dna-v2/agent-blackboard'

describe('pipeline-architecture', () => {
  it('documents the intel v3 optimum sequence', () => {
    expect(SONIC_DNA_ARCHITECTURE_VERSION).toBe('sonic-dna-intel-v3')
    expect(SONIC_DNA_INTEL_PHASES[0]).toBe('health')
    expect(SONIC_DNA_INTEL_PHASES).toContain('classify_lock')
    expect(SONIC_DNA_INTEL_PHASES).toContain('polymath')
    const text = describeSonicDnaOptimumSequence()
    expect(text).toMatch(/DSP measure/)
    expect(text).toMatch(/Classify lock/)
    expect(text).toMatch(/Polymath LLMs/)
    expect(text).toMatch(/psychology/)
    expect(text).toMatch(/psychoacoustics/)
  })

  it('keeps agent waves aligned with classify-after-dsp', () => {
    const ids = AGENT_COLLAB_WAVES.map((w) => w.id)
    expect(ids.indexOf('measure-dsp')).toBeLessThan(ids.indexOf('measure-pocket'))
    expect(ids.indexOf('measure-pocket')).toBeLessThan(ids.indexOf('classify-lock'))
    expect(ids.indexOf('classify-lock')).toBeLessThan(ids.indexOf('polymath-specialists'))
    const poly = AGENT_COLLAB_WAVES.find((w) => w.id === 'polymath-specialists')
    expect(poly?.agents).toContain('psychology_analyst')
    expect(poly?.agents).toContain('psychoacoustics_analyst')
  })
})

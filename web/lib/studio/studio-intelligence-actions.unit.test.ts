import { describe, expect, it } from 'vitest'
import {
  buildListeningJourneyAdminAiPrompt,
  buildPressNotesAdminAiPrompt,
  studioIntelligenceContextLine,
} from '@/lib/studio/studio-intelligence-actions'

describe('studio intelligence actions', () => {
  it('exposes context lines for studio surfaces', () => {
    expect(studioIntelligenceContextLine('metadata_listening_journey')).toMatch(/polymath/)
    expect(studioIntelligenceContextLine('dsp_check_delivery')).toMatch(/ops intel/)
  })

  it('builds Admin AI prompts with snapshot + harness', () => {
    const journey = buildListeningJourneyAdminAiPrompt({
      releaseId: 'rel-1',
      releaseTitle: 'Neon EP',
    })
    expect(journey.message).toMatch(/query_release_studio_snapshot/)
    expect(journey.message).toMatch(/query_intelligence_harness/)
    expect(journey.message).toMatch(/ai-apply/)

    const press = buildPressNotesAdminAiPrompt({
      releaseId: 'rel-1',
      releaseTitle: 'Neon EP',
      trackId: 'tr-1',
      trackTitle: 'Cut A',
    })
    expect(press.message).toMatch(/Cut A/)
    expect(press.message).toMatch(/query_intelligence_harness/)
  })
})

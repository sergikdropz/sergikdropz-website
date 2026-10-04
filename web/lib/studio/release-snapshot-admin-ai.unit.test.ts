import { describe, expect, it } from 'vitest'
import { buildReleaseSnapshotAdminAiBrief } from '@/lib/studio/release-snapshot-admin-ai'
import type { ReleaseStudioSnapshot } from '@/lib/studio/release-snapshot'

describe('buildReleaseSnapshotAdminAiBrief', () => {
  it('summarizes empty copy fields and timestamp timeline', () => {
    const snapshot: ReleaseStudioSnapshot = {
      release: {
        title: 'Test EP',
        marketing_copy: { elevator_pitch: 'Short' },
      },
      tracks: [
        {
          title: 'Cut A',
          duration: 120,
          copy_intel: {
            title: 'Cut A',
            unified: true,
            groove: 'House · 128 BPM',
            intention: 'Late-night floor pressure.',
            description: '',
            culture: '',
            musicology: '',
            emotion: '',
            psychology: '',
            psychoacoustics: '',
            related: [],
            durationSec: 120,
          },
        },
        { title: 'Cut B', duration: 180, copy_intel: null },
      ],
      storeLinks: [],
      copyright: null,
    }

    const brief = buildReleaseSnapshotAdminAiBrief(snapshot)
    expect(brief.emptyMarketingFields).toContain('spotify_pitch')
    expect(brief.partialMarketingFields).toContain('elevator_pitch')
    expect(brief.copyIntelTracks[0]?.hasSignal).toBe(true)
    expect(brief.youtubeTimestampTimeline).toHaveLength(2)
    expect(brief.timestampFacts.complete).toBe(true)
    expect(brief.copyDesk.recommendedNextFields.length).toBeGreaterThan(0)
    expect(brief.sonicDnaUnified.unifiedIntelligenceTracks).toBe(1)
  })
})

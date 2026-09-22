import { describe, expect, it } from 'vitest'
import {
  buildDspMasterMatches,
  dspMastersRelativePath,
  folderPriorityForMasterPath,
  isDspMasterUrl,
  isrcFromMasterFileName,
  matchTrackToDspMaster,
  pickDspMasterR2Key,
  trackNeedsDspMaster,
  type DspMasterSourceHit,
} from '@/lib/studio/dsp-masters'
import { approxWavDurationSeconds, durationsAgree } from '@/lib/studio/dsp-masters-ingest-server'

function hit(
  partial: Partial<DspMasterSourceHit> & Pick<DspMasterSourceHit, 'absPath' | 'fileName'>,
): DspMasterSourceHit {
  return {
    sizeBytes: 50_000_000,
    stemKey: partial.fileName.replace(/\.wav$/i, '').toLowerCase(),
    folderScore: folderPriorityForMasterPath(partial.absPath),
    isrcFromName: isrcFromMasterFileName(partial.fileName),
    ...partial,
  }
}

describe('dsp-masters', () => {
  it('builds R2 paths under dsp-masters/{release}/{ISRC}-title.wav', () => {
    expect(
      dspMastersRelativePath({
        releaseTitle: 'Soul Candy',
        trackTitle: 'Everyday Gratitude',
        isrc: 'QZES72569812',
      }),
    ).toBe('dsp-masters/soul-candy/QZES72569812-everyday-gratitude.wav')
  })

  it('parses ISRC from DistroKid-style filenames', () => {
    expect(isrcFromMasterFileName('QZES72569811-SoulCandy.wav')).toBe('QZES72569811')
  })

  it('prefers ISRC-named DistroKid downloads over title-only exports', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK - How Ya.wav',
        fileName: 'SERGIK - How Ya.wav',
        sizeBytes: 40_000_000,
      }),
      hit({
        absPath: '/Volumes/SERGIK/Distrokid downloads/QZHN92462132-HowYa.wav',
        fileName: 'QZHN92462132-HowYa.wav',
        sizeBytes: 57_000_000,
      }),
    ]
    const matched = matchTrackToDspMaster(sources, {
      trackTitle: 'How Ya',
      isrc: 'QZHN92462132',
      releaseTitle: 'How Ya',
    })
    expect(matched?.fileName).toBe('QZHN92462132-HowYa.wav')
  })

  it('resolves Recouperate ↔ Recuperate alias', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/Distrokid downloads/QZMEN2188036-Recuperate.mp3.wav',
        fileName: 'QZMEN2188036-Recuperate.mp3.wav',
      }),
    ]
    const matched = matchTrackToDspMaster(sources, {
      trackTitle: 'Recouperate',
      isrc: 'QZMEN2188036',
    })
    expect(matched?.fileName).toContain('Recuperate')
  })

  it('skips instrumentals unless the track title asks for them', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK - Back to The Basics (Instrumental).wav',
        fileName: 'SERGIK - Back to The Basics (Instrumental).wav',
        sizeBytes: 76_000_000,
      }),
      hit({
        absPath: '/Volumes/SERGIK/SERGIK ALBUM RELEASE MASTERS/Soul Candy/SERGIK - Back to The Basics.wav',
        fileName: 'SERGIK - Back to The Basics.wav',
        sizeBytes: 75_000_000,
      }),
    ]
    const matched = matchTrackToDspMaster(sources, {
      trackTitle: 'Back to the Basics',
      isrc: 'QZES72569814',
    })
    expect(matched?.fileName).toBe('SERGIK - Back to The Basics.wav')
  })

  it('builds match report rows with relative paths', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/SERGIK ALBUM RELEASE MASTERS/Soul Candy/SERGIK - Soul Candy.wav',
        fileName: 'SERGIK - Soul Candy.wav',
      }),
    ]
    const rows = buildDspMasterMatches(sources, [
      { releaseTitle: 'Soul Candy', trackTitle: 'Soul Candy', isrc: 'QZES72569811' },
      { releaseTitle: 'Missing', trackTitle: 'No Match Here', isrc: null },
    ])
    expect(rows[0]?.relativeR2Path).toBe('dsp-masters/soul-candy/QZES72569811-soul-candy.wav')
    expect(rows[1]?.hit).toBeNull()
  })

  it('prefers exact Life.wav over More Than Life', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK - More Than Life.wav',
        fileName: 'SERGIK - More Than Life.wav',
        sizeBytes: 71_000_000,
        stemKey: 'sergik more than life',
      }),
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK - Life.wav',
        fileName: 'SERGIK - Life.wav',
        sizeBytes: 50_000_000,
        stemKey: 'sergik life',
      }),
    ]
    expect(matchTrackToDspMaster(sources, { trackTitle: 'Life' })?.fileName).toBe('SERGIK - Life.wav')
  })

  it('prefers Utopia.wav over Utopia EP Mix', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK - Utopia EP Mix.wav',
        fileName: 'SERGIK - Utopia EP Mix.wav',
        sizeBytes: 310_000_000,
        stemKey: 'sergik utopia ep mix',
      }),
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK - Utopia.wav',
        fileName: 'SERGIK - Utopia.wav',
        sizeBytes: 60_000_000,
        stemKey: 'sergik utopia',
      }),
    ]
    expect(matchTrackToDspMaster(sources, { trackTitle: 'Utopia' })?.fileName).toBe('SERGIK - Utopia.wav')
  })

  it('maps Elevator Musik → Elevator.wav', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK - Elevator.wav',
        fileName: 'SERGIK - Elevator.wav',
        stemKey: 'sergik elevator',
      }),
    ]
    expect(
      matchTrackToDspMaster(sources, { trackTitle: 'Elevator Musik', isrc: 'QTA532600002' })?.fileName,
    ).toBe('SERGIK - Elevator.wav')
  })

  it('matches collab stems like sergik slick gangsta', () => {
    const sources = [
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK x Slick - Gangsta.wav',
        fileName: 'SERGIK x Slick - Gangsta.wav',
        stemKey: 'sergik slick gangsta',
      }),
      hit({
        absPath: '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs/SERGIK x BeJanis - Hydrate.wav',
        fileName: 'SERGIK x BeJanis - Hydrate.wav',
        stemKey: 'sergik bejanis hydrate',
      }),
    ]
    expect(matchTrackToDspMaster(sources, { trackTitle: 'Gangsta' })?.fileName).toContain('Gangsta')
    expect(matchTrackToDspMaster(sources, { trackTitle: 'Hydrate' })?.fileName).toContain('Hydrate')
  })

  it('picks R2 keys by ISRC then title slug', () => {
    const keys = [
      'dsp-masters/soul-candy/QZES72569812-everyday-gratitude.wav',
      'dsp-masters/other/QZES72569811-soul-candy.wav',
    ]
    expect(
      pickDspMasterR2Key(keys, {
        trackTitle: 'Everyday Gratitude',
        isrc: 'QZES72569812',
        releaseTitle: 'Soul Candy',
      }),
    ).toBe('dsp-masters/soul-candy/QZES72569812-everyday-gratitude.wav')
  })

  it('flags tracks that still need a DSP master', () => {
    expect(trackNeedsDspMaster(null)).toBe(true)
    expect(trackNeedsDspMaster('pending://vault/1')).toBe(true)
    expect(trackNeedsDspMaster('/audio/foo.mp3')).toBe(true)
    expect(trackNeedsDspMaster('/audio/dsp-masters/soul-candy/a.wav')).toBe(false)
    expect(isDspMasterUrl('/audio/dsp-masters/x.wav')).toBe(true)
  })

  it('agrees on duration within slack and parses WAV headers', () => {
    expect(durationsAgree(180, 182)).toBe(true)
    expect(durationsAgree(180, 220)).toBe(false)
    expect(durationsAgree(null, 180)).toBe(true)

    const buf = Buffer.alloc(44 + 176400)
    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + 176400, 4)
    buf.write('WAVE', 8)
    buf.write('fmt ', 12)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(2, 22)
    buf.writeUInt32LE(44100, 24)
    buf.writeUInt32LE(176400, 28)
    buf.writeUInt16LE(4, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(176400, 40)
    expect(approxWavDurationSeconds(buf)).toBe(1)
  })
})

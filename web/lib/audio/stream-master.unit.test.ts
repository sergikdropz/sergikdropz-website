import { describe, expect, it } from 'vitest'
import { planImportedAudio } from './stream-master'

describe('planImportedAudio', () => {
  it('keeps an mp3 as the stream file and does not invent a wav master', () => {
    expect(
      planImportedAudio({
        fileName: 'SERGIK - FTP.mp3',
        vaultRelativePath: 'unreleased/Library/SERGIK - FTP.mp3',
      }),
    ).toEqual({
      isWav: false,
      streamRelativePath: 'unreleased/Library/SERGIK - FTP.mp3',
      dspWavRelativePath: null,
    })
  })

  it('stores a library wav under dsp-masters and streams the mp3 sibling', () => {
    expect(
      planImportedAudio({
        fileName: 'Sergik x Slick - Da Pyramids.wav',
        vaultRelativePath: 'unreleased/Library/Sergik x Slick - Da Pyramids.wav',
      }),
    ).toEqual({
      isWav: true,
      streamRelativePath: 'unreleased/Library/Sergik x Slick - Da Pyramids.mp3',
      dspWavRelativePath: 'dsp-masters/library/Sergik x Slick - Da Pyramids.wav',
    })
  })

  it('leaves a wav that is already in dsp-masters in place', () => {
    expect(
      planImportedAudio({
        fileName: 'QZES72569811-soul-candy.wav',
        vaultRelativePath: 'dsp-masters/soul-candy/QZES72569811-soul-candy.wav',
      }),
    ).toEqual({
      isWav: true,
      streamRelativePath: 'dsp-masters/soul-candy/QZES72569811-soul-candy.mp3',
      dspWavRelativePath: 'dsp-masters/soul-candy/QZES72569811-soul-candy.wav',
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  cacheBustMediaUrl,
  isWavMasterFile,
  safeAudioFileName,
  vaultReplaceDestPath,
  wavMasterError,
} from '@/lib/audio/replace-audio-file'

describe('isWavMasterFile', () => {
  it('accepts .wav names and wav MIME types', () => {
    expect(isWavMasterFile('Are We Awake.wav')).toBe(true)
    expect(isWavMasterFile('mix.WAV')).toBe(true)
    expect(isWavMasterFile('mix', 'audio/wav')).toBe(true)
    expect(isWavMasterFile('mix.mp3')).toBe(false)
    expect(isWavMasterFile('mix.mp3', 'audio/mpeg')).toBe(false)
  })
})

describe('wavMasterError', () => {
  it('rejects empty, non-wav, and oversized files', () => {
    expect(wavMasterError({ name: 'mix.mp3', size: 12 })).toMatch(/WAV/i)
    expect(wavMasterError({ name: 'mix.wav', size: 0 })).toMatch(/empty/i)
    expect(wavMasterError({ name: 'mix.wav', size: 12 })).toBeNull()
  })
})

describe('vaultReplaceDestPath', () => {
  it('keeps the vault folder and uses the new filename', () => {
    expect(vaultReplaceDestPath('library/awake/it-is.mp3', 'af-1', 'It Is What It Is.wav')).toBe(
      'library/awake/It-Is-What-It-Is.wav',
    )
    expect(vaultReplaceDestPath(null, 'af-1', 'master.wav')).toBe('replacements/af-1/master.wav')
  })
})

describe('cacheBustMediaUrl', () => {
  it('appends a version query without dropping the path', () => {
    expect(cacheBustMediaUrl('https://cdn.example/a.wav', 9)).toBe('https://cdn.example/a.wav?v=9')
    expect(cacheBustMediaUrl('https://cdn.example/a.wav?download=1', 9)).toBe(
      'https://cdn.example/a.wav?download=1&v=9',
    )
  })
})

describe('safeAudioFileName', () => {
  it('strips path junk', () => {
    expect(safeAudioFileName('../../It Is?.wav')).toBe('It-Is-.wav')
  })
})

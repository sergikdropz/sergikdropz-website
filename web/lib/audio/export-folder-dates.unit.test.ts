import { describe, expect, it } from 'vitest'
import { wavFilesRootFromExports, WAV_FILES_FOLDER_NAME } from '@/lib/audio/export-folder-dates'

describe('wav files root', () => {
  it('places SERGIK WAVs under Exports, apart from the DSP Masters vault folder', () => {
    expect(wavFilesRootFromExports('/Volumes/SERGIK/Exports SERGIK')).toBe(
      `/Volumes/SERGIK/Exports SERGIK/${WAV_FILES_FOLDER_NAME}`,
    )
  })
})

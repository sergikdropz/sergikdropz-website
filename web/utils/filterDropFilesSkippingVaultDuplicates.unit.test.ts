import { describe, expect, it } from 'vitest'
import { filterDropFilesSkippingVaultDuplicates } from '@/utils/musicLibraryApi'

describe('filterDropFilesSkippingVaultDuplicates', () => {
  it('removes files whose basename matches a vault duplicate preview row', () => {
    const files = [
      new File(['a'], 'Existing.mp3', { type: 'audio/mpeg' }),
      new File(['b'], 'Brand-New.wav', { type: 'audio/wav' }),
    ]
    const kept = filterDropFilesSkippingVaultDuplicates(files, [{ file: 'Existing.mp3' }])
    expect(kept.map((f) => f.name)).toEqual(['Brand-New.wav'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  findReleaseForFolder,
  isLegacyScheduleStub,
  LEGACY_SCHEDULE_TO_VAULT_FOLDER,
  normalizeReleaseTitle,
} from '@/lib/studio/migrate-scheduled-eps'
import { studioReleaseIdFromVaultFolder } from '@/lib/studio/vault-import'
import {
  formatScheduleDateLabel,
  mapDistributorStatusToSchedule,
} from '@/lib/studio/schedule-bridge'

describe('normalizeReleaseTitle', () => {
  it('strips punctuation and EP suffix', () => {
    expect(normalizeReleaseTitle('Are We Awake?')).toBe('are we awake')
    expect(normalizeReleaseTitle('Are We Awake EP')).toBe('are we awake')
    expect(normalizeReleaseTitle('Vice & Virtues')).toBe('vice virtues')
  })
})

describe('legacy schedule mapping', () => {
  it('maps all known stubs to vault folders', () => {
    expect(Object.keys(LEGACY_SCHEDULE_TO_VAULT_FOLDER)).toEqual(
      expect.arrayContaining([
        'are-we-awake',
        'vice-and-virtues',
        'in-the-streets',
        'inspire',
        'the-world-dont-stop',
        'utopia',
        'daze',
        'staying-a-vibe',
      ]),
    )
  })

  it('detects legacy stubs only', () => {
    expect(
      isLegacyScheduleStub({
        id: 'vice-and-virtues',
        title: 'Vice & Virtues',
        type: 'EP',
        release_date: '2026-09-23',
        status: 'scheduled',
      }),
    ).toBe(true)
    expect(
      isLegacyScheduleStub({
        id: 'release-collection-unreleased-eps-sergik---are-w-mu4ysvib',
        title: 'Are We Awake?',
        type: 'Ep',
        release_date: '2026-01-01',
        status: 'draft',
        source: 'distribution',
      }),
    ).toBe(false)
  })

  it('does not fuzzy-collide inspire with in-the-streets titles', () => {
    expect(normalizeReleaseTitle('Inspire')).not.toBe(normalizeReleaseTitle('In The Streets'))
    expect(normalizeReleaseTitle('In The Streets').includes(normalizeReleaseTitle('Inspire'))).toBe(
      false,
    )
  })
})

describe('findReleaseForFolder', () => {
  const inspireFolder = 'collection-unreleased-eps-sergik---inspire-'
  const streetsFolder = 'collection-unreleased-eps-sergik---in-the-streets-'

  it('ignores poisoned vault meta when title belongs to another EP', () => {
    const streetsPoisoned = {
      id: 'release-collection-unreleased-eps-sergik---in-th-mu5pzhmi',
      title: 'In The Streets',
      marketing_copy: { _vault: { folderId: inspireFolder } },
    }
    const inspire = {
      id: 'release-collection-unreleased-eps-sergik---inspi-mu5r1pf6',
      title: 'Inspire',
      marketing_copy: { _vault: { folderId: inspireFolder } },
    }
    expect(findReleaseForFolder([streetsPoisoned, inspire], inspireFolder, 'Inspire')?.id).toBe(
      inspire.id,
    )
    expect(findReleaseForFolder([streetsPoisoned], inspireFolder, 'Inspire')).toBeNull()
  })

  it('matches In The Streets by correct vault folder meta', () => {
    const streets = {
      id: 'release-collection-unreleased-eps-sergik---in-th-mu5pzhmi',
      title: 'In The Streets',
      marketing_copy: { _vault: { folderId: streetsFolder } },
    }
    expect(findReleaseForFolder([streets], streetsFolder, 'In The Streets')?.id).toBe(streets.id)
    expect(findReleaseForFolder([streets], inspireFolder, 'Inspire')).toBeNull()
  })
})

describe('studioReleaseIdFromVaultFolder', () => {
  it('keeps inspire and in-the-streets ids distinguishable', () => {
    const inspire = studioReleaseIdFromVaultFolder(
      'collection-unreleased-eps-sergik---inspire-',
      1,
    )
    const streets = studioReleaseIdFromVaultFolder(
      'collection-unreleased-eps-sergik---in-the-streets-',
      1,
    )
    expect(inspire).toContain('inspire')
    expect(streets).toContain('in-the-streets')
    expect(inspire).not.toBe(streets)
  })
})

describe('schedule status mapping', () => {
  it('maps draft to pending', () => {
    expect(mapDistributorStatusToSchedule('draft')).toBe('pending')
    expect(mapDistributorStatusToSchedule('live')).toBe('released')
    expect(mapDistributorStatusToSchedule('submitted')).toBe('scheduled')
  })

  it('formats empty dates without Invalid Date', () => {
    expect(formatScheduleDateLabel('')).toBe('Date TBD')
    expect(formatScheduleDateLabel(null)).toBe('Date TBD')
    expect(formatScheduleDateLabel('not-a-date')).toBe('Date TBD')
    expect(formatScheduleDateLabel('2026-09-23')).toMatch(/2026/)
  })
})

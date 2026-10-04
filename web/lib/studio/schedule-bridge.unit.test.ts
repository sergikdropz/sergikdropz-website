import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const readFileSync = vi.fn(actual.readFileSync)
  const writeFileSync = vi.fn(actual.writeFileSync)
  const mocked = { ...actual, readFileSync, writeFileSync }
  return { ...mocked, default: mocked }
})

describe('writeReleaseSchedule on a read-only deploy', () => {
  const env = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...env }
    delete process.env.VERCEL
    vi.mocked(fs.writeFileSync).mockReset()
    vi.mocked(fs.readFileSync).mockReset()
  })

  it('skips the JSON file on Vercel and still returns the distribution row', async () => {
    process.env.VERCEL = '1'
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ schedule: [] }))
    const { upsertScheduleFromDistribution, writeReleaseSchedule } = await import('./schedule-bridge')

    expect(writeReleaseSchedule({ schedule: [] })).toEqual({ persisted: false, reason: 'readonly' })
    expect(fs.writeFileSync).not.toHaveBeenCalled()

    const mapped = upsertScheduleFromDistribution({
      id: 'release-1',
      title: 'Night Drive',
      type: 'single',
      distributor_status: 'pending',
    })
    expect(mapped.id).toBe('release-1')
    expect(mapped.title).toBe('Night Drive')
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('treats EROFS as a skipped write instead of failing the request', async () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      const error = new Error(
        "EROFS: read-only file system, open '/var/task/web/data/release-schedule.json'",
      ) as NodeJS.ErrnoException
      error.code = 'EROFS'
      throw error
    })
    const { writeReleaseSchedule } = await import('./schedule-bridge')
    expect(writeReleaseSchedule({ schedule: [] })).toEqual({
      persisted: false,
      reason: 'readonly',
    })
  })
})

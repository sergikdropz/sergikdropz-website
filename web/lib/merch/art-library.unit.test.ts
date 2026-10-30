import { describe, expect, it } from 'vitest'
import { prioritizeUserUploads, type MerchArtUpload } from '@/lib/merch/art-store'

function row(id: string, createdAt: string, origin: MerchArtUpload['origin']): MerchArtUpload {
  return { id, url: `/api/merch/art/${id}`, label: id.slice(0, 8), createdAt, origin }
}

describe('prioritizeUserUploads', () => {
  it('keeps older source art when newer mockup photos would fill the list', () => {
    const photos = Array.from({ length: 40 }, (_, index) =>
      row(`photo-${index}.jpg`, `2026-10-30T0${index % 10}:00:00.000Z`, 'printful'),
    )
    const art = Array.from({ length: 12 }, (_, index) =>
      row(`art-${index}.png`, `2026-10-29T0${index % 10}:00:00.000Z`, 'user'),
    )
    const listed = prioritizeUserUploads([...photos, ...art], 48)
    const users = listed.filter((item) => item.origin === 'user')
    expect(users).toHaveLength(12)
    expect(listed.filter((item) => item.origin === 'printful')).toHaveLength(40)
  })
})

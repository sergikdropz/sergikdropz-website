import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'

const FTP_UPC = '198669278325'

function loadFtpCatalogFixture() {
  const catalogPath = path.join(process.cwd(), 'data/distrokid-catalog-export.json')
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8'))
  const releases = (raw.releases || []).filter(
    (r: { upc?: string; title?: string }) =>
      String(r.upc || '') === FTP_UPC || String(r.title || '').toUpperCase() === 'FTP'
  )
  expect(releases.length).toBeGreaterThan(0)
  return {
    version: raw.version || 2,
    source: 'distrokid' as const,
    extracted_at: new Date().toISOString(),
    releases,
  }
}

test.describe('studio DistroKid import', () => {
  test('dry-run FTP catalog maps store links + submitted stores', async ({ request }) => {
    test.setTimeout(90_000)

    const catalog = loadFtpCatalogFixture()
    const ftp = catalog.releases[0]
    expect(ftp.store_links?.map((l: { store: string }) => l.store).sort()).toEqual(
      expect.arrayContaining(['amazon', 'apple_music', 'deezer', 'iheart', 'spotify'])
    )
    expect((ftp.submitted_stores || []).length).toBeGreaterThanOrEqual(20)

    const dry = await request.post('/api/studio/releases/from-distrokid', {
      data: {
        catalog,
        dryRun: true,
        fillEmptyOnly: true,
        matchVault: false,
      },
      timeout: 60_000,
    })
    expect(dry.status()).toBe(200)
    const json = await dry.json()
    expect(json.releases?.length).toBe(1)
    const row = json.releases[0]
    expect(row.upc || ftp.upc).toBe(FTP_UPC)
    expect(row.status === 'would_create' || row.status === 'would_update' || row.status === 'unchanged' || row.status === 'created' || row.status === 'updated').toBe(
      true
    )

    const linkStores = (row.store_links || []).map((l: { store: string }) => l.store)
    for (const store of ['spotify', 'apple_music', 'amazon', 'deezer', 'iheart']) {
      expect(linkStores).toContain(store)
    }

    // Unauth twin
    // (covered in admin-api — keep this suite focused on dry-run shape)
  })
})

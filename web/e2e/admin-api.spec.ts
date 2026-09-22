import { test, expect } from '@playwright/test'

const protectedAdminPaths = [
  '/api/admin/settings',
  '/api/admin/users',
  '/api/admin/purchases',
  '/api/admin/logs',
] as const

/** Privileged audio handlers must deny anonymous callers (defense beyond middleware). */
const privilegedAudioChecks: Array<{ method: 'GET' | 'POST'; path: string }> = [
  { method: 'GET', path: '/api/audio/list' },
  { method: 'GET', path: '/api/audio/agent-status' },
  { method: 'POST', path: '/api/audio/upload' },
  { method: 'POST', path: '/api/audio/sonic-dna-agents' },
  { method: 'POST', path: '/api/audio/analyze-all-sonic-dna' },
  { method: 'POST', path: '/api/audio/analyze-collection' },
  { method: 'POST', path: '/api/audio/sonic-dna-review' },
  { method: 'POST', path: '/api/audio/regenerate-all-sonic-dna' },
  { method: 'POST', path: '/api/audio/artifacts' },
  { method: 'POST', path: '/api/audio/replace' },
  { method: 'POST', path: '/api/studio/tracks/test/replace-wav' },
  { method: 'POST', path: '/api/audio/reprocess-track' },
  { method: 'POST', path: '/api/audio/update-bpm' },
]

const privilegedMusicLibraryChecks: Array<{ method: 'GET' | 'POST' | 'DELETE'; path: string }> = [
  { method: 'POST', path: '/api/music-library/folders/move' },
  { method: 'POST', path: '/api/music-library/sync-all-data' },
  { method: 'POST', path: '/api/music-library/build-sonic-dna-cache' },
  { method: 'GET', path: '/api/music-library/build-sonic-dna-cache' },
  { method: 'POST', path: '/api/music-library/smart-playlists' },
  { method: 'DELETE', path: '/api/music-library/smart-playlists?id=test' },
  { method: 'POST', path: '/api/music-library/rate' },
  { method: 'GET', path: '/api/supabase-check' },
]

test.describe('admin API (unauthenticated)', () => {
  test('POST /api/admin/ai/chat returns 401', async ({ request }) => {
    const res = await request.post('/api/admin/ai/chat', {
      data: { message: 'hello', stickySkillId: 'admin_intel' },
    })
    expect(res.status()).toBe(401)
  })

  for (const path of protectedAdminPaths) {
    test(`${path} returns 401`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(401)
    })
  }

  for (const check of privilegedAudioChecks) {
    test(`${check.method} ${check.path} returns 401`, async ({ request }) => {
      const res =
        check.method === 'GET'
          ? await request.get(check.path)
          : await request.post(check.path, { data: {} })
      expect(res.status()).toBe(401)
      const body = await res.json().catch(() => ({}))
      expect(body.code === 'ADMIN_REQUIRED' || body.error).toBeTruthy()
    })
  }

  for (const check of privilegedMusicLibraryChecks) {
    test(`${check.method} ${check.path} returns 401`, async ({ request }) => {
      const res =
        check.method === 'GET'
          ? await request.get(check.path)
          : check.method === 'DELETE'
            ? await request.delete(check.path)
            : await request.post(check.path, { data: {} })
      expect(res.status()).toBe(401)
      const body = await res.json().catch(() => ({}))
      expect(body.code === 'ADMIN_REQUIRED' || body.error).toBeTruthy()
    })
  }

  test('POST /api/studio/releases returns 401', async ({ request }) => {
    const res = await request.post('/api/studio/releases', { data: {} })
    expect(res.status()).toBe(401)
  })

  test('GET /api/studio/release-pipeline returns 401', async ({ request }) => {
    const res = await request.get('/api/studio/release-pipeline')
    expect(res.status()).toBe(401)
  })

  test('GET /api/studio/releases/test/social-promo returns 401', async ({ request }) => {
    const res = await request.get('/api/studio/releases/test/social-promo')
    expect(res.status()).toBe(401)
  })

  test('PUT /api/studio/releases/test/social-promo returns 401', async ({ request }) => {
    const res = await request.put('/api/studio/releases/test/social-promo', {
      data: { generate: true },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/studio/releases/test/dsp-connect returns 401', async ({ request }) => {
    const res = await request.get('/api/studio/releases/test/dsp-connect')
    expect(res.status()).toBe(401)
  })

  test('POST /api/studio/releases/test/dsp-connect returns 401', async ({ request }) => {
    const res = await request.post('/api/studio/releases/test/dsp-connect', {
      data: { seedUrl: 'https://open.spotify.com/album/x', persist: false },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/studio/releases/from-distrokid returns 401', async ({ request }) => {
    const res = await request.post('/api/studio/releases/from-distrokid', {
      data: { catalog: { version: 2, source: 'distrokid', extracted_at: '', releases: [] }, dryRun: true },
    })
    expect(res.status()).toBe(401)
  })

  test('PUT /api/studio/releases/test/copyright returns 401', async ({ request }) => {
    const res = await request.put('/api/studio/releases/test/copyright', {
      data: { ugc_pack: { opted_in: true } },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/studio/soundexchange/registry returns 401', async ({ request }) => {
    const res = await request.get('/api/studio/soundexchange/registry')
    expect(res.status()).toBe(401)
  })

  test('POST /api/studio/soundexchange/batch-submit returns 401', async ({ request }) => {
    const res = await request.post('/api/studio/soundexchange/batch-submit', {
      data: { trackIds: ['x'] },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/nurturing/campaigns returns 401', async ({ request }) => {
    const res = await request.post('/api/nurturing/campaigns', { data: {} })
    expect(res.status()).toBe(401)
  })
})

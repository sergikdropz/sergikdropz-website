import { test, expect, type Page } from '@playwright/test'

test.describe.configure({ timeout: 180_000 })

// Bundled Chromium decodes the vault's MP3s, so this runs everywhere. Set
// PLAYWRIGHT_AUDIO_CHANNEL=chrome to re-check against a stock Chrome build when
// a failure looks codec- or platform-specific.
const audioChannel = process.env.PLAYWRIGHT_AUDIO_CHANNEL
if (audioChannel) {
  test.use({ channel: audioChannel as 'chrome' })
}

type AudioSnapshot = {
  src: string
  readyState: number
  networkState: number
  paused: boolean
  currentTime: number
  duration: number | null
  errorCode: number | null
  errorMessage: string | null
  playbackRate: number
  volume: number
  muted: boolean
  contexts: string[]
}

async function unlockVault(page: Page) {
  const unlock = await page.request.post('/api/fan/vault-unlock', {
    data: { email: `e2e-playback-${Date.now()}@example.com` },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(unlock.ok(), 'vault unlock should succeed').toBeTruthy()
}

async function dismissConsent(page: Page) {
  const accept = page.getByRole('button', { name: /^Accept$/i })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!(await accept.isVisible().catch(() => false))) return
    await accept.click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
  }
}

async function snapshotAudio(page: Page): Promise<AudioSnapshot | null> {
  return page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('audio'))
    const active =
      elements.find((el) => el.currentSrc || el.src) ?? elements[0] ?? null
    if (!active) return null
    return {
      src: active.currentSrc || active.src || '',
      readyState: active.readyState,
      networkState: active.networkState,
      paused: active.paused,
      currentTime: active.currentTime,
      duration: Number.isFinite(active.duration) ? active.duration : null,
      errorCode: active.error ? active.error.code : null,
      errorMessage: active.error ? active.error.message : null,
      playbackRate: active.playbackRate,
      volume: active.volume,
      muted: active.muted,
      contexts: ((window as any).__audioContexts ?? []).map(
        (ctx: AudioContext) => `${ctx.state}@${ctx.currentTime.toFixed(2)}`,
      ),
    }
  })
}

test('vault track reaches real playback progress, not just a network request', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('analytics_consent', 'granted')
    // Track every AudioContext the app creates so a stalled media element can be
    // attributed to a suspended graph rather than a network/codec problem.
    const Native = window.AudioContext || (window as any).webkitAudioContext
    if (!Native) return
    const contexts: AudioContext[] = []
    ;(window as any).__audioContexts = contexts
    const Patched = function (this: unknown, ...args: unknown[]) {
      const ctx = new (Native as any)(...args)
      contexts.push(ctx)
      return ctx
    } as unknown as typeof AudioContext
    Patched.prototype = Native.prototype
    window.AudioContext = Patched
    ;(window as any).webkitAudioContext = Patched

    const graphLog: string[] = []
    ;(window as any).__graphLog = graphLog
    const name = (node: unknown) =>
      node && typeof node === 'object' ? (node as object).constructor.name : String(node)
    const origConnect = AudioNode.prototype.connect
    const origDisconnect = AudioNode.prototype.disconnect
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      graphLog.push(`connect ${name(this)} -> ${name(args[0])}`)
      return (origConnect as any).apply(this, args)
    } as typeof AudioNode.prototype.connect
    AudioNode.prototype.disconnect = function (this: AudioNode, ...args: any[]) {
      graphLog.push(`disconnect ${name(this)}${args.length ? ` -> ${name(args[0])}` : ' (all)'}`)
      return (origDisconnect as any).apply(this, args)
    } as typeof AudioNode.prototype.disconnect
  })

  const mediaResponses: string[] = []
  const failedRequests: string[] = []

  page.on('response', (res) => {
    const url = res.url()
    if (url.includes('/api/audio/media/') || /r2\.cloudflarestorage\.com|\.r2\.dev/i.test(url)) {
      mediaResponses.push(`${res.status()} ${url}`)
    }
  })
  page.on('requestfailed', (req) => {
    if (req.resourceType() === 'media' || req.url().includes('/api/audio/')) {
      failedRequests.push(`${req.failure()?.errorText ?? 'failed'} ${req.url()}`)
    }
  })

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await unlockVault(page)
  await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
    timeout: 90_000,
  })
  await dismissConsent(page)

  await page.getByRole('button', { name: /^Songs$/i }).click({ force: true })
  const trackRow = page.getByRole('row', { name: /Dmn8r|FTP 2|One Of Those Nights/i }).first()
  await expect(trackRow).toBeVisible({ timeout: 60_000 })
  await trackRow.dblclick()

  let latest: AudioSnapshot | null = null
  try {
    await expect
      .poll(
        async () => {
          latest = await snapshotAudio(page)
          if (!latest) return 0
          if (latest.errorCode !== null) return -1
          return latest.paused ? 0 : latest.currentTime
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0.35)
  } catch (error) {
    // A stalled element is almost always a graph problem (a MediaElementSource
    // with no path to the destination), so surface the wiring with the failure.
    const graphLog = await page.evaluate(() => (window as any).__graphLog ?? [])
    await test.info().attach('audio-state', { body: JSON.stringify(latest, null, 2) })
    await test.info().attach('audio-graph', { body: (graphLog as string[]).join('\n') })
    throw error
  }

  const diagnostics = [
    `audio=${JSON.stringify(latest)}`,
    `media=${JSON.stringify(mediaResponses.slice(0, 6))}`,
    `failed=${JSON.stringify(failedRequests.slice(0, 6))}`,
  ].join('\n')

  expect(latest, diagnostics).not.toBeNull()
  expect(latest!.errorCode, `audio element reported an error\n${diagnostics}`).toBeNull()
  expect(latest!.readyState, `audio never buffered data\n${diagnostics}`).toBeGreaterThanOrEqual(2)
  expect(
    mediaResponses.some((entry) => entry.startsWith('200') || entry.startsWith('206')),
    `no successful media response\n${diagnostics}`,
  ).toBeTruthy()

  // Catalog stamps / waveform patches used to re-run the src+load effect and
  // restart the track. Keep the playhead moving through a metadata identity change.
  const t1 = latest!.currentTime
  const src1 = latest!.src
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('musicPlayerState')
    const parsed = raw ? (JSON.parse(raw) as { currentTrack?: { id?: string; title?: string } }) : null
    const id = parsed?.currentTrack?.id
    if (!id) return
    const ch = new BroadcastChannel('sergik:catalog-sync')
    ch.postMessage({
      id: `e2e-${Date.now()}`,
      at: Date.now(),
      entity: 'track',
      entityId: id,
      patch: { title: parsed?.currentTrack?.title || 'e2e-stamp' },
      source: 'remote',
    })
    ch.close()
  })
  await page.waitForTimeout(2200)
  const afterStamp = await snapshotAudio(page)
  expect(afterStamp, 'audio element disappeared after catalog stamp').not.toBeNull()
  expect(afterStamp!.errorCode, 'catalog stamp errored the element').toBeNull()
  expect(afterStamp!.paused, 'catalog stamp paused playback').toBe(false)
  expect(
    afterStamp!.currentTime,
    `playhead restarted after catalog stamp (was ${t1}, now ${afterStamp!.currentTime})`,
  ).toBeGreaterThan(t1 + 1.1)
  expect(afterStamp!.src.split('?')[0], 'catalog stamp reloaded a different src').toBe(
    src1.split('?')[0],
  )
})

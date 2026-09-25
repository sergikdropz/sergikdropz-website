import { test, expect, type Page } from '@playwright/test'
import { installVaultPlaybackPrefs, startVaultTrackFromLibrary } from './vault-playback-helpers'

test.describe.configure({ timeout: 180_000 })

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
  await installVaultPlaybackPrefs(page)
  await page.addInitScript(() => {
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

  await startVaultTrackFromLibrary(page)

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

test('library playback advances to the next queued track and stays playing', async ({ page }) => {
  await installVaultPlaybackPrefs(page)
  await startVaultTrackFromLibrary(page)

  type NowPlaying = {
    id: string | null
    isPlaying: boolean
    paused: boolean
    duration: number | null
  }
  const nowPlaying = () =>
    page.evaluate(() => {
      const e2e = (
        window as unknown as {
          __SERGIK_E2E__?: { nowPlaying?: () => NowPlaying | null }
        }
      ).__SERGIK_E2E__
      return e2e?.nowPlaying?.() ?? null
    })

  await expect.poll(async () => Boolean((await nowPlaying())?.id), { timeout: 30_000 }).toBe(true)
  await expect
    .poll(async () => {
      const np = await nowPlaying()
      return Boolean(np && np.duration && np.duration > 1 && np.isPlaying && !np.paused)
    }, { timeout: 30_000 })
    .toBe(true)

  await expect
    .poll(
      async () =>
        page.evaluate(() => window.localStorage.getItem('idjEnabled') !== '1'),
      { timeout: 10_000 },
    )
    .toBe(true)

  const before = await nowPlaying()
  await page.evaluate(() => {
    const e2e = (
      window as unknown as {
        __SERGIK_E2E__?: {
          seekLiveNearEnd?: () => boolean
          fireMediaEnded?: (deck: 'live' | 'idle') => void
        }
      }
    ).__SERGIK_E2E__
    if (!e2e?.seekLiveNearEnd?.()) return
    e2e.fireMediaEnded?.('live')
  })

  await expect
    .poll(async () => (await nowPlaying())?.id ?? '', { timeout: 30_000 })
    .not.toBe(before?.id ?? '')
  const after = await nowPlaying()
  expect(after?.isPlaying, 'library next-track should keep isPlaying true').toBe(true)
})

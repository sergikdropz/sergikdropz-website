import { runAdminBrowserAction } from '@/lib/ai/admin-browser'
import type { AdminBrowserActionName, AdminBrowserActor, AdminBrowserSnapshot } from '@/lib/ai/admin-browser-shared'

const ACTIONS = new Set<AdminBrowserActionName>([
  'status',
  'frame',
  'open',
  'navigate',
  'back',
  'reload',
  'click',
  'wheel',
  'pointer',
  'viewport',
  'zoom',
  'type',
  'press',
  'read',
  'drive',
  'distrokid_prefill',
  'distrokid_upload_assets',
  'distrokid_bank_import',
  'meta_earnings_pull',
  'soundcloud_prefill',
  'probe_fields',
  'inspect',
  'snapshot',
  'release',
])

type BrowserBody = {
  action?: string
  url?: string
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  phase?: 'move' | 'down' | 'up'
  viewWidth?: number
  viewHeight?: number
  viewportWidth?: number
  viewportHeight?: number
  zoom?: number
  text?: string
  target?: string
  key?: string
  youDrive?: boolean
  actor?: AdminBrowserActor
  chatSessionId?: string
  distrokidPacket?: Record<string, unknown>
  skipDistrokidAssets?: boolean
  soundcloudPacket?: Record<string, unknown>
  releaseId?: string
}

export async function runAdminBrowserHttp(raw: unknown): Promise<{
  snapshot: AdminBrowserSnapshot
  status: number
}> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as BrowserBody
  const action = body.action?.trim() ?? 'status'
  if (!ACTIONS.has(action as AdminBrowserActionName)) {
    return {
      status: 400,
      snapshot: {
        ok: false,
        enabled: true,
        running: false,
        youDrive: true,
        url: '',
        title: '',
        error: 'Unknown browser action',
        width: 960,
        height: 640,
      },
    }
  }

  const liveShot =
    action === 'frame' ||
    action === 'status' ||
    action === 'open' ||
    action === 'navigate' ||
    action === 'back' ||
    action === 'reload' ||
    action === 'viewport' ||
    action === 'zoom'
  let snapshot: AdminBrowserSnapshot
  try {
    snapshot = await runAdminBrowserAction({
      action: action as AdminBrowserActionName,
      url: body.url,
      x: typeof body.x === 'number' ? body.x : undefined,
      y: typeof body.y === 'number' ? body.y : undefined,
      deltaX: typeof body.deltaX === 'number' ? body.deltaX : undefined,
      deltaY: typeof body.deltaY === 'number' ? body.deltaY : undefined,
      phase: body.phase === 'down' || body.phase === 'up' || body.phase === 'move' ? body.phase : undefined,
      viewWidth: typeof body.viewWidth === 'number' ? body.viewWidth : undefined,
      viewHeight: typeof body.viewHeight === 'number' ? body.viewHeight : undefined,
      viewportWidth: typeof body.viewportWidth === 'number' ? body.viewportWidth : undefined,
      viewportHeight: typeof body.viewportHeight === 'number' ? body.viewportHeight : undefined,
      zoom: typeof body.zoom === 'number' ? body.zoom : undefined,
      text: typeof body.text === 'string' ? body.text : undefined,
      target: typeof body.target === 'string' ? body.target : undefined,
      key: typeof body.key === 'string' ? body.key : undefined,
      youDrive: body.youDrive,
      actor: body.actor === 'assistant' ? 'assistant' : 'user',
      chatSessionId: typeof body.chatSessionId === 'string' ? body.chatSessionId : undefined,
      includeImage: liveShot || action === 'read',
      distrokidPacket:
        body.distrokidPacket && typeof body.distrokidPacket === 'object' ? body.distrokidPacket : undefined,
      skipDistrokidAssets: body.skipDistrokidAssets === true,
      soundcloudPacket:
        body.soundcloudPacket && typeof body.soundcloudPacket === 'object' ? body.soundcloudPacket : undefined,
      releaseId: typeof body.releaseId === 'string' ? body.releaseId : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Browser action crashed'
    snapshot = {
      ok: false,
      enabled: true,
      running: false,
      youDrive: true,
      url: '',
      title: '',
      error: message,
      width: 960,
      height: 640,
    }
  }

  if (!snapshot.ok && !snapshot.error) {
    snapshot.error = 'Browser action failed.'
  }

  const status = snapshot.ok ? 200 : snapshot.enabled === false ? 503 : 400
  return { snapshot, status }
}

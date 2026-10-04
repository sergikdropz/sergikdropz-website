import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { runAdminBrowserAction } from '@/lib/ai/admin-browser'
import type { AdminBrowserActionName, AdminBrowserActor } from '@/lib/ai/admin-browser-shared'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
/** DistroKid fill downloads WAV masters + artwork; allow a longer serverless budget when hosted. */
export const maxDuration = 300

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
  'probe_fields',
  'inspect',
  'release',
])

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`admin-ai-browser:${session.user.id}`, 2400, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Browser rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
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
    key?: string
    youDrive?: boolean
    actor?: AdminBrowserActor
    chatSessionId?: string
    distrokidPacket?: Record<string, unknown>
    skipDistrokidAssets?: boolean
  }

  const action = body.action?.trim() ?? 'status'
  if (!ACTIONS.has(action as AdminBrowserActionName)) {
    return NextResponse.json({ error: 'Unknown browser action' }, { status: 400 })
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
  let snapshot
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
    key: typeof body.key === 'string' ? body.key : undefined,
    youDrive: body.youDrive,
    actor: body.actor === 'assistant' ? 'assistant' : 'user',
    chatSessionId: typeof body.chatSessionId === 'string' ? body.chatSessionId : undefined,
    // Prefill returns a long filled/skipped report — skip screenshot to keep the JSON small/stable.
    includeImage: liveShot || action === 'read',
    distrokidPacket:
      body.distrokidPacket && typeof body.distrokidPacket === 'object'
        ? body.distrokidPacket
        : undefined,
    skipDistrokidAssets: body.skipDistrokidAssets === true,
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
  return NextResponse.json(snapshot, { status })
}

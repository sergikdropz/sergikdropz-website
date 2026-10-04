import { croweCreativeCredits, croweCreativeListModels } from '@/lib/ai/crowe-creative-client'
import { crowelogicChatBlockReason, crowelogicOpenAiUrl, resolveCrowelogicEnv } from '@/lib/ai/crowelogic-env'
import {
  ollinProDevModeStatus,
  ollinProHarnessCatalog,
  ollinProHarnessProbe,
  ollinProKnowledgeSearch,
  ollinProPing,
  resolveOllinProEnv,
} from '@/lib/ai/ollin-pro-api-client'
import { fetchReleaseStudioSnapshot } from '@/lib/studio/release-snapshot'
import { copyIntelHasSignal, type CopyIntelCard } from '@/lib/studio/copy-intelligence'

export type IntelligenceHarnessMode =
  | 'stack'
  | 'ping'
  | 'catalog'
  | 'probe'
  | 'knowledge'
  | 'dev_mode'

export type IntelligenceHarnessParams = {
  mode?: IntelligenceHarnessMode
  query?: string
  limit?: number
  k?: number
  full?: boolean
  withKnowledge?: boolean
  releaseId?: string
}

const DEFAULT_PROBE_QUERY =
  'SERGIK Sonic DNA unified intelligence Release Studio OlliN Pro harness Crowe Logic'

function normalizeMode(raw: unknown): IntelligenceHarnessMode {
  const m = String(raw || 'stack').toLowerCase().trim()
  if (
    m === 'ping' ||
    m === 'catalog' ||
    m === 'probe' ||
    m === 'knowledge' ||
    m === 'dev_mode' ||
    m === 'stack'
  ) {
    return m
  }
  return 'stack'
}

async function probeCroweLogicGateway() {
  const env = resolveCrowelogicEnv()
  if (!env.configured) {
    return {
      configured: false,
      activation: env.activation,
      reachable: false,
      baseUrl: env.baseUrl,
      model: env.model,
      keySource: env.keySource,
      modelCount: 0,
      error: crowelogicChatBlockReason(env),
    }
  }

  const url = crowelogicOpenAiUrl(env.baseUrl, 'models')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (env.apiKey) headers.Authorization = `Bearer ${env.apiKey}`

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) })
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> }
    const ids = Array.isArray(json.data) ? json.data.map((row) => row.id).filter(Boolean) : []
    return {
      configured: true,
      activation: env.activation,
      reachable: res.ok,
      baseUrl: env.baseUrl,
      model: env.model,
      keySource: env.keySource,
      modelCount: ids.length,
      sampleModels: ids.slice(0, 8),
      status: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      configured: true,
      activation: env.activation,
      reachable: false,
      baseUrl: env.baseUrl,
      model: env.model,
      keySource: env.keySource,
      modelCount: 0,
      error: err instanceof Error ? err.message : 'Crowe gateway unreachable',
    }
  }
}

function summarizeSonicDnaUnified(releaseId: string, tracks: Array<Record<string, unknown>>) {
  let unified = 0
  let withSignal = 0
  const rows = tracks.map((track) => {
    const title = String(track.title || 'Untitled').trim()
    const intel =
      track.copy_intel && typeof track.copy_intel === 'object'
        ? (track.copy_intel as CopyIntelCard)
        : null
    const isUnified = Boolean(intel?.unified)
    const hasSignal = copyIntelHasSignal(intel)
    if (isUnified) unified += 1
    if (hasSignal) withSignal += 1
    return {
      title,
      unified: isUnified,
      hasSignal,
      groove: intel?.groove || '',
    }
  })
  return {
    releaseId,
    trackCount: tracks.length,
    unifiedIntelligenceTracks: unified,
    copyIntelSignalTracks: withSignal,
    tracks: rows,
    note:
      unified === tracks.length && tracks.length > 0
        ? 'All catalog tracks expose compiled unified Sonic DNA intelligence.'
        : unified > 0
          ? 'Partial unified Sonic DNA — polish missing tracks in Music Vault / Sonic DNA review.'
          : 'No unified Sonic DNA cards on tracks — run Sonic DNA compile/sync before polymath copy.',
  }
}

export async function runIntelligenceHarness(params: IntelligenceHarnessParams) {
  const mode = normalizeMode(params.mode)
  const query = (params.query || '').trim() || DEFAULT_PROBE_QUERY
  const limit = Number.isFinite(params.limit) && (params.limit as number) > 0 ? (params.limit as number) : 8
  const k = Number.isFinite(params.k) && (params.k as number) > 0 ? (params.k as number) : 8
  const full = params.full === true
  const withKnowledge = params.withKnowledge !== false
  const releaseId = String(params.releaseId || '').trim()

  const ollinEnv = resolveOllinProEnv()

  if (mode === 'ping') {
    const ping = await ollinProPing()
    return { mode, ollinEnv, ollin: ping }
  }

  if (mode === 'catalog') {
    const catalog = await ollinProHarnessCatalog(full)
    return { mode, ollinEnv, catalog }
  }

  if (mode === 'probe') {
    const probe = await ollinProHarnessProbe(query, limit, withKnowledge)
    return { mode, ollinEnv, query, probe }
  }

  if (mode === 'knowledge') {
    const knowledge = await ollinProKnowledgeSearch(query, k)
    return { mode, ollinEnv, query, knowledge }
  }

  if (mode === 'dev_mode') {
    const devMode = await ollinProDevModeStatus()
    return { mode, ollinEnv, devMode }
  }

  // stack — connectivity + default harness probe + optional release Sonic DNA
  const [ping, probe, crowe, devMode, croweModels, croweCredits] = await Promise.all([
    ollinProPing(),
    ollinProHarnessProbe(query, Math.min(limit, 6), withKnowledge),
    probeCroweLogicGateway(),
    ollinProDevModeStatus(),
    croweCreativeListModels(),
    croweCreativeCredits(),
  ])

  let sonicDna: ReturnType<typeof summarizeSonicDnaUnified> | null = null
  if (releaseId) {
    try {
      const snapshot = await fetchReleaseStudioSnapshot(releaseId)
      sonicDna = summarizeSonicDnaUnified(releaseId, snapshot.tracks)
    } catch (err) {
      sonicDna = {
        releaseId,
        trackCount: 0,
        unifiedIntelligenceTracks: 0,
        copyIntelSignalTracks: 0,
        tracks: [],
        note: err instanceof Error ? err.message : 'Failed to load release for Sonic DNA summary',
      }
    }
  }

  const ollinReachable = ping.ok
  const harnessReady = probe.ok
  const croweReady = crowe.configured && crowe.reachable
  const croweCreativeReady = croweModels.ok

  return {
    mode: 'stack' as const,
    generatedAt: new Date().toISOString(),
    query,
    ollinEnv,
    connectivity: {
      ollinProApi: ollinReachable,
      ollinHarnessProbe: harnessReady,
      croweLogicGateway: croweReady,
      croweConfigured: crowe.configured,
      croweCreativeApi: croweCreativeReady,
      devModeApi: devMode.ok,
      summary: [
        ollinReachable ? 'OlliN Pro API reachable' : 'OlliN Pro API offline — start AiBLETON/OlliN Pro on AIBLETON_API_BASE',
        harnessReady ? 'Harness probe OK' : 'Harness probe failed (API down or query error)',
        crowe.activation === 'pending_pro_linkage'
          ? 'CroweLM credential stored; Pro gateway not activated'
          : crowe.configured
            ? croweReady
              ? `Crowe Logic gateway OK (${crowe.modelCount} models)`
              : 'Crowe Logic key set but gateway unreachable'
            : 'CroweLM chat not configured (customer credential missing)',
        croweCreativeReady
          ? 'Crowe Creative media API OK'
          : 'Crowe Creative offline or key missing (CROWE_API_KEY)',
        devMode.ok ? 'Dev Mode endpoint reachable' : 'Dev Mode endpoint unavailable',
      ].join(' · '),
    },
    ollin: { ping, probe, devMode },
    crowe,
    croweCreative: {
      models: croweModels.ok ? croweModels.data : { error: croweModels.error },
      credits: croweCredits.ok ? croweCredits.data : { error: croweCredits.error },
    },
    sonicDna,
    hints: [
      'Unified SergikAI intelligence lives in OlliN Pro harness + local SergikAI chat; Sonic DNA unified cards live on catalog tracks (copy_intel.unified).',
      'Use mode=probe or mode=knowledge for deeper RAG; pass releaseId on stack for Release Studio Sonic DNA roll-up.',
      'Admin AI routes to CroweLM only when the customer credential is active: local bridge, or hosted gateway after CROWELOGIC_PRO_LINKED. Usage on the hosted gateway is metered against the existing Pro allowance. Ollama sergikai-harness is configured in OlliN Pro, not this Next server.',
    ],
  }
}

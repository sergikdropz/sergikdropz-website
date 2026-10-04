'use client'

import { useCallback, useState } from 'react'
import { sameOriginApiUrl } from '@/lib/same-origin-api'

type CroweStatus = {
  configured: boolean
  credentialPresent?: boolean
  activation?: 'off' | 'local_bridge' | 'pending_pro_linkage' | 'pro_gateway'
  blockReason?: string | null
  baseUrl: string
  baseSource: string | null
  keySource: string | null
  model: string
  models?: { status: string; message?: string; modelIds?: string[] }
  chatProbe?: { ok: boolean; message: string } | null
  setup?: { envExample?: string[]; notes?: string[] }
}

export function CroweLogicSetupPanel() {
  const [status, setStatus] = useState<CroweStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const probe = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(sameOriginApiUrl('/api/admin/ai/crowelogic'), { credentials: 'same-origin' })
      const data = (await res.json().catch(() => ({}))) as CroweStatus & { error?: string }
      if (!res.ok) {
        setError(data.error || 'Probe failed')
        setStatus(null)
        return
      }
      setStatus(data)
    } catch {
      setError('Could not reach Crowe Logic probe')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="mb-4 rounded-lg border border-violet-900/40 bg-violet-950/20 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-violet-200">Crowe Logic / CroweLM</h3>
          <p className="text-xs text-gray-400">
            Server-side OpenAI-compatible chat on the existing Crowe ID. Usage on the hosted gateway
            counts against the Pro allowance. The customer credential stays in server env.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void probe()}
          disabled={loading}
          className="rounded bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {loading ? 'Testing…' : 'Test connection'}
        </button>
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {status && (
        <div className="space-y-2 text-xs text-gray-300">
          <p>
            Chat:{' '}
            <span className={status.configured ? 'text-emerald-400' : 'text-amber-400'}>
              {status.activation === 'pending_pro_linkage'
                ? `credential set (${status.keySource}); waiting on Pro linkage`
                : status.configured
                  ? `on (${status.activation}, ${status.keySource})`
                  : 'off'}
            </span>
            {' · '}
            Bridge: <span className="font-mono text-gray-400">{status.baseUrl}</span>
            {status.baseSource ? (
              <span className="text-gray-500"> ({status.baseSource})</span>
            ) : null}
            {' · '}
            Model: <span className="font-mono text-gray-400">{status.model}</span>
          </p>
          {status.blockReason ? <p className="text-amber-400/90">{status.blockReason}</p> : null}
          {status.models?.message ? (
            <p className={status.models.status === 'ok' ? 'text-emerald-400/90' : 'text-amber-400/90'}>
              Models: {status.models.message}
            </p>
          ) : null}
          {status.chatProbe ? (
            <p className={status.chatProbe.ok ? 'text-emerald-400/90' : 'text-red-400/90'}>
              Chat probe: {status.chatProbe.message}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-3 rounded border border-gray-800 bg-black/40 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Add to web/.env.local
        </p>
        <pre className="overflow-x-auto text-[11px] leading-relaxed text-gray-400">
{`# Customer credential for the existing Crowe ID (server only)
CROWELOGIC_API_KEY=
CROWELOGIC_MODEL=auto

# Local bridge (not the Pro bill)
CROWELOGIC_BASE_URL=http://127.0.0.1:8011

# Hosted gateway — set only after Crowe confirms Pro linkage and the usage cap
# CROWELOGIC_BASE_URL=https://gateway.example/v1
# CROWELOGIC_PRO_LINKED=1`}
        </pre>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-gray-500">
          <li>No second Crowe account. Do not put a password in env.</li>
          <li>Hosted chat stays off until Crowe confirms the Pro link. Then set CROWELOGIC_PRO_LINKED=1.</li>
          <li>CROWE_API_KEY is Crowe Creative only. It does not enable this chat.</li>
          <li>Restart the dev server after editing env, then test the connection.</li>
        </ul>
      </div>
    </div>
  )
}

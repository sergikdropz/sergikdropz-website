'use client'

import { useCallback, useState } from 'react'
import { sameOriginApiUrl } from '@/lib/same-origin-api'

type CroweStatus = {
  configured: boolean
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
            OpenAI-compatible gateway for admin assistant and Sonic DNA. Keys are read from env only.
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
            Key:{' '}
            <span className={status.configured ? 'text-emerald-400' : 'text-amber-400'}>
              {status.configured ? `set (${status.keySource})` : 'missing'}
            </span>
            {' · '}
            Bridge: <span className="font-mono text-gray-400">{status.baseUrl}</span>
            {status.baseSource ? (
              <span className="text-gray-500"> ({status.baseSource})</span>
            ) : null}
            {' · '}
            Model: <span className="font-mono text-gray-400">{status.model}</span>
          </p>
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
{`# Local Foundry bridge (Crowe Terminal default)
CROWELOGIC_BASE_URL=http://127.0.0.1:8011
CROWELOGIC_API_KEY=your-crowe-logic-key
CROWELOGIC_MODEL=auto

# Aliases also work (OlliN Pro → Providers):
# CROWE_API_KEY=...
# CROWE_LOGIC_URL=...`}
        </pre>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-gray-500">
          <li>Local: start Crowe Terminal or Foundry bridge on port 8011.</li>
          <li>Hosted: paste your Crowe Logic key from OlliN Pro and set the gateway URL.</li>
          <li>Restart dev server after editing env, then click Test connection.</li>
        </ul>
      </div>
    </div>
  )
}

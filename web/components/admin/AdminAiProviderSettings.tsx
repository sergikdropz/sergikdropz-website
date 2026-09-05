'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminAiRoutingPanel } from '@/components/admin/AdminAiRoutingPanel'
import { CroweLogicSetupPanel } from '@/components/admin/CroweLogicSetupPanel'
import { sameOriginApiUrl } from '@/lib/same-origin-api'

type ProviderId = 'anthropic' | 'openai' | 'ollama' | 'crowelogic'

type SettingsPayload = {
  chat?: {
    configuredProvider?: string | null
    effectiveDefault?: ProviderId | null
    providers?: Array<{ id: string; configured: boolean }>
    models?: Record<string, string>
    apiKeysPresent?: Record<string, boolean>
    endpoints?: {
      openaiBaseUrl?: string
      ollamaBaseUrl?: string
      crowelogicBaseUrl?: string
      crowelogicBaseSource?: string | null
      crowelogicKeySource?: string | null
    }
  }
  preferences?: {
    autoRouterMode: 'smart' | 'env_order'
    envRouterHint: string | null
    assistantDefaultLlm: 'auto' | ProviderId
    sonicDnaLlm?: 'auto' | ProviderId
    modelOverrides: Record<ProviderId, string | null>
    resolvedModels: Record<ProviderId, string>
  }
  note?: string
}

export default function AdminAiProviderSettings() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(sameOriginApiUrl('/api/admin/ai/settings'), { credentials: 'same-origin' })
      const data = (await res.json().catch(() => ({}))) as SettingsPayload & { error?: string }
      if (!res.ok) {
        setError(data.error || 'Failed to load AI settings')
        setPayload(null)
        return
      }
      setError(null)
      setPayload(data)
    } catch {
      setError('Failed to load AI settings')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const chat = payload?.chat
  const providers = chat?.providers || []
  const keys = chat?.apiKeysPresent || {}

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-2">AI providers</h2>
      <p className="mb-4 text-sm text-gray-400">
        Choose which LLM the floating admin assistant and Sonic DNA review use. API keys stay in{' '}
        <span className="font-mono text-gray-500">web/.env.local</span> — this page stores routing and model
        overrides.
      </p>

      {loading && <p className="text-sm text-gray-400">Loading AI settings…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && chat && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['anthropic', 'openai', 'ollama', 'crowelogic'] as ProviderId[]).map((id) => {
              const configured = Boolean(providers.find((p) => p.id === id)?.configured)
              const keyOn = id === 'ollama' ? true : Boolean(keys[id])
              return (
                <div key={id} className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                  <p className="font-mono text-sm text-white">{id}</p>
                  <p className={`text-xs ${configured ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {configured ? 'Ready' : 'Not configured'}
                    {id !== 'ollama' ? (keyOn ? ' · key set' : ' · no key') : ''}
                  </p>
                </div>
              )
            })}
          </div>
          <CroweLogicSetupPanel />
          <p className="mb-2 text-xs text-gray-500">
            Env default: <span className="font-mono text-gray-400">{chat.configuredProvider || 'unset'}</span>
            {' · '}
            Effective: <span className="font-mono text-gray-400">{chat.effectiveDefault || 'none'}</span>
            {chat.endpoints?.ollamaBaseUrl ? (
              <>
                {' · '}
                Ollama <span className="font-mono text-gray-400">{chat.endpoints.ollamaBaseUrl}</span>
              </>
            ) : null}
            {chat.endpoints?.crowelogicBaseUrl ? (
              <>
                {' · '}
                Crowe <span className="font-mono text-gray-400">{chat.endpoints.crowelogicBaseUrl}</span>
                {chat.endpoints.crowelogicKeySource ? (
                  <span className="text-gray-600"> ({chat.endpoints.crowelogicKeySource})</span>
                ) : null}
              </>
            ) : null}
          </p>
          {payload.preferences ? (
            <AdminAiRoutingPanel
              chat={{
                models: chat.models || {},
                providers: chat.providers || [],
              }}
              preferences={{
                ...payload.preferences,
                sonicDnaLlm: payload.preferences.sonicDnaLlm ?? 'auto',
              }}
              onSaved={() => void load()}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

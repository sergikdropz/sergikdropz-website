'use client'

import { useCallback, useEffect, useState } from 'react'
import { ADMIN_AI_SMART_MODEL_OVERRIDE } from '@/lib/ai/admin-smart-model-picker'
import { sameOriginApiUrl } from '@/lib/same-origin-api'

type ProviderId = 'anthropic' | 'openai' | 'ollama' | 'crowelogic'

type ChatSummary = {
  models: Record<string, string>
  providers: Array<{ id: string; configured: boolean }>
}

type PreferencesSummary = {
  autoRouterMode: 'smart' | 'env_order'
  envRouterHint: string | null
  assistantDefaultLlm: 'auto' | ProviderId
  sonicDnaLlm?: 'auto' | ProviderId
  modelOverrides: Record<ProviderId, string | null>
  resolvedModels: Record<ProviderId, string>
}

type PreviewResponse = {
  messageSample: string
  inferredSkill: { id: string; name: string; riskTier: string }
  smart: { providerOrder: ProviderId[]; signals: Array<{ label: string; detail?: string }> }
  envOrderPreview: { providerOrder: ProviderId[]; fallback: string | null }
  smartModelPicks?: Record<ProviderId, string>
  providersConfigured: Array<{ id: string; configured: boolean }>
}

type Props = {
  chat: ChatSummary
  preferences: PreferencesSummary
  onSaved: () => void
}

const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'ollama', 'crowelogic']

const CUSTOM_MODEL_VALUE = '__custom__'

function uniqSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((s) => s.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  )
}

function compactOverrideLabel(
  value: string,
  envDefault: string
): { tag: string; title: string } {
  const t = value.trim()
  if (!t) return { tag: 'env', title: `Env default: ${envDefault}` }
  if (t === ADMIN_AI_SMART_MODEL_OVERRIDE) return { tag: 'smart', title: 'Auto-smart per message' }
  const short = t.length > 22 ? `${t.slice(0, 20)}…` : t
  return { tag: short, title: t }
}

function catalogHealthBadge(
  source: string | undefined,
  status: string | undefined
): { label: string; className: string; title: string } {
  if (status === 'ok' && source === 'live') {
    return { label: 'Live', className: 'bg-emerald-950/90 text-emerald-300', title: 'Catalog from provider API' }
  }
  if (status === 'degraded' || (source === 'static' && status !== 'error')) {
    return { label: 'Defaults', className: 'bg-amber-950/80 text-amber-300/95', title: 'Static suggestions — configure API key or start local service' }
  }
  if (status === 'error') {
    return { label: 'Error', className: 'bg-red-950/80 text-red-300/90', title: 'Connection or response failed' }
  }
  if (source === 'live' && status !== 'ok') {
    return { label: 'Live*', className: 'bg-sky-950/70 text-sky-200/90', title: 'Partial' }
  }
  return { label: '—', className: 'bg-gray-900/80 text-gray-500', title: 'Unknown' }
}

function ProviderModelCard({
  providerId,
  configured,
  envDefault,
  effectiveResolved,
  catalog,
  catalogMessage,
  catalogSource,
  catalogStatus,
  envDefaultModelId,
  envDefaultPresent,
  value,
  onModelChange,
}: {
  providerId: ProviderId
  configured: boolean
  envDefault: string
  effectiveResolved: string
  catalog: string[]
  catalogMessage?: string
  catalogSource?: string
  catalogStatus?: 'ok' | 'degraded' | 'error'
  envDefaultModelId?: string
  envDefaultPresent?: boolean
  value: string
  onModelChange: (next: string) => void
}) {
  const trimmed = value.trim()
  const baseOptions = uniqSortedStrings([
    ...catalog,
    ...(effectiveResolved !== envDefault ? [effectiveResolved] : []),
    ...(trimmed &&
    trimmed !== envDefault &&
    !catalog.includes(trimmed) &&
    trimmed !== effectiveResolved
      ? [trimmed]
      : []),
  ])
  const selectValue =
    trimmed === ''
      ? ''
      : trimmed === ADMIN_AI_SMART_MODEL_OVERRIDE
        ? ADMIN_AI_SMART_MODEL_OVERRIDE
        : baseOptions.includes(trimmed)
          ? trimmed
          : CUSTOM_MODEL_VALUE

  const { tag: summaryTag, title: summaryTitle } = compactOverrideLabel(value, envDefault)
  const health = catalogHealthBadge(catalogSource, catalogStatus)
  const showOllamaEnvMismatch =
    providerId === 'ollama' &&
    typeof envDefaultModelId === 'string' &&
    envDefaultPresent === false &&
    catalogStatus === 'ok' &&
    catalogSource === 'live' &&
    catalog.length > 0
  const installedCount = catalogStatus === 'ok' && catalogSource === 'live' ? catalog.length : null

  return (
    <div className="flex flex-col rounded border border-gray-800 bg-black/35 p-1.5">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="font-mono text-[11px] text-gray-200">{providerId}</span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
          <span
            className={`rounded px-1 py-px text-[9px] font-semibold uppercase ${health.className}`}
            title={health.title}
          >
            {health.label}
            {installedCount != null && installedCount > 0 ? ` ${installedCount}` : ''}
          </span>
          <span
            className={`rounded px-1 py-px text-[9px] font-semibold uppercase ${
              configured ? 'bg-emerald-950/80 text-emerald-400' : 'bg-amber-950/60 text-amber-400'
            }`}
            title={configured ? 'Credentials or host configured' : 'Not configured (API key / Ollama host)'}
          >
            {configured ? 'key' : 'off'}
          </span>
          <span className="max-w-[4.5rem] truncate font-mono text-[9px] text-gray-500" title={summaryTitle}>
            {summaryTag}
          </span>
        </div>
      </div>
      <select
        aria-label={`Model override for ${providerId}`}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') onModelChange('')
          else if (v === ADMIN_AI_SMART_MODEL_OVERRIDE) onModelChange(ADMIN_AI_SMART_MODEL_OVERRIDE)
          else if (v === CUSTOM_MODEL_VALUE)
            onModelChange(trimmed && !baseOptions.includes(trimmed) ? value : '')
          else onModelChange(v)
        }}
        className="w-full min-w-0 rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-100 font-mono"
      >
        <option value="">Env default ({envDefault})</option>
        <option value={ADMIN_AI_SMART_MODEL_OVERRIDE}>Auto-smart</option>
        {baseOptions.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
        <option value={CUSTOM_MODEL_VALUE}>Custom…</option>
      </select>
      {selectValue === CUSTOM_MODEL_VALUE ? (
        <input
          type="text"
          aria-label={`Custom model id for ${providerId}`}
          value={value}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="model id"
          className="mt-1 w-full min-w-0 rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-white font-mono"
        />
      ) : null}
      <div className="mt-1 space-y-0.5 text-[9px] leading-snug text-gray-600">
        <p className="truncate" title={envDefault}>
          <span className="text-gray-500">env</span> {envDefault}
        </p>
        {trimmed === ADMIN_AI_SMART_MODEL_OVERRIDE ? (
          <p className="text-violet-400/90">Smart: per-request model.</p>
        ) : null}
        {effectiveResolved !== envDefault && trimmed !== ADMIN_AI_SMART_MODEL_OVERRIDE ? (
          <p className="truncate text-emerald-600/90" title={effectiveResolved}>
            eff. {effectiveResolved}
          </p>
        ) : null}
        {catalogMessage ? (
          <p
            className={`line-clamp-3 ${
              catalogStatus === 'ok' ? 'text-emerald-600/90' : catalogStatus === 'error' ? 'text-red-400/90' : 'text-amber-600/85'
            }`}
            title={catalogMessage}
          >
            {catalogMessage}
          </p>
        ) : null}
        {showOllamaEnvMismatch ? (
          <p className="text-red-400/90" title="OLLAMA_MODEL in env is not in ollama list /api/tags">
            Env OLLAMA_MODEL <span className="font-mono">{envDefaultModelId}</span> not installed
          </p>
        ) : null}
        {providerId === 'ollama' && envDefaultPresent === true && envDefaultModelId ? (
          <p className="text-emerald-500/80">
            <span className="font-mono" title="Matches local install">
              {envDefaultModelId}
            </span>{' '}
            installed
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function AdminAiRoutingPanel({ chat, preferences, onSaved }: Props) {
  const [routerMode, setRouterMode] = useState(preferences.autoRouterMode)
  const [assistantDefault, setAssistantDefault] = useState(preferences.assistantDefaultLlm)
  const [sonicDnaLlm, setSonicDnaLlm] = useState(preferences.sonicDnaLlm ?? 'auto')
  const [models, setModels] = useState<Record<ProviderId, string>>({
    anthropic: preferences.modelOverrides.anthropic ?? '',
    openai: preferences.modelOverrides.openai ?? '',
    ollama: preferences.modelOverrides.ollama ?? '',
    crowelogic: preferences.modelOverrides.crowelogic ?? '',
  })
  const [previewInput, setPreviewInput] = useState('/plan Launch Q2 single with pre-save and Meta ads')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [modelCatalog, setModelCatalog] = useState<Record<ProviderId, string[]>>({
    anthropic: [],
    openai: [],
    ollama: [],
    crowelogic: [],
  })
  const [modelCatalogMeta, setModelCatalogMeta] = useState<
    Record<
      ProviderId,
      {
        source?: string
        message?: string
        status?: 'ok' | 'degraded' | 'error'
        envDefaultModelId?: string
        envDefaultPresent?: boolean
      }
    >
  >({
    anthropic: {},
    openai: {},
    ollama: {},
    crowelogic: {},
  })
  const [modelCatalogLoading, setModelCatalogLoading] = useState(true)
  const [catalogRefreshedAt, setCatalogRefreshedAt] = useState<number | null>(null)

  const loadModelCatalogs = useCallback(async (refresh = false) => {
    setModelCatalogLoading(true)
    const next: Record<ProviderId, string[]> = {
      anthropic: [],
      openai: [],
      ollama: [],
      crowelogic: [],
    }
    const meta: Record<
      ProviderId,
      {
        source?: string
        message?: string
        status?: 'ok' | 'degraded' | 'error'
        envDefaultModelId?: string
        envDefaultPresent?: boolean
      }
    > = {
      anthropic: {},
      openai: {},
      ollama: {},
      crowelogic: {},
    }
    await Promise.all(
      PROVIDERS.map(async (p) => {
        try {
          const qs = new URLSearchParams({ provider: p })
          if (refresh) qs.set('refresh', '1')
          const res = await fetch(sameOriginApiUrl(`/api/admin/ai/models?${qs.toString()}`), {
            credentials: 'same-origin',
            cache: 'no-store',
          })
          const body = (await res.json()) as {
            modelIds?: string[]
            source?: string
            message?: string
            status?: 'ok' | 'degraded' | 'error'
            envDefaultModelId?: string
            envDefaultPresent?: boolean
          }
          next[p] = Array.isArray(body.modelIds) ? body.modelIds : []
          meta[p] = {
            source: body.source,
            message: body.message,
            status: body.status,
            envDefaultModelId: body.envDefaultModelId,
            envDefaultPresent: body.envDefaultPresent,
          }
        } catch {
          next[p] = []
          meta[p] = { message: 'Failed to load model list', status: 'error' }
        }
      }),
    )
    setModelCatalog(next)
    setModelCatalogMeta(meta)
    setCatalogRefreshedAt(Date.now())
    setModelCatalogLoading(false)
  }, [])

  useEffect(() => {
    void loadModelCatalogs(false)
  }, [loadModelCatalogs])

  useEffect(() => {
    setRouterMode(preferences.autoRouterMode)
    setAssistantDefault(preferences.assistantDefaultLlm)
    setSonicDnaLlm(preferences.sonicDnaLlm ?? 'auto')
    setModels({
      anthropic: preferences.modelOverrides.anthropic ?? '',
      openai: preferences.modelOverrides.openai ?? '',
      ollama: preferences.modelOverrides.ollama ?? '',
      crowelogic: preferences.modelOverrides.crowelogic ?? '',
    })
  }, [preferences])

  const refreshModelCatalogs = useCallback(() => {
    void loadModelCatalogs(true)
  }, [loadModelCatalogs])

  const runPreview = useCallback(async () => {
    try {
      setPreviewLoading(true)
      const res = await fetch(sameOriginApiUrl('/api/admin/ai/router-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: previewInput }),
      })
      const data = (await res.json()) as PreviewResponse & { error?: string }
      if (res.ok) {
        setPreview(data)
      } else {
        setPreview(null)
        setSaveMessage(data.error || 'Preview failed')
      }
    } catch {
      setPreview(null)
      setSaveMessage('Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }, [previewInput])

  const save = useCallback(async () => {
    setSaveMessage(null)
    try {
      setSaving(true)
      const res = await fetch(sameOriginApiUrl('/api/admin/ai/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          preferences: {
            autoRouterMode: routerMode,
            assistantDefaultLlm: assistantDefault,
            sonicDnaLlm,
            models: {
              anthropic: models.anthropic,
              openai: models.openai,
              ollama: models.ollama,
              crowelogic: models.crowelogic,
            },
          },
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSaveMessage(body.error || 'Save failed')
        return
      }
      setSaveMessage('Saved.')
      onSaved()
    } catch {
      setSaveMessage('Save failed')
    } finally {
      setSaving(false)
    }
  }, [assistantDefault, models, onSaved, routerMode, sonicDnaLlm])

  return (
    <div className="space-y-4 border-t border-gray-800 pt-5 mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-white">Routing &amp; models</h3>
        <p className="max-w-prose text-right text-[10px] text-gray-500">
          Admin assistant and Sonic DNA review · secrets stay in env
        </p>
      </div>

      {/* Row 1: controls side-by-side, wrap on narrow */}
      <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:flex-wrap min-[520px]:items-end min-[520px]:gap-x-3 min-[520px]:gap-y-2 xl:flex-nowrap">
        <label className="flex min-w-0 flex-1 basis-[11rem] flex-col gap-0.5 text-[10px] uppercase tracking-wide text-gray-500">
          Assistant LLM
          <select
            aria-label="Default LLM for floating Admin AI assistant"
            value={assistantDefault}
            onChange={(e) => setAssistantDefault(e.target.value as typeof assistantDefault)}
            className="w-full min-w-0 rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-white"
          >
            <option value="auto">Auto</option>
            {PROVIDERS.map((id) => {
              const ok = id === 'ollama' || Boolean(chat.providers.find((p) => p.id === id)?.configured)
              return (
                <option key={id} value={id} disabled={!ok}>
                  {id}
                  {!ok ? ' (off)' : ''}
                </option>
              )
            })}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 basis-[11rem] flex-col gap-0.5 text-[10px] uppercase tracking-wide text-gray-500">
          Sonic DNA LLM
          <select
            aria-label="LLM for Sonic DNA question, challenge, and regenerate"
            value={sonicDnaLlm}
            onChange={(e) => setSonicDnaLlm(e.target.value as typeof sonicDnaLlm)}
            className="w-full min-w-0 rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-white"
          >
            <option value="auto">Auto (assistant / env)</option>
            {PROVIDERS.map((id) => {
              const ok = id === 'ollama' || Boolean(chat.providers.find((p) => p.id === id)?.configured)
              return (
                <option key={id} value={id} disabled={!ok}>
                  {id}
                  {!ok ? ' (off)' : ''}
                </option>
              )
            })}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 basis-[12rem] flex-col gap-0.5 text-[10px] uppercase tracking-wide text-gray-500">
          Auto router
          <select
            aria-label="Auto router strategy when assistant LLM is set to Auto"
            value={routerMode}
            onChange={(e) => setRouterMode(e.target.value as 'smart' | 'env_order')}
            className="w-full min-w-0 rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-white"
          >
            <option value="smart">Smart</option>
            <option value="env_order">Env order</option>
          </select>
        </label>
        <div className="flex min-w-0 flex-1 basis-[10rem] flex-wrap items-center gap-2 sm:justify-end xl:ml-auto">
          <button
            type="button"
            aria-label="Set all provider model overrides to Auto smart"
            title="Auto-smart on all providers"
            onClick={() =>
              setModels({
                anthropic: ADMIN_AI_SMART_MODEL_OVERRIDE,
                openai: ADMIN_AI_SMART_MODEL_OVERRIDE,
                ollama: ADMIN_AI_SMART_MODEL_OVERRIDE,
                crowelogic: ADMIN_AI_SMART_MODEL_OVERRIDE,
              })
            }
            className="whitespace-nowrap rounded border border-violet-800/50 bg-violet-950/35 px-2 py-1 text-[10px] font-medium text-violet-200 hover:bg-violet-900/45"
          >
            Smart all
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="whitespace-nowrap rounded bg-purple-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {preferences.envRouterHint ? (
        <p className="text-[10px] text-gray-600">
          <span className="font-mono text-gray-500">ADMIN_AI_AUTO_ROUTER</span> fallback:{' '}
          <span className="text-amber-200/80">{preferences.envRouterHint}</span>
        </p>
      ) : null}

      {/* Model overrides: compact grid, one card per provider (always visible) */}
      <div className="rounded border border-gray-800 bg-black/25 p-2">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Model overrides</span>
            <button
              type="button"
              onClick={refreshModelCatalogs}
              disabled={modelCatalogLoading}
              className="rounded border border-gray-700 bg-gray-900/80 px-2 py-0.5 text-[10px] font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              title="Re-fetch model lists from each provider API"
            >
              {modelCatalogLoading ? 'Refreshing…' : 'Refresh models'}
            </button>
            {catalogRefreshedAt ? (
              <span className="text-[10px] text-gray-600" title={new Date(catalogRefreshedAt).toLocaleString()}>
                Updated {new Date(catalogRefreshedAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] text-gray-500" title="Live = API or Ollama /api/tags; green row when installed models match">
            {modelCatalogLoading ? 'Loading catalogs…' : 'Live = installed / API-backed · Defaults = static only'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 xs:grid-cols-2 min-[900px]:grid-cols-4">
          {PROVIDERS.map((id) => {
            const envDefault = chat.models[id] ?? preferences.resolvedModels[id]
            const configured = id === 'ollama' || Boolean(chat.providers.find((p) => p.id === id)?.configured)
            return (
              <ProviderModelCard
                key={id}
                providerId={id}
                configured={configured}
                envDefault={envDefault}
                effectiveResolved={preferences.resolvedModels[id]}
                catalog={modelCatalog[id]}
                catalogMessage={modelCatalogMeta[id]?.message}
                catalogSource={modelCatalogMeta[id]?.source}
                catalogStatus={modelCatalogMeta[id]?.status}
                envDefaultModelId={modelCatalogMeta[id]?.envDefaultModelId}
                envDefaultPresent={modelCatalogMeta[id]?.envDefaultPresent}
                value={models[id]}
                onModelChange={(next) => setModels((m) => ({ ...m, [id]: next }))}
              />
            )
          })}
        </div>
      </div>

      {/* Preview: compact, two columns when space */}
      <div className="rounded border border-violet-900/35 bg-violet-950/15 p-2">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">Router preview</span>
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={previewLoading}
            className="rounded bg-violet-700 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-600 disabled:opacity-50"
          >
            {previewLoading ? '…' : 'Run'}
          </button>
        </div>
        <textarea
          aria-label="Sample message to preview provider routing order"
          value={previewInput}
          onChange={(e) => setPreviewInput(e.target.value)}
          rows={2}
          className="mb-1.5 w-full rounded border border-gray-800 bg-gray-950/90 px-1.5 py-1 text-[11px] text-white font-mono"
        />
        {preview ? (
          <div className="grid grid-cols-1 gap-2 min-[640px]:grid-cols-2 text-[10px]">
            <div className="rounded border border-gray-800/90 bg-black/35 p-2">
              <p className="mb-1 font-semibold text-emerald-400/95">Smart</p>
              <ol className="list-decimal space-y-0.5 pl-4 font-mono text-gray-300">
                {preview.smart.providerOrder.map((p) => {
                  const ok = preview.providersConfigured.find((x) => x.id === p)?.configured
                  return (
                    <li key={p} className="truncate">
                      {p}
                      <span className={ok ? 'text-green-500/90' : 'text-amber-600/90'}>{ok ? ' · ready' : ' · off'}</span>
                    </li>
                  )
                })}
              </ol>
              {preview.smartModelPicks ? (
                <div className="mt-1.5 border-t border-gray-800/80 pt-1.5">
                  <p className="mb-0.5 text-[9px] font-medium text-emerald-500/90">Models (sample)</p>
                  <ul className="space-y-0.5 font-mono text-[9px] text-gray-500">
                    {PROVIDERS.map((p) => (
                      <li key={p} className="truncate" title={preview.smartModelPicks?.[p]}>
                        {p}: {preview.smartModelPicks?.[p] ?? '—'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="rounded border border-gray-800/90 bg-black/35 p-2">
              <p className="mb-1 font-semibold text-sky-400/95">Env order</p>
              <p className="mb-0.5 truncate text-gray-500">
                fb <span className="font-mono text-gray-400">{preview.envOrderPreview.fallback ?? '—'}</span>
              </p>
              <ol className="list-decimal space-y-0.5 pl-4 font-mono text-gray-300">
                {preview.envOrderPreview.providerOrder.map((p) => (
                  <li key={p} className="truncate">
                    {p}
                  </li>
                ))}
              </ol>
            </div>
            <div className="min-[640px]:col-span-2 rounded border border-gray-800/60 bg-black/25 p-1.5 text-[9px] text-gray-600">
              {preview.smart.signals.map((s, i) => (
                <span key={i} className="mr-2 inline-block max-w-full truncate" title={s.detail}>
                  <span className="text-gray-500">{s.label}:</span> {s.detail}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {saveMessage ? <p className="text-[11px] text-gray-500">{saveMessage}</p> : null}
    </div>
  )
}

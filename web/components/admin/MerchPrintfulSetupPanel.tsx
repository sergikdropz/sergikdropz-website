'use client'

import { useCallback, useEffect, useState } from 'react'
import { readStudioDockOpen, writeStudioDockOpen } from '@/lib/merch/studio-session'

export type PrintfulReadyStatus = {
  canPublish: boolean
  catalogSynced: boolean
  catalogStale?: boolean
  hasApiKey: boolean
  hasStoreId: boolean
  apiKeyValid: boolean
  apiError: string | null
  storeId: number | null
  storeMatch: { id: number; name: string; type: string } | null
  stores: Array<{ id: number; name: string; type: string }>
  templatesReachable: boolean | null
  publicArtOrigin: boolean
}

type Props = {
  status: PrintfulReadyStatus
  onRefresh: () => void | Promise<void>
}

function StepRow({
  done,
  label,
  children,
}: {
  done: boolean
  label: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex gap-3 text-sm">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          done ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-white/50'
        }`}
        aria-hidden
      >
        {done ? '✓' : '·'}
      </span>
      <div className="min-w-0 flex-1 space-y-1 text-amber-100/90">
        <p className={done ? 'text-white/75 line-through decoration-white/30' : ''}>{label}</p>
        {children}
      </div>
    </li>
  )
}

export default function MerchPrintfulSetupPanel({ status, onRefresh }: Props) {
  const [checking, setChecking] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(
      window.location.hash === '#printful-api' ? true : readStudioDockOpen('printful-api', false),
    )
  }, [])
  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    writeStudioDockOpen('printful-api', next)
  }

  const recheck = useCallback(async () => {
    setChecking(true)
    try {
      await Promise.resolve(onRefresh())
    } finally {
      setChecking(false)
    }
  }, [onRefresh])

  const allEnvReady = status.canPublish && status.publicArtOrigin

  if (allEnvReady && status.templatesReachable !== false) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/95">
        Printful is connected
        {status.storeMatch ? (
          <>
            {' '}
            — store <strong>{status.storeMatch.name}</strong> (ID {status.storeMatch.id})
          </>
        ) : null}
        . Put it out and fulfillment are enabled.
      </div>
    )
  }

  const readyCount = [
    status.catalogSynced,
    status.apiKeyValid,
    Boolean(status.storeMatch),
    status.publicArtOrigin,
  ].filter(Boolean).length

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
      <div className={`${open ? 'mb-3' : ''} flex flex-wrap items-center justify-between gap-2`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="printful-api-body"
          onClick={toggleOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-base font-medium text-amber-50">Finish Printful API setup</h3>
          <span className="text-xs text-amber-100/65">{readyCount}/4 ready</span>
          <span aria-hidden className={`text-amber-100/55 transition ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
        <button
          type="button"
          onClick={() => void recheck()}
          disabled={checking}
          className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs uppercase tracking-wide text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Re-check connection'}
        </button>
      </div>

      {open ? (
      <div id="printful-api-body">
      <ol className="space-y-3">
        <StepRow done={status.catalogSynced} label="Printful catalog loaded in admin">
          {!status.catalogSynced ? (
            <p className="text-xs text-amber-100/70">Open the catalog column and tap Sync (no API key required).</p>
          ) : null}
        </StepRow>

        <StepRow
          done={status.apiKeyValid}
          label="Create a Manual orders / API store and add PRINTFUL_API_KEY to web/.env.local"
        >
          <p className="text-xs text-amber-100/70">
            <a
              href="https://www.printful.com/dashboard/store"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-amber-50 hover:text-white"
            >
              Printful Stores
            </a>
            {' · '}
            <a
              href="https://www.printful.com/dashboard/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-amber-50 hover:text-white"
            >
              API token
            </a>
          </p>
          {!status.hasApiKey ? (
            <pre className="mt-1 overflow-x-auto rounded-lg bg-black/35 p-2 text-[11px] text-amber-50/90">
              {`PRINTFUL_API_KEY=your_private_token`}
            </pre>
          ) : null}
          {status.hasApiKey && !status.apiKeyValid && status.apiError ? (
            <p className="text-xs text-red-300/90">Token check failed: {status.apiError.slice(0, 240)}</p>
          ) : null}
        </StepRow>

        <StepRow done={Boolean(status.storeMatch)} label="Set PRINTFUL_STORE_ID to your API store (numeric id)">
          {!status.hasStoreId ? (
            <pre className="mt-1 overflow-x-auto rounded-lg bg-black/35 p-2 text-[11px] text-amber-50/90">
              {`PRINTFUL_STORE_ID=12345678`}
            </pre>
          ) : null}
          {status.hasStoreId && !status.storeMatch && status.apiKeyValid ? (
            <p className="text-xs text-red-300/90">
              Store ID {status.storeId} was not found on this token. Pick one from the list below.
            </p>
          ) : null}
          {status.stores.length > 0 ? (
            <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[320px] text-left text-[11px]">
                <thead className="bg-black/30 text-white/55">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Store</th>
                    <th className="px-2 py-1.5 font-medium">Type</th>
                    <th className="px-2 py-1.5 font-medium">PRINTFUL_STORE_ID</th>
                  </tr>
                </thead>
                <tbody>
                  {status.stores.map((store) => (
                    <tr key={store.id} className="border-t border-white/10">
                      <td className="px-2 py-1.5 text-white/85">{store.name}</td>
                      <td className="px-2 py-1.5 text-white/55">{store.type || '—'}</td>
                      <td className="px-2 py-1.5 font-mono text-amber-50">{store.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : status.apiKeyValid ? (
            <p className="text-xs text-amber-100/70">No stores returned — create a Manual orders / API store first.</p>
          ) : null}
        </StepRow>

        <StepRow
          done={status.publicArtOrigin}
          label="Production: set NEXT_PUBLIC_SITE_URL to public https (Printful fetches art from your site)"
        >
          {!status.publicArtOrigin ? (
            <p className="text-xs text-amber-100/70">
              Local dev can still design and save drafts. For Put it out with live mockups, use your deployed domain or a
              tunnel URL in <code className="text-amber-50">web/.env.local</code>, then restart{' '}
              <code className="text-amber-50">npm run dev:recover</code>.
            </p>
          ) : null}
        </StepRow>
      </ol>

      <p className="mt-4 text-xs text-amber-100/65">
        Full guide:{' '}
        <code className="text-amber-50">web/docs/admin/PRINTFUL_API_SETUP.md</code> — after editing env, restart the dev
        server and click Re-check connection.
      </p>
      </div>
      ) : null}
    </div>
  )
}

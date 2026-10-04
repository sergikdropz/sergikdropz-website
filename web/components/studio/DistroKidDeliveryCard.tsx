'use client'

import { useCallback, useEffect, useState } from 'react'
import { FaExternalLinkAlt } from 'react-icons/fa'
import { dispatchAdminAiBrowserHydrate } from '@/lib/admin-ai-client'
import { buildDistroKidBrowserHydrate } from '@/lib/ai/distrokid-browser-hydrate'
import AdminAiBrowserDock from '@/components/admin/AdminAiBrowserDock'

type WindowInfo = {
  kind: string
  label: string
  upload_by: string | null
  release_date: string | null
  days_until_street: number | null
}

type Packet = {
  ok: boolean
  blockers: string[]
  warnings: string[]
  upload_url: string
  my_music_url: string
  worksheet: string
  release: {
    previously_released: boolean
    artist: string
    label: string
    title: string
    language: string
    primary_genre: string
    secondary_genre: string
    release_date: string
    upc: string
    artwork_url?: string
    stores?: string[]
  }
  tracks: Array<{
    track_number: number
    title: string
    artist?: string
    featuring?: string
    isrc: string
    songwriters: string
    explicit?: boolean
    instrumental?: boolean
    ai_generated?: boolean
    wav_url?: string
    preview_start_seconds?: number | null
    apple_performer_name?: string
    apple_performer_instrument?: string
    apple_producer_name?: string
  }>
}

type Payload = {
  pipe: { id: string; label: string; revelatorLive: boolean }
  window: WindowInfo
  packet: Packet
  record: { status: string; albumuuid?: string | null; submitted_at?: string } | null
  distributorStatus?: string | null
}

export default function DistroKidDeliveryCard({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [albumuuid, setAlbumuuid] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || 'Could not load DistroKid packet')
      return
    }
    setError(null)
    setData(json as Payload)
    if (json.record?.albumuuid) setAlbumuuid(String(json.record.albumuuid))
  }, [releaseId])

  useEffect(() => {
    void load()
  }, [load])

  async function act(action: string) {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, albumuuid: albumuuid.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(json.error || 'Action failed')
        return
      }
      setNotice(
        action === 'mark_submitted'
          ? 'Marked submitted. Confirm store pages in Delivery after DistroKid shows it live.'
          : action === 'mark_live'
            ? 'Marked live.'
            : action === 'clear'
              ? 'Cleared the DistroKid stamp.'
              : 'Queued for DistroKid.',
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  const [fillPhase, setFillPhase] = useState<string | null>(null)

  async function fillDistroKidDesk() {
    if (!data) return
    if (data.packet.blockers.length) {
      setNotice(`Fix blockers before fill: ${data.packet.blockers[0]}`)
      return
    }
    setBusy(true)
    setFillPhase('Ensuring site DSP cover + dsp-masters…')
    setNotice(null)
    try {
      // Refresh packet from site DSP (DSP-ready cover + dsp-masters WAVs) before fill/upload.
      const dspRes = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid?ensureDsp=1`,
        { credentials: 'same-origin' }
      )
      const dspJson = (await dspRes.json().catch(() => ({}))) as Payload & {
        error?: string
        dspEnsure?: { artwork_dsp_url?: string | null; masters?: { missing?: number } | null }
      }
      if (!dspRes.ok || !dspJson.packet) {
        setNotice(dspJson.error || 'Could not load site DSP assets for DistroKid')
        return
      }
      setData(dspJson)
      const packet = dspJson.packet
      if (packet.blockers.length) {
        setNotice(`Fix blockers before fill: ${packet.blockers[0]}`)
        return
      }

      setFillPhase('Opening DistroKid /new/ in Admin browser…')
      // One action: open signed-in Admin DistroKid desk + fill/upload from site DSP packet.
      dispatchAdminAiBrowserHydrate(
        buildDistroKidBrowserHydrate({
          releaseId,
          releaseTitle: packet.release.title,
          target: 'upload',
          worksheet: packet.worksheet,
          uploadBy: dspJson.window.upload_by,
          streetDate: packet.release.release_date || dspJson.window.release_date,
          windowLabel: dspJson.window.label,
          blockers: packet.blockers,
          uploadUrl: packet.upload_url,
          myMusicUrl: packet.my_music_url,
        })
      )
      // Let the desk navigate before prefill (dock may be this tab or the Admin AI popout).
      await new Promise((r) => window.setTimeout(r, 1200))
      await fetch('/api/admin/ai/browser', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: 'user',
          action: 'navigate',
          url: packet.upload_url || 'https://distrokid.com/new/',
        }),
      })
      await new Promise((r) => window.setTimeout(r, 1800))
      const packetBody = {
        release: packet.release,
        tracks: packet.tracks,
      }

      setFillPhase('Phase 1 — metadata, Apple Music credits, stores…')
      // Phase 1: metadata only (fast). Phase 2: DSP cover + WAV masters (own 300s budget).
      const prefillRes = await fetch('/api/admin/ai/browser', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: 'user',
          action: 'distrokid_prefill',
          skipDistrokidAssets: true,
          distrokidPacket: packetBody,
        }),
      })
      const prefillJson = (await prefillRes.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        distrokidPrefill?: { filled?: string[]; skipped?: string[]; errors?: string[] }
      }
      if (!prefillRes.ok && !prefillJson.distrokidPrefill) {
        setNotice(prefillJson.error || 'DistroKid metadata fill failed')
        return
      }

      setFillPhase('Phase 2 — DSP-ready cover + dsp-masters WAVs…')
      setNotice('Metadata + Apple credits filled — uploading cover and WAV masters…')

      const uploadRes = await fetch('/api/admin/ai/browser', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: 'user',
          action: 'distrokid_upload_assets',
          distrokidPacket: packetBody,
        }),
      })
      const json = (await uploadRes.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        text?: string
        distrokidPrefill?: { filled?: string[]; skipped?: string[]; errors?: string[] }
      }
      if (!uploadRes.ok && !json.distrokidPrefill) {
        setNotice(json.error || json.text || 'DistroKid WAV/artwork upload failed')
        return
      }

      const filled =
        (prefillJson.distrokidPrefill?.filled?.length || 0) +
        (json.distrokidPrefill?.filled?.length || 0)
      const skipped = [
        ...(prefillJson.distrokidPrefill?.skipped || []),
        ...(json.distrokidPrefill?.skipped || []),
      ]
      const uploadErrors = json.distrokidPrefill?.errors || []
      const uploads = (json.distrokidPrefill?.filled || []).filter((s) => /uploaded/i.test(s))
      const red = skipped.filter((s) => /red|empty while Featuring|Name still empty|last name field missing/i.test(s))
      const manual = skipped
        .filter((s) => /WAV|Artwork|songwriter|featured|ISRC/i.test(s) && !/do not mint/i.test(s))
        .slice(0, 4)
      const isrcNote = skipped.some((s) => /ISRC/i.test(s))
        ? 'ISRCs are in the packet — enter them if DistroKid shows an ISRC field (do not mint new).'
        : null
      const dspNote = dspJson.dspEnsure?.artwork_dsp_url
        ? 'site DSP cover + dsp-masters WAVs'
        : 'site DSP masters'
      setNotice(
        [
          filled ? `Filled ${filled} DistroKid field(s) from ${dspNote}.` : 'Fill ran with no matched fields.',
          uploads.length
            ? `${uploads.length} file upload(s) attached.`
            : 'No WAV/artwork uploads confirmed — check the Admin browser desk.',
          uploadErrors.length ? `Upload errors: ${uploadErrors.slice(0, 3).join(' · ')}` : null,
          red.length ? `Still red: ${red.slice(0, 3).join(' · ')}` : null,
          manual.length ? `Check: ${manual.join(' · ')}` : null,
          isrcNote,
          'Apple Music performer/producer filled from Catalog (Jordan Caboga · Drum Machine). Social Media Pack stays off. You QC the desk, click Continue on DistroKid, then Mark submitted here.',
        ]
          .filter(Boolean)
          .join(' ')
      )
    } finally {
      setFillPhase(null)
      setBusy(false)
    }
  }

  if (error) return <p className="text-sm text-amber-300">{error}</p>
  if (!data) return <p className="text-sm text-zinc-500">Loading DistroKid packet…</p>

  const revelator = data.pipe.revelatorLive
  const submitted = data.record?.status === 'submitted' || data.distributorStatus === 'live'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">DistroKid schedule</h3>
          <p className="text-sm text-zinc-500 mt-1">
            {data.pipe.label}. Upload on DistroKid about four weeks before street date, then mark it
            submitted here. <span className="text-zinc-300">Fill DistroKid desk</span> opens the
            signed-in Admin browser and fills DistroKid from site DSP assets (DSP-ready cover +
            dsp-masters WAVs). You review and click Continue on DistroKid — this never submits.
          </p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-zinc-800 text-zinc-200">{data.window.label}</span>
      </div>

      {revelator ? (
        <p className="text-sm text-emerald-300 mb-4">
          Revelator keys are live. New DSP delivery should use Distribute to stores. This packet stays
          for anything already on the DistroKid slate.
        </p>
      ) : null}

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
        <div><dt className="text-zinc-500">Artist</dt><dd className="text-zinc-100">{data.packet.release.artist}</dd></div>
        <div><dt className="text-zinc-500">Label</dt><dd className="text-zinc-100">{data.packet.release.label}</dd></div>
        <div><dt className="text-zinc-500">Street date</dt><dd className="text-zinc-100">{data.packet.release.release_date || '—'}</dd></div>
        <div><dt className="text-zinc-500">Upload by</dt><dd className="text-zinc-100">{data.window.upload_by || '—'}</dd></div>
        <div><dt className="text-zinc-500">Genre</dt><dd className="text-zinc-100">{data.packet.release.primary_genre || '—'}</dd></div>
        <div><dt className="text-zinc-500">Language</dt><dd className="text-zinc-100">{data.packet.release.language}</dd></div>
      </dl>

      <ul className="text-sm text-zinc-300 space-y-1 mb-4">
        {data.packet.tracks.map((track) => (
          <li key={track.track_number}>
            {track.track_number}. {track.title}
            {track.featuring ? <span className="text-zinc-400"> feat. {track.featuring}</span> : null}
            <span className="text-zinc-500">
              {' '}
              · {track.isrc || 'no ISRC'} · {track.songwriters || 'no songwriter'}
              {track.apple_performer_name ? (
                <span className="text-zinc-600">
                  {' '}
                  · Apple: {track.apple_performer_name} ({track.apple_performer_instrument || 'Drum Machine'}) · prod{' '}
                  {track.apple_producer_name || track.apple_performer_name}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {data.packet.blockers.length > 0 && (
        <ul className="text-sm text-amber-200 mb-4 space-y-1">
          {data.packet.blockers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {data.packet.warnings.length > 0 && (
        <ul className="text-sm text-zinc-400 mb-4 space-y-1">
          {data.packet.warnings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      <label className="block text-xs text-zinc-500 mb-3">
        DistroKid album UUID (optional, from the My Music URL after upload)
        <input
          value={albumuuid}
          onChange={(event) => setAlbumuuid(event.target.value)}
          className="mt-1 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          placeholder="album uuid"
        />
      </label>

      {notice ? <p className="text-sm text-violet-200 mb-3">{notice}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="distrokid-fill-desk"
          disabled={busy || !data.packet.ok}
          onClick={() => void fillDistroKidDesk()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 text-sm font-semibold text-black disabled:opacity-40"
          title="Ensure site DSP cover + dsp-masters, open DistroKid /new/, fill metadata + Apple Music performer/producer credits, then upload DSP-ready JPEG cover and WAV masters (two phases). Never submits. Social Media Pack stays off."
        >
          {busy ? fillPhase || 'Filling DistroKid desk…' : 'Fill DistroKid desk'}
        </button>
        <a
          href={data.packet.upload_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 text-sm font-semibold"
        >
          Open DistroKid upload <FaExternalLinkAlt className="text-[10px]" />
        </a>
        <button
          type="button"
          className="px-4 py-2 rounded-full border border-zinc-600 text-sm text-zinc-200"
          onClick={() => void navigator.clipboard.writeText(data.packet.worksheet)}
        >
          Copy worksheet
        </button>
        <a
          href={`/api/studio/releases/${encodeURIComponent(releaseId)}/distrokid?format=csv`}
          className="px-4 py-2 rounded-full border border-zinc-600 text-sm text-zinc-200"
        >
          Download CSV
        </a>
        {!submitted && (
          <button
            type="button"
            disabled={busy || revelator}
            onClick={() => void act('mark_submitted')}
            className="px-4 py-2 rounded-full border border-emerald-700 text-sm text-emerald-200 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Mark submitted'}
          </button>
        )}
        {data.record?.status === 'submitted' && data.distributorStatus !== 'live' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('mark_live')}
            className="px-4 py-2 rounded-full border border-zinc-600 text-sm text-zinc-200 disabled:opacity-40"
          >
            Mark live after stores connect
          </button>
        )}
        {data.record && data.distributorStatus !== 'live' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('clear')}
            className="px-4 py-2 rounded-full text-sm text-zinc-500"
          >
            Clear stamp
          </button>
        )}
      </div>
    </div>
    <AdminAiBrowserDock
      variant="studio"
      chatSessionId="studio-mirror"
      listenForHydrate={false}
      defaultExpanded={false}
    />
    </div>
  )
}

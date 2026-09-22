'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  validateSplitsTotal,
  normalizeSplitRows,
  equalSplitPercentages,
  SPLIT_ROLES,
  SPLIT_PROS,
  type SplitRow,
} from '@/lib/studio/import-parse'
import {
  US_ISRC_REGISTRANT,
  buildUsisrcLockerCsv,
  currentIsrcYear,
  formatISRCDisplay,
  parseISRC,
  validateISRC,
} from '@/lib/studio/isrc-format'
import AddTracksModal from './AddTracksModal'
import { studioCreateHref, studioPipelineHref } from '@/lib/studio/studio-ia'
import { musicLibrarySonicDnaHref } from '@/lib/audio/sonic-dna-query'
import type { StudioTrackIdentity } from '@/lib/studio/vault-import'
import {
  contributorsFromCreditFields,
  creditFieldsFromContributors,
  displayArtistLine,
  namesForRole,
  parseBilledArtists,
  parseContributors,
  PERFORMANCE_INSTRUMENTS,
  storeTitleFromArtistPrefix,
  type InstrumentCredit,
  type TrackContributor,
} from '@/lib/studio/track-credits'
import revenueSplits from '@/data/revenue-splits.json'
import { TRACK_LANGUAGES } from '@/lib/studio/dsp-package'
import { previewStoreTitle } from '@/lib/studio/dsp-ingest'
import {
  seedWriterLegalRows,
  serializeWriterLegalNames,
  type WriterLegalRow,
} from '@/lib/studio/songwriter'
import { enrichSplitSheet, splitsFromCredits } from '@/lib/studio/rights-ops'
import type { RightsActionFocus } from '@/lib/studio/rights-action-target'
import { FaCopy, FaDownload, FaExternalLinkAlt, FaMagic, FaPlus, FaSave, FaSpinner, FaUnlink, FaUpload } from 'react-icons/fa'

export type CatalogTrack = {
  id: string
  title: string
  isrc_full: string | null
  wav_url: string | null
  splits: SplitRow[] | unknown
  version?: string | null
  duration?: number | null
  explicit?: boolean | null
  language?: string | null
  instrumental?: boolean | null
  track_number?: number | null
  iswc?: string | null
  publisher_name?: string | null
  publisher_ipi?: string | null
  music_library_track_id?: string | null
  identity?: StudioTrackIdentity | null
  contributors?: TrackContributor[] | unknown
  origin?: string | null
  cover_original_title?: string | null
  cover_original_artist?: string | null
  writer_legal_names?: string | null
  ai_generated?: boolean | null
  radio_edit?: boolean | null
  paired_explicit_isrc?: string | null
  preview_start_seconds?: number | null
}

type Props = {
  tracks: CatalogTrack[]
  releaseId: string
  releaseTitle: string
  releaseDate?: string | null
  releaseExplicit?: boolean
  albumArtist?: string | null
  onUpdated: () => void
  focusRequest?: RightsActionFocus | null
  onFocusHandled?: () => void
}

function normalizeSplits(raw: unknown): SplitRow[] {
  return normalizeSplitRows(raw)
}

function productionYear(releaseDate?: string | null): number {
  const fromDate = releaseDate ? new Date(releaseDate).getFullYear() : NaN
  return Number.isFinite(fromDate) ? fromDate : 2000 + currentIsrcYear()
}

function audioMasterLabel(wavUrl?: string | null): { label: string; tone: 'ok' | 'warn' | 'missing' } {
  const url = String(wavUrl || '')
  if (!url) return { label: 'No WAV', tone: 'missing' }
  if (url.startsWith('pending://')) return { label: 'Vault pending', tone: 'warn' }
  if (/\/dsp-masters\//i.test(url)) return { label: 'DSP Master', tone: 'ok' }
  if (/\.wav(\?|$)/i.test(url)) return { label: 'Master WAV', tone: 'ok' }
  return { label: 'Vault stream', tone: 'warn' }
}

function formatDuration(seconds?: number | null): string | null {
  if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return null
  const total = Math.round(Number(seconds))
  const mins = Math.floor(total / 60)
  const secs = String(total % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

function identityChips(
  identity?: StudioTrackIdentity | null,
  duration?: number | null,
  extras?: {
    trackNumber?: number | null
    language?: string | null
    explicit?: boolean | null
    instrumental?: boolean | null
    origin?: string | null
    aiGenerated?: boolean | null
    radioEdit?: boolean | null
  },
): string[] {
  if (!identity && !duration && !extras) return []
  const chips: string[] = []
  if (extras?.trackNumber && extras.trackNumber > 0) chips.push(`#${extras.trackNumber}`)
  const runtime = formatDuration(duration)
  if (runtime) chips.push(runtime)
  if (identity?.bpm) chips.push(`${identity.bpm} BPM`)
  if (identity?.key_signature) chips.push(identity.key_signature)
  if (identity?.genre) {
    chips.push(identity.subgenre ? `${identity.genre} / ${identity.subgenre}` : identity.genre)
  }
  if (identity?.scale && identity.scale !== identity.key_signature) chips.push(identity.scale)
  if (identity?.time_signature) chips.push(identity.time_signature)
  if (identity?.timing_feel) chips.push(identity.timing_feel)
  if (identity?.drum_style) chips.push(identity.drum_style)
  if (identity?.energy != null) chips.push(`Energy ${identity.energy}`)
  if (identity?.danceability != null) chips.push(`Dance ${identity.danceability}`)
  if (extras?.language) {
    const lang = TRACK_LANGUAGES.find((item) => item.id === extras.language)
    chips.push(lang?.label || extras.language)
  }
  if (extras?.instrumental) chips.push('Instrumental')
  if (extras?.explicit) chips.push('Explicit')
  if (extras?.origin === 'cover') chips.push('Cover')
  if (extras?.radioEdit) chips.push('Radio edit')
  if (extras?.aiGenerated === true) chips.push('AI declared')
  if (extras?.aiGenerated === false) chips.push('No AI')
  return chips
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'release'
  )
}

const KNOWN_COLLAB_STAGES = Array.from(
  new Set(
    [
      'SERGIK',
      ...((revenueSplits as { collaborators?: Array<{ name?: string }> }).collaborators || [])
        .map((row) => String(row.name || '').trim())
        .filter(Boolean),
    ],
  ),
)

function splitCreditNames(value: string): string[] {
  return value
    .split(/\s*(?:,|;|\/|&| and |\sx\s|\s×\s)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function uniqueCreditNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export default function TrackCatalogEditor({
  tracks,
  releaseId,
  releaseTitle,
  releaseDate,
  releaseExplicit = false,
  albumArtist = 'SERGIK',
  onUpdated,
  focusRequest = null,
  onFocusHandled,
}: Props) {
  const { showNotification } = useNotifications()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assigningAll, setAssigningAll] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pasteId, setPasteId] = useState<string | null>(null)
  const [pasteValue, setPasteValue] = useState('')
  const [savingPaste, setSavingPaste] = useState(false)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([])
  const [savingSplits, setSavingSplits] = useState(false)
  const [creditsId, setCreditsId] = useState<string | null>(null)
  const [creditDraft, setCreditDraft] = useState({
    title: '',
    lyrics: '',
    addOn: '',
    displayLine: '',
    primary: '',
    featured: '',
    vocalist: '',
    instruments: [] as InstrumentCredit[],
    writer: '',
    producer: '',
    remixer: '',
    mixer: '',
    mastering: '',
    version: '',
    versionKind: 'normal' as 'normal' | 'radio' | 'other',
    featuredOther: false,
    language: 'en',
    trackNumber: '',
    instrumental: false,
    explicit: false,
    origin: 'original',
    coverTitle: '',
    coverArtist: '',
    writerLegals: [] as WriterLegalRow[],
    aiGenerated: '' as '' | 'no' | 'yes',
    radioEdit: false,
    pairedExplicitIsrc: '',
    previewMode: 'auto' as 'auto' | 'custom',
    previewStart: '',
    vocalistPick: '',
    instrumentPick: 'Bass',
    instrumentArtistPick: '',
  })
  const [savingCredits, setSavingCredits] = useState(false)
  const [writingId, setWritingId] = useState<string | null>(null)
  const [writingAll, setWritingAll] = useState(false)
  const [noteDrafts, setNoteDrafts] = useState<
    Record<string, { description: string; intention: string; lyrics: string }>
  >({})
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [savingCatalog, setSavingCatalog] = useState(false)
  const [replacingWavId, setReplacingWavId] = useState<string | null>(null)
  const [locatingMasters, setLocatingMasters] = useState(false)
  const [missingMasterIds, setMissingMasterIds] = useState<string[]>([])
  const wavInputRef = useRef<HTMLInputElement>(null)
  const wavTargetIdRef = useRef<string | null>(null)
  const locateRanForRef = useRef<string | null>(null)

  const missing = useMemo(() => tracks.filter((track) => !track.isrc_full), [tracks])
  const missingMasters = useMemo(
    () => tracks.filter((track) => missingMasterIds.includes(track.id)),
    [tracks, missingMasterIds],
  )
  const coded = tracks.length - missing.length
  const year = currentIsrcYear()
  const yearStr = String(year).padStart(2, '0')
  const exampleDisplay = formatISRCDisplay(
    `${US_ISRC_REGISTRANT.prefix}${yearStr}00001`
  )

  async function locateMastersFromDrive(opts?: { silent?: boolean }) {
    if (!releaseId || !tracks.length) return
    setLocatingMasters(true)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/locate-masters`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Locate masters failed')

      const missingIds = Array.isArray(data.tracks)
        ? data.tracks
            .filter((row: { status?: string; trackId?: string }) => row.status === 'missing' && row.trackId)
            .map((row: { trackId: string }) => row.trackId)
        : []
      setMissingMasterIds(missingIds)

      const linked = Number(data.linked || 0) + Number(data.ingested || 0)
      if (!opts?.silent) {
        if (linked > 0 && missingIds.length === 0) {
          showNotification(
            `Pulled ${linked} master${linked === 1 ? '' : 's'} from ${data.localScan ? 'local drive / DSP Masters' : 'DSP Masters'}`,
            'success',
          )
        } else if (linked > 0) {
          showNotification(
            `Pulled ${linked} master${linked === 1 ? '' : 's'}; locate ${missingIds.length} missing WAV${missingIds.length === 1 ? '' : 's'}`,
            'success',
          )
        } else if (missingIds.length > 0) {
          showNotification(
            `Locate ${missingIds.length} master WAV${missingIds.length === 1 ? '' : 's'} for this release`,
            'error',
          )
        }
      } else if (missingIds.length > 0) {
        showNotification(
          `${missingIds.length} track${missingIds.length === 1 ? '' : 's'} need a master WAV — use Locate master`,
          'error',
        )
      }

      if (linked > 0) onUpdated()
    } catch (e: unknown) {
      if (!opts?.silent) {
        showNotification(e instanceof Error ? e.message : 'Locate masters failed', 'error')
      }
    } finally {
      setLocatingMasters(false)
    }
  }

  useEffect(() => {
    if (!releaseId || !tracks.length) return
    const fingerprint = `${releaseId}:${tracks.map((t) => t.id).join(',')}`
    if (locateRanForRef.current === fingerprint) return
    locateRanForRef.current = fingerprint
    void locateMastersFromDrive({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when catalog membership changes
  }, [releaseId, tracks.map((t) => t.id).join(',')])

  async function assignIsrc(trackId: string) {
    setAssigningId(trackId)
    try {
      const res = await fetch('/api/studio/isrc/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ISRC failed')
      showNotification(`ISRC: ${formatISRCDisplay(data.isrc)}`, 'success')
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'ISRC failed', 'error')
    } finally {
      setAssigningId(null)
    }
  }

  async function assignAllMissing() {
    if (!missing.length) return
    setAssigningAll(true)
    try {
      const res = await fetch('/api/studio/isrc/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: missing.map((track) => track.id) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk ISRC failed')
      const first = data.results?.find((row: { isrc?: string }) => row.isrc)?.isrc
      showNotification(
        `Assigned ${data.successful || 0} ISRC${data.successful === 1 ? '' : 's'}${
          first ? ` · ${formatISRCDisplay(first)}` : ''
        }`,
        data.failed ? 'warning' : 'success'
      )
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Bulk ISRC failed', 'error')
    } finally {
      setAssigningAll(false)
    }
  }

  async function writePressNotes(trackId?: string) {
    if (trackId) setWritingId(trackId)
    else setWritingAll(true)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/press-notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: trackId || undefined, listen: true }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Press notes failed')
      showNotification(
        `Wrote ${data.count || 1} press note${data.count === 1 ? '' : 's'}`,
        'success',
      )
      setNoteDrafts((prev) => {
        if (!trackId) return {}
        const next = { ...prev }
        delete next[trackId]
        return next
      })
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Press notes failed', 'error')
    } finally {
      setWritingId(null)
      setWritingAll(false)
    }
  }

  function pressNoteDraft(track: CatalogTrack) {
    return (
      noteDrafts[track.id] ?? {
        description: track.identity?.description || '',
        intention: track.identity?.intention || '',
        lyrics: track.identity?.lyrics_excerpt || '',
      }
    )
  }

  function pressNoteDirty(track: CatalogTrack) {
    const draft = pressNoteDraft(track)
    return (
      draft.description !== (track.identity?.description || '') ||
      draft.intention !== (track.identity?.intention || '') ||
      draft.lyrics !== (track.identity?.lyrics_excerpt || '')
    )
  }

  function updatePressNote(
    track: CatalogTrack,
    patch: Partial<{ description: string; intention: string; lyrics: string }>,
  ) {
    setNoteDrafts((prev) => {
      const base = prev[track.id] ?? {
        description: track.identity?.description || '',
        intention: track.identity?.intention || '',
        lyrics: track.identity?.lyrics_excerpt || '',
      }
      return { ...prev, [track.id]: { ...base, ...patch } }
    })
  }

  async function savePressNote(track: CatalogTrack, opts?: { silent?: boolean }) {
    const draft = pressNoteDraft(track)
    setSavingNoteId(track.id)
    try {
      const res = await fetch(`/api/studio/tracks/${track.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: draft.description,
          intention: draft.intention,
          lyrics: draft.lyrics,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save press note')
      setNoteDrafts((prev) => {
        const next = { ...prev }
        delete next[track.id]
        return next
      })
      if (!opts?.silent) {
        showNotification('Press note saved', 'success')
        onUpdated()
      }
    } catch (e: unknown) {
      if (!opts?.silent) {
        showNotification(e instanceof Error ? e.message : 'Save failed', 'error')
      }
      throw e
    } finally {
      setSavingNoteId(null)
    }
  }

  async function saveCatalogData() {
    const hasCredits = Boolean(creditsId)
    const hasSplits = Boolean(editingId)
    const notesToSave = tracks.filter(
      (track) =>
        pressNoteDirty(track) ||
        Boolean(pressNoteDraft(track).description.trim() || pressNoteDraft(track).intention.trim()),
    )
    if (!hasCredits && !hasSplits && !notesToSave.length) {
      showNotification('Nothing to save — add a press note or open credits/splits first', 'info')
      return
    }
    setSavingCatalog(true)
    try {
      if (creditsId) await saveCredits(creditsId, { silent: true })
      if (editingId) await saveSplits(editingId, { silent: true })
      for (const track of notesToSave) {
        await savePressNote(track, { silent: true })
      }
      const parts: string[] = []
      if (hasCredits) parts.push('credits')
      if (hasSplits) parts.push('splits')
      if (notesToSave.length) {
        parts.push(`${notesToSave.length} press note${notesToSave.length === 1 ? '' : 's'}`)
      }
      showNotification(`Saved catalog ${parts.join(' · ')}`, 'success')
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Catalog save failed', 'error')
    } finally {
      setSavingCatalog(false)
    }
  }

  async function savePastedIsrc(trackId: string) {
    if (!validateISRC(pasteValue)) {
      showNotification('Enter a valid 12-character ISRC', 'error')
      return
    }
    setSavingPaste(true)
    try {
      const res = await fetch('/api/studio/isrc/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ track_id: trackId, isrc: pasteValue }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      if (data.failed) throw new Error(data.results?.[0]?.message || 'Save failed')
      showNotification(`Saved ${formatISRCDisplay(pasteValue)}`, 'success')
      setPasteId(null)
      setPasteValue('')
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSavingPaste(false)
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      showNotification(`${label} copied`, 'success')
    } catch {
      showNotification('Copy failed', 'error')
    }
  }

  function pickReplacementWav(trackId: string) {
    wavTargetIdRef.current = trackId
    wavInputRef.current?.click()
  }

  async function handleReplacementWav(file: File, trackId: string) {
    setReplacingWavId(trackId)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/studio/tracks/${trackId}/replace-wav`, {
        method: 'POST',
        body,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Replace WAV failed')
      const isrcKept = data.isrc ? ` ISRC ${data.isrc} kept.` : ' ISRC unchanged.'
      const vaultNote = data.vault?.updated
        ? ' Music Vault file and Sonic DNA queued.'
        : data.vault?.reason === 'not_linked'
          ? ' Not linked to Music Vault — player copy unchanged.'
          : ''
      showNotification(`WAV replaced.${isrcKept}${vaultNote}`, 'success')
      setMissingMasterIds((ids) => ids.filter((id) => id !== trackId))
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Replace WAV failed', 'error')
    } finally {
      setReplacingWavId(null)
      wavTargetIdRef.current = null
    }
  }

  function lockerCsv(): string {
    return buildUsisrcLockerCsv(
      tracks
        .filter((track) => track.isrc_full)
        .map((track) => ({
          isrc: track.isrc_full as string,
          title: track.title,
          version: track.version,
          explicit: track.explicit ?? releaseExplicit,
          durationSec: track.duration,
          yearOfProduction: productionYear(releaseDate),
        }))
    )
  }

  function downloadLockerCsv() {
    const codedTracks = tracks.filter((track) => track.isrc_full)
    if (!codedTracks.length) {
      showNotification('Assign ISRCs before exporting the locker CSV', 'error')
      return
    }
    const blob = new Blob([lockerCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slugify(releaseTitle)}-usisrc-locker.csv`
    link.click()
    URL.revokeObjectURL(url)
    showNotification('USISRC locker CSV downloaded', 'success')
  }

  async function removeFromRelease(trackId: string, title: string) {
    if (
      !confirm(
        `Remove "${title}" from this release? The track stays in your catalog.`
      )
    ) {
      return
    }
    setRemovingId(trackId)
    try {
      const res = await fetch(
        `/api/studio/releases/${encodeURIComponent(releaseId)}/tracks?trackId=${encodeURIComponent(trackId)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove')
      showNotification('Track removed from release', 'success')
      onUpdated()
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Remove failed', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  function startEditSplits(track: CatalogTrack) {
    setEditingId(track.id)
    setSplitRows(
      enrichSplitSheet(track.splits, track.contributors, track.writer_legal_names),
    )
  }

  function updateSplitRow(index: number, patch: Partial<SplitRow>) {
    setSplitRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function equalizeSplitRows() {
    setSplitRows((rows) => {
      const percents = equalSplitPercentages(rows.filter((row) => row.name.trim()).length || 1)
      let cursor = 0
      return rows.map((row) =>
        row.name.trim() ? { ...row, percentage: percents[cursor++] ?? row.percentage } : row,
      )
    })
  }

  async function saveSplits(trackId: string, opts?: { silent?: boolean }) {
    const splits = normalizeSplitRows(splitRows)
    const err = validateSplitsTotal(splits)
    if (err) {
      showNotification(err, 'error')
      throw new Error(err)
    }
    setSavingSplits(true)
    try {
      const res = await fetch(`/api/studio/tracks/${trackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits }),
      })
      if (!res.ok) throw new Error('Failed to save splits')
      setEditingId(null)
      if (!opts?.silent) {
        showNotification('Splits saved', 'success')
        onUpdated()
      }
    } catch (e: unknown) {
      if (!opts?.silent) {
        showNotification(e instanceof Error ? e.message : 'Save failed', 'error')
      }
      throw e
    } finally {
      setSavingSplits(false)
    }
  }

  function startEditCredits(track: CatalogTrack) {
    const parsed = parseContributors(track.contributors)
    const fields = creditFieldsFromContributors(parsed)
    const billed = namesForRole(parsed, 'primary')
    const store = storeTitleFromArtistPrefix(track.title, billed)
    const displayLine = displayArtistLine(parsed, albumArtist || 'SERGIK')
    const primaryDefault = fields.primary || albumArtist || 'SERGIK'
    setCreditsId(track.id)
    setCreditDraft({
      ...fields,
      title: store.title || track.title || '',
      lyrics: track.identity?.lyrics_excerpt || '',
      addOn: '',
      displayLine,
      primary: primaryDefault,
      writer: fields.writer || primaryDefault,
      producer: fields.producer || primaryDefault,
      vocalist: fields.vocalist || '',
      instruments: fields.instruments || [],
      remixer: fields.remixer || '',
      version: track.version || '',
      versionKind: track.radio_edit ? 'radio' : track.version ? 'other' : 'normal',
      featuredOther: Boolean((fields.featured || '').trim()),
      language: track.language || 'en',
      trackNumber: track.track_number ? String(track.track_number) : '',
      instrumental: Boolean(track.instrumental),
      explicit: Boolean(track.explicit ?? releaseExplicit),
      origin: track.origin === 'cover' ? 'cover' : 'original',
      coverTitle: track.cover_original_title || '',
      coverArtist: track.cover_original_artist || '',
      writerLegals: seedWriterLegalRows(parsed, track.writer_legal_names),
      aiGenerated: track.ai_generated == null ? '' : track.ai_generated ? 'yes' : 'no',
      radioEdit: Boolean(track.radio_edit),
      pairedExplicitIsrc: track.paired_explicit_isrc || '',
      previewMode: track.preview_start_seconds == null ? 'auto' : 'custom',
      previewStart: track.preview_start_seconds != null ? String(track.preview_start_seconds) : '',
      vocalistPick: '',
      instrumentPick: 'Bass',
      instrumentArtistPick: '',
    })
  }

  useEffect(() => {
    if (!focusRequest || focusRequest.step !== 'catalog') return
    const track =
      (focusRequest.trackId && tracks.find((row) => row.id === focusRequest.trackId)) ||
      tracks[0]
    if (!track) {
      onFocusHandled?.()
      return
    }

    if (focusRequest.section === 'splits') {
      startEditSplits(track)
    } else if (focusRequest.section === 'wav') {
      const row = document.querySelector(`[data-catalog-track="${track.id}"]`)
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      onFocusHandled?.()
      return
    } else {
      startEditCredits(track)
    }

    const timer = window.setTimeout(() => {
      const root = document.querySelector(`[data-catalog-track="${track.id}"]`)
      let target: Element | null = null
      if (focusRequest.section === 'writer_legal') {
        const party = focusRequest.party?.toLowerCase()
        if (party && root) {
          target =
            Array.from(root.querySelectorAll('[data-writer-legal-stage]')).find(
              (el) => el.getAttribute('data-writer-legal-stage') === party,
            ) || null
        }
        if (!target) target = root?.querySelector('[data-catalog-section="writer-legal"]') || null
      } else if (focusRequest.section === 'ai') {
        target = root?.querySelector('[data-catalog-section="ai"]') || null
      } else if (focusRequest.section === 'title') {
        target = root?.querySelector('[data-catalog-section="title"]') || null
      } else if (focusRequest.section === 'credits') {
        target = root?.querySelector('[data-catalog-section="credits"]') || null
      } else if (focusRequest.section === 'splits') {
        target = root?.querySelector('[data-catalog-section="splits"]') || null
      }
      const focusEl = (target as HTMLElement | null) || (root as HTMLElement | null)
      focusEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (focusEl && typeof focusEl.focus === 'function') {
        try {
          focusEl.focus({ preventScroll: true })
        } catch {
          /* ignore */
        }
      }
      onFocusHandled?.()
    }, 80)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest])

  function applyDisplayArtistLine(value: string) {
    const billed = parseBilledArtists(value)
    const primary = billed.primary.join(' x ') || albumArtist || 'SERGIK'
    const featured = billed.featured.join(', ')
    setCreditDraft((draft) => ({
      ...draft,
      displayLine: value,
      primary,
      featured,
      featuredOther: featured.length > 0,
    }))
  }

  function syncDisplayLineFromParts(next: {
    primary?: string
    featured?: string
    featuredOther?: boolean
  }) {
    setCreditDraft((draft) => {
      const primary = next.primary ?? draft.primary
      const featuredOther = next.featuredOther ?? draft.featuredOther
      const featured = featuredOther ? next.featured ?? draft.featured : ''
      const rows = contributorsFromCreditFields({
        primary,
        featured: featuredOther ? featured : '',
      })
      return {
        ...draft,
        primary,
        featured,
        featuredOther,
        displayLine: displayArtistLine(rows, albumArtist || 'SERGIK'),
      }
    })
  }

  async function saveCredits(trackId: string, opts?: { silent?: boolean }) {
    setSavingCredits(true)
    try {
      const contributors = contributorsFromCreditFields({
        ...creditDraft,
        featured: creditDraft.featuredOther ? creditDraft.featured : '',
        vocalist: creditDraft.vocalist,
        instruments: creditDraft.instruments,
      })
      const writerLegal = serializeWriterLegalNames(
        seedWriterLegalRows(contributors, serializeWriterLegalNames(creditDraft.writerLegals)),
      )
      const title = creditDraft.title.trim()
      if (!title) throw new Error('Add a song title')
      const current = tracks.find((track) => track.id === trackId)
      const splits = enrichSplitSheet(current?.splits, contributors, writerLegal)
      const trackNumber = Number(creditDraft.trackNumber)
      const res = await fetch(`/api/studio/tracks/${trackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          lyrics: creditDraft.lyrics,
          contributors,
          splits,
          version:
            creditDraft.versionKind === 'radio'
              ? creditDraft.version.trim() || 'Radio Edit'
              : creditDraft.versionKind === 'other'
                ? creditDraft.version.trim() || null
                : null,
          language: creditDraft.language || 'en',
          track_number: Number.isFinite(trackNumber) && trackNumber > 0 ? trackNumber : null,
          instrumental: creditDraft.instrumental,
          explicit: creditDraft.explicit,
          origin: creditDraft.origin,
          cover_original_title: creditDraft.origin === 'cover' ? creditDraft.coverTitle.trim() || null : null,
          cover_original_artist: creditDraft.origin === 'cover' ? creditDraft.coverArtist.trim() || null : null,
          writer_legal_names: writerLegal,
          ai_generated: creditDraft.aiGenerated === '' ? null : creditDraft.aiGenerated === 'yes',
          radio_edit: creditDraft.versionKind === 'radio',
          paired_explicit_isrc:
            creditDraft.versionKind === 'radio' ? creditDraft.pairedExplicitIsrc.trim() || null : null,
          preview_start_seconds:
            creditDraft.previewMode === 'custom' ? Number(creditDraft.previewStart) : null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save credits')
      setCreditsId(null)
      if (!opts?.silent) {
        showNotification('Title, credits, writers, and splits saved', 'success')
        onUpdated()
      }
    } catch (e: unknown) {
      if (!opts?.silent) {
        showNotification(e instanceof Error ? e.message : 'Save failed', 'error')
      }
      throw e
    } finally {
      setSavingCredits(false)
    }
  }

  function appendCollaborator(role: 'primary' | 'featured') {
    const name = creditDraft.addOn.trim()
    if (!name) return
    setCreditDraft((draft) => {
      const primary =
        role === 'primary'
          ? draft.primary.trim()
            ? `${draft.primary.trim()} x ${name}`
            : name
          : draft.primary
      const featuredOther = role === 'featured' ? true : draft.featuredOther
      const featured =
        role === 'featured'
          ? draft.featured.trim()
            ? `${draft.featured.trim()}, ${name}`
            : name
          : featuredOther
            ? draft.featured
            : ''
      const rows = contributorsFromCreditFields({
        primary,
        featured: featuredOther ? featured : '',
      })
      return {
        ...draft,
        primary,
        featured,
        featuredOther,
        displayLine: displayArtistLine(rows, albumArtist || 'SERGIK'),
        addOn: '',
      }
    })
  }

  function creditArtistOptions(): string[] {
    return uniqueCreditNames([
      ...KNOWN_COLLAB_STAGES,
      ...splitCreditNames(creditDraft.primary),
      ...splitCreditNames(creditDraft.featured),
      ...splitCreditNames(creditDraft.vocalist),
      ...creditDraft.instruments.map((row) => row.name),
    ])
  }

  function appendVocalist(name?: string) {
    const next = (name || creditDraft.vocalistPick || creditDraft.addOn).trim()
    if (!next) return
    setCreditDraft((draft) => {
      const existing = splitCreditNames(draft.vocalist)
      if (existing.some((item) => item.toLowerCase() === next.toLowerCase())) {
        return { ...draft, vocalistPick: '', addOn: '' }
      }
      return {
        ...draft,
        vocalist: [...existing, next].join(', '),
        vocalistPick: '',
        addOn: '',
      }
    })
  }

  function removeVocalist(name: string) {
    setCreditDraft((draft) => ({
      ...draft,
      vocalist: splitCreditNames(draft.vocalist)
        .filter((item) => item.toLowerCase() !== name.toLowerCase())
        .join(', '),
    }))
  }

  function appendInstrumentCredit() {
    const instrument = creditDraft.instrumentPick.trim() || 'Other'
    const name = (creditDraft.instrumentArtistPick || creditDraft.addOn).trim()
    if (!name) return
    setCreditDraft((draft) => {
      const exists = draft.instruments.some(
        (row) =>
          row.name.toLowerCase() === name.toLowerCase() &&
          row.instrument.toLowerCase() === instrument.toLowerCase(),
      )
      if (exists) {
        return { ...draft, instrumentArtistPick: '', addOn: '' }
      }
      return {
        ...draft,
        instruments: [...draft.instruments, { instrument, name }],
        instrumentArtistPick: '',
        addOn: '',
      }
    })
  }

  function removeInstrumentCredit(index: number) {
    setCreditDraft((draft) => ({
      ...draft,
      instruments: draft.instruments.filter((_, i) => i !== index),
    }))
  }

  return (
    <>
      <AddTracksModal
        releaseId={releaseId}
        releaseTitle={releaseTitle}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAttached={onUpdated}
        excludeIds={tracks.map((t) => t.id)}
      />

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              US ISRC Agency
            </p>
            <h2 className="text-lg font-semibold text-white mt-1">
              Prefix {US_ISRC_REGISTRANT.prefix}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {US_ISRC_REGISTRANT.name} · year of reference {yearStr} · first code{' '}
              <span className="font-mono text-zinc-200">{exampleDisplay}</span>
            </p>
            <p className="text-xs text-zinc-500 mt-2 max-w-2xl">
              Studio mints the next unused designation on {US_ISRC_REGISTRANT.prefix}.
              The USISRC locker is optional storage — register recordings with
              SoundExchange after you assign codes.
            </p>
          </div>
          <p className="text-sm text-zinc-300">
            <span className={coded === tracks.length && tracks.length ? 'text-emerald-400' : 'text-amber-400'}>
              {coded}/{tracks.length}
            </span>{' '}
            coded
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={assignAllMissing}
            disabled={!missing.length || assigningAll}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50"
          >
            {assigningAll ? <FaSpinner className="animate-spin" /> : null}
            Assign all missing
          </button>
          <button
            type="button"
            onClick={downloadLockerCsv}
            disabled={!coded}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            <FaDownload className="text-[10px]" />
            Export locker CSV
          </button>
          <button
            type="button"
            onClick={() => void copyText(lockerCsv(), 'Locker CSV')}
            disabled={!coded}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            <FaCopy className="text-[10px]" />
            Copy locker CSV
          </button>
          <Link
            href={studioPipelineHref('isrcs')}
            className="text-xs text-violet-400 hover:text-violet-300 px-2 py-1.5"
          >
            SoundExchange
          </Link>
        </div>
      </section>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <input
          ref={wavInputRef}
          type="file"
          accept="audio/wav,.wav"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            const trackId = wavTargetIdRef.current
            e.target.value = ''
            if (file && trackId) void handleReplacementWav(file, trackId)
          }}
        />
        <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Catalog ({tracks.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void locateMastersFromDrive()}
              disabled={locatingMasters || !tracks.length}
              title="Scan local Exports / Album Release Masters / Distrokid downloads, then R2 DSP Masters"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {locatingMasters ? (
                <FaSpinner className="animate-spin" />
              ) : (
                <FaUpload className="text-[10px]" />
              )}
              Pull masters
            </button>
            <button
              type="button"
              onClick={() => void writePressNotes()}
              disabled={writingAll || savingCatalog || !tracks.length}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {writingAll ? <FaSpinner className="animate-spin" /> : <FaMagic className="text-[10px]" />}
              AI listen + press notes
            </button>
            <button
              type="button"
              onClick={() => void saveCatalogData()}
              disabled={
                savingCatalog ||
                writingAll ||
                savingCredits ||
                savingSplits ||
                Boolean(savingNoteId) ||
                !tracks.length
              }
              title="Save press notes, open credits, and splits"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {savingCatalog ? <FaSpinner className="animate-spin" /> : <FaSave className="text-[10px]" />}
              Save catalog
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-medium transition"
            >
              <FaPlus className="text-[10px]" />
              Add tracks
            </button>
            <Link
              href={studioCreateHref('import')}
              className="text-xs text-violet-400 hover:text-violet-300 px-2"
            >
              Bulk import
            </Link>
          </div>
        </div>

        {missingMasters.length > 0 && (
          <div className="px-4 py-3 border-b border-amber-500/30 bg-amber-500/5 text-amber-100 text-sm flex flex-wrap items-center justify-between gap-2">
            <p>
              {missingMasters.length} track{missingMasters.length === 1 ? '' : 's'} missing a local
              master WAV. Use <span className="font-medium">Locate master</span> on each row, or{' '}
              <span className="font-medium">Pull masters</span> after files land on the SERGIK drive.
            </p>
            <button
              type="button"
              onClick={() => pickReplacementWav(missingMasters[0]!.id)}
              className="text-xs px-3 py-1.5 rounded-full border border-amber-500/50 text-amber-50 hover:bg-amber-500/10"
            >
              Locate first missing
            </button>
          </div>
        )}

        {tracks.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-500 mb-4">
              No tracks on this release yet.
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold"
            >
              <FaPlus />
              Add from catalog
            </button>
            <p className="text-xs text-zinc-600 mt-4">
              Or{' '}
              <Link href={studioCreateHref('track')} className="text-violet-400">
                upload a new track
              </Link>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {tracks.map((track) => {
              const splits = normalizeSplits(track.splits)
              const splitTotal = splits.reduce((s, r) => s + r.percentage, 0)
              const isEditing = editingId === track.id
              const parsed = track.isrc_full ? parseISRC(track.isrc_full) : null
              const display = parsed ? formatISRCDisplay(parsed.isrc_full) : null
              const chips = identityChips(track.identity, track.duration, {
                trackNumber: track.track_number,
                language: track.language,
                explicit: track.explicit,
                instrumental: track.instrumental,
                origin: track.origin,
                aiGenerated: track.ai_generated,
                radioEdit: track.radio_edit,
              })
              const master = audioMasterLabel(track.wav_url)
              const billedCredits = parseContributors(track.contributors)
              const storeTitle = storeTitleFromArtistPrefix(
                track.title,
                namesForRole(billedCredits, 'primary'),
              )

              return (
                <li key={track.id} data-catalog-track={track.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {creditsId === track.id ? (
                        <label className="block" data-catalog-section="title">
                          <span className="sr-only">Track title</span>
                          <input
                            value={creditDraft.title}
                            onChange={(e) =>
                              setCreditDraft((draft) => ({ ...draft, title: e.target.value }))
                            }
                            placeholder="Track title"
                            className="w-full max-w-xl bg-zinc-950 border border-violet-500/40 rounded-lg px-3 py-1.5 text-base font-medium text-white focus:outline-none focus:border-violet-400"
                          />
                        </label>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditCredits(track)}
                          className="block w-full max-w-xl font-medium text-white text-left hover:underline decoration-zinc-600 underline-offset-2"
                          title="Edit track title"
                        >
                          {storeTitle.title || track.title}
                        </button>
                      )}
                      {creditsId === track.id ? (
                        <label className="mt-1 block">
                          <span className="sr-only">Display artist</span>
                          <input
                            value={creditDraft.displayLine}
                            onChange={(e) => applyDisplayArtistLine(e.target.value)}
                            placeholder="SERGIK x Artist feat. Guest"
                            className="w-full max-w-xl bg-zinc-950 border border-violet-500/40 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
                          />
                          <span className="mt-1 block text-[11px] text-zinc-500">
                            Use <span className="text-zinc-400">x</span> for billed collabs and{' '}
                            <span className="text-zinc-400">feat.</span> for featured artists.
                          </span>
                        </label>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditCredits(track)}
                          className="mt-0.5 block w-full max-w-xl text-sm text-zinc-300 text-left hover:text-white hover:underline decoration-zinc-600 underline-offset-2"
                          title="Edit display artist"
                        >
                          {displayArtistLine(billedCredits, albumArtist || 'SERGIK')}
                        </button>
                      )}
                      {storeTitle.prefix && creditsId !== track.id ? (
                        <p className="text-[11px] text-amber-400 mt-0.5">
                          Saved as “{track.title}” — Edit credits to keep the store title
                        </p>
                      ) : null}
                      {track.version ? (
                        <p className="text-xs text-zinc-500 mt-0.5">{track.version}</p>
                      ) : null}
                      {chips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {chips.map((chip) => (
                            <span
                              key={chip}
                              className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-zinc-500 font-mono mt-1">
                        {display && parsed ? (
                          <span className="text-emerald-400">
                            {display}{' '}
                            <span className="text-zinc-500">({parsed.isrc_full})</span>
                          </span>
                        ) : (
                          <span className="text-amber-400">No ISRC</span>
                        )}
                        <span
                          className={
                            master.tone === 'ok'
                              ? 'text-emerald-400 ml-2'
                              : 'text-amber-400 ml-2'
                          }
                        >
                          · {master.label}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {parsed ? (
                        <button
                          type="button"
                          onClick={() => void copyText(display || parsed.isrc_full, 'ISRC')}
                          className="text-xs px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                        >
                          Copy ISRC
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => assignIsrc(track.id)}
                            disabled={assigningId === track.id || assigningAll}
                            className="text-xs px-3 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 disabled:opacity-50"
                          >
                            {assigningId === track.id ? (
                              <FaSpinner className="animate-spin inline" />
                            ) : (
                              'Assign ISRC'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPasteId(pasteId === track.id ? null : track.id)
                              setPasteValue('')
                            }}
                            className="text-xs px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          >
                            Paste existing
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => pickReplacementWav(track.id)}
                        disabled={replacingWavId === track.id}
                        title={
                          missingMasterIds.includes(track.id)
                            ? 'Master not found on local drive — pick the WAV file'
                            : track.music_library_track_id
                              ? 'Replace the catalog master WAV and the linked Music Vault file. ISRC stays put.'
                              : 'Replace the catalog master WAV. ISRC stays put. Link a vault track for player/DNA update.'
                        }
                        className={`text-xs px-3 py-1.5 rounded-full border disabled:opacity-50 ${
                          missingMasterIds.includes(track.id)
                            ? 'border-amber-500/50 text-amber-100 hover:bg-amber-500/10'
                            : 'border-zinc-600 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {replacingWavId === track.id ? (
                          <FaSpinner className="animate-spin inline" />
                        ) : (
                          <>
                            <FaUpload className="inline mr-1 text-[10px]" />
                            {missingMasterIds.includes(track.id) ? 'Locate master' : 'Replace WAV'}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          creditsId === track.id ? setCreditsId(null) : startEditCredits(track)
                        }
                        className="text-xs px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                      >
                        {creditsId === track.id ? 'Cancel' : 'Edit credits'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          isEditing ? setEditingId(null) : startEditSplits(track)
                        }
                        className="text-xs px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                      >
                        {isEditing ? 'Cancel' : 'Edit splits'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromRelease(track.id, track.title)}
                        disabled={removingId === track.id}
                        className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-900/50 disabled:opacity-50"
                        title="Remove from release"
                      >
                        {removingId === track.id ? (
                          <FaSpinner className="animate-spin" />
                        ) : (
                          <FaUnlink className="inline" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {pressNoteDirty(track)
                          ? 'Press note · unsaved'
                          : track.identity?.press_source === 'ai-listen'
                            ? 'Press note · AI listen'
                            : track.identity?.press_source === 'edited'
                              ? 'Press note · edited'
                              : 'Press note'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void savePressNote(track)}
                          disabled={
                            savingNoteId === track.id ||
                            writingAll ||
                            writingId === track.id ||
                            savingCatalog
                          }
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                        >
                          {savingNoteId === track.id ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaSave />
                          )}
                          {savingNoteId === track.id ? 'Saving…' : 'Save note'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void writePressNotes(track.id)}
                          disabled={writingAll || writingId === track.id || savingNoteId === track.id}
                          className="text-[11px] text-violet-300 hover:text-violet-200 disabled:opacity-50"
                        >
                          {writingId === track.id ? 'Listening…' : 'Rewrite from listen'}
                        </button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Press note
                      </span>
                      <textarea
                        value={pressNoteDraft(track).description}
                        onChange={(e) => updatePressNote(track, { description: e.target.value })}
                        rows={6}
                        disabled={writingAll || writingId === track.id || savingNoteId === track.id}
                        placeholder="Journalist press copy for this track. Edit here, or rewrite from an AI listen."
                        className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 leading-relaxed focus:outline-none focus:border-violet-500 disabled:opacity-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        For the room
                      </span>
                      <input
                        type="text"
                        value={pressNoteDraft(track).intention}
                        onChange={(e) => updatePressNote(track, { intention: e.target.value })}
                        disabled={writingAll || writingId === track.id || savingNoteId === track.id}
                        placeholder="One-line intent for the room"
                        className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Lyrics excerpt
                      </span>
                      <textarea
                        value={pressNoteDraft(track).lyrics}
                        onChange={(e) => updatePressNote(track, { lyrics: e.target.value })}
                        rows={3}
                        disabled={writingAll || writingId === track.id || savingNoteId === track.id}
                        placeholder="Optional lyrics / vocal phrases for press, UGC, and DSP metadata."
                        className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 leading-relaxed focus:outline-none focus:border-violet-500 disabled:opacity-50"
                      />
                    </label>
                    {track.identity?.instruments?.length ? (
                      <p className="text-xs text-zinc-500">
                        Heard · {track.identity.instruments.join(' · ')}
                      </p>
                    ) : null}
                    {track.music_library_track_id ? (
                      <Link
                        href={musicLibrarySonicDnaHref(track.music_library_track_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 pt-1 text-xs text-violet-300 hover:text-violet-200"
                      >
                        Sonic DNA — deeper fan knowledge
                        <FaExternalLinkAlt className="text-[9px] opacity-70" aria-hidden />
                      </Link>
                    ) : null}
                  </div>

                  {creditsId === track.id && (
                    <div
                      data-catalog-section="credits"
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 grid sm:grid-cols-2 gap-3"
                    >
                      <label className="text-xs text-zinc-500 sm:col-span-2" data-catalog-section="title">
                        Store title
                        <input
                          value={creditDraft.title}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, title: e.target.value }))
                          }
                          placeholder="What you want"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                        {storeTitleFromArtistPrefix(
                          track.title,
                          namesForRole(parseContributors(track.contributors), 'primary'),
                        ).prefix ? (
                          <span className="mt-1 block text-[11px] text-amber-300">
                            Filename prefixes like “OG Coconut - …” stay off the store title.
                          </span>
                        ) : null}
                      </label>
                      <label className="text-xs text-zinc-500 sm:col-span-2">
                        Display artist
                        <input
                          value={creditDraft.displayLine}
                          onChange={(e) => applyDisplayArtistLine(e.target.value)}
                          placeholder="SERGIK x OG Coconut feat. Mira"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                        <span className="mt-1 block text-[11px] text-zinc-600">
                          Edits billed (x) and feat. lines together.
                        </span>
                      </label>
                      <label className="text-xs text-zinc-500 sm:col-span-2">
                        Billed artists (x)
                        <input
                          value={creditDraft.primary}
                          onChange={(e) => syncDisplayLineFromParts({ primary: e.target.value })}
                          placeholder="SERGIK x OG Coconut"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
                        <label className="text-xs text-zinc-500 flex-1 min-w-[12rem]">
                          Add collaborator
                          <select
                            value={
                              KNOWN_COLLAB_STAGES.some(
                                (name) => name.toLowerCase() === creditDraft.addOn.trim().toLowerCase(),
                              )
                                ? creditDraft.addOn
                                : creditDraft.addOn
                                  ? '__custom__'
                                  : ''
                            }
                            onChange={(e) => {
                              const value = e.target.value
                              setCreditDraft((draft) => ({
                                ...draft,
                                addOn: value === '__custom__' ? draft.addOn : value,
                              }))
                            }}
                            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                          >
                            <option value="">Select artist…</option>
                            {KNOWN_COLLAB_STAGES.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                            <option value="__custom__">Other / type below…</option>
                          </select>
                          <input
                            value={creditDraft.addOn}
                            onChange={(e) =>
                              setCreditDraft((draft) => ({ ...draft, addOn: e.target.value }))
                            }
                            placeholder="Stage name"
                            className="mt-2 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                appendCollaborator('primary')
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => appendCollaborator('primary')}
                          className="text-xs px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                        >
                          Add billed (x)
                        </button>
                        <button
                          type="button"
                          onClick={() => appendCollaborator('featured')}
                          className="text-xs px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                        >
                          Add feat.
                        </button>
                      </div>
                      <fieldset className="text-xs text-zinc-500">
                        <legend className="mb-1">Does this song feature another artist?</legend>
                        <label className="flex items-center gap-2 text-sm text-zinc-300 mb-1">
                          <input
                            type="radio"
                            name={`featured-${track.id}`}
                            checked={!creditDraft.featuredOther}
                            onChange={() =>
                              syncDisplayLineFromParts({ featuredOther: false, featured: '' })
                            }
                          />
                          No — billed only
                        </label>
                        <label className="flex items-center gap-2 text-sm text-zinc-300">
                          <input
                            type="radio"
                            name={`featured-${track.id}`}
                            checked={creditDraft.featuredOther}
                            onChange={() =>
                              syncDisplayLineFromParts({ featuredOther: true })
                            }
                          />
                          Yes — feat.
                        </label>
                        {creditDraft.featuredOther ? (
                          <input
                            value={creditDraft.featured}
                            onChange={(e) =>
                              syncDisplayLineFromParts({
                                featuredOther: true,
                                featured: e.target.value,
                              })
                            }
                            placeholder="Featured artist name(s)"
                            className="mt-2 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        ) : null}
                      </fieldset>
                      <div className="sm:col-span-2 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 space-y-3">
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Vocalist(s)</p>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {splitCreditNames(creditDraft.vocalist).map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => removeVocalist(name)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:border-red-500/50"
                                title="Remove vocalist"
                              >
                                {name}
                                <span className="text-zinc-500">×</span>
                              </button>
                            ))}
                            {!splitCreditNames(creditDraft.vocalist).length ? (
                              <span className="text-[11px] text-zinc-600">No vocalists yet</span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="text-xs text-zinc-500 flex-1 min-w-[10rem]">
                              Add vocalist
                              <select
                                value={creditDraft.vocalistPick}
                                onChange={(e) =>
                                  setCreditDraft((draft) => ({
                                    ...draft,
                                    vocalistPick: e.target.value,
                                  }))
                                }
                                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                              >
                                <option value="">Select…</option>
                                {creditArtistOptions().map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => appendVocalist()}
                              className="text-xs px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                            >
                              Add vocalist
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Instrument(s)</p>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {creditDraft.instruments.map((row, index) => (
                              <button
                                key={`${row.instrument}-${row.name}-${index}`}
                                type="button"
                                onClick={() => removeInstrumentCredit(index)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:border-red-500/50"
                                title="Remove instrument credit"
                              >
                                {row.instrument} — {row.name}
                                <span className="text-zinc-500">×</span>
                              </button>
                            ))}
                            {!creditDraft.instruments.length ? (
                              <span className="text-[11px] text-zinc-600">No instruments yet</span>
                            ) : null}
                          </div>
                          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                            <label className="text-xs text-zinc-500">
                              Instrument
                              <select
                                value={creditDraft.instrumentPick}
                                onChange={(e) =>
                                  setCreditDraft((draft) => ({
                                    ...draft,
                                    instrumentPick: e.target.value,
                                  }))
                                }
                                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                              >
                                {PERFORMANCE_INSTRUMENTS.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs text-zinc-500">
                              Played by
                              <select
                                value={creditDraft.instrumentArtistPick}
                                onChange={(e) =>
                                  setCreditDraft((draft) => ({
                                    ...draft,
                                    instrumentArtistPick: e.target.value,
                                  }))
                                }
                                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                              >
                                <option value="">Select artist…</option>
                                {creditArtistOptions().map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => appendInstrumentCredit()}
                              className="text-xs px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                            >
                              Add instrument
                            </button>
                          </div>
                          {track.identity?.instruments?.length ? (
                            <p className="text-[11px] text-zinc-600 mt-2">
                              Sonic DNA heard: {track.identity.instruments.join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <label className="text-xs text-zinc-500">
                        Remixer
                        <input
                          value={creditDraft.remixer}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, remixer: e.target.value }))
                          }
                          placeholder="Shown as [Name Remix]"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <fieldset className="text-xs text-zinc-500 sm:col-span-2">
                        <legend className="mb-1">Version</legend>
                        <div className="flex flex-wrap gap-4">
                          {(
                            [
                              ['normal', 'Normal'],
                              ['radio', 'Radio edit'],
                              ['other', 'Other'],
                            ] as const
                          ).map(([kind, label]) => (
                            <label key={kind} className="flex items-center gap-2 text-sm text-zinc-300">
                              <input
                                type="radio"
                                name={`version-${track.id}`}
                                checked={creditDraft.versionKind === kind}
                                onChange={() =>
                                  setCreditDraft((draft) => ({
                                    ...draft,
                                    versionKind: kind,
                                    radioEdit: kind === 'radio',
                                    version:
                                      kind === 'radio'
                                        ? draft.version || 'Radio Edit'
                                        : kind === 'normal'
                                          ? ''
                                          : draft.version,
                                  }))
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        {creditDraft.versionKind === 'other' ? (
                          <input
                            value={creditDraft.version}
                            onChange={(e) =>
                              setCreditDraft((draft) => ({ ...draft, version: e.target.value }))
                            }
                            placeholder="Instrumental, Extended, Live…"
                            className="mt-2 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        ) : null}
                      </fieldset>
                      <label className="text-xs text-zinc-500">
                        Writer(s)
                        <input
                          value={creditDraft.writer}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, writer: e.target.value }))
                          }
                          placeholder="SERGIK"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-zinc-500">
                        Producer(s)
                        <input
                          value={creditDraft.producer}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, producer: e.target.value }))
                          }
                          placeholder="SERGIK"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-zinc-500">
                        Mix engineer
                        <input
                          value={creditDraft.mixer}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, mixer: e.target.value }))
                          }
                          placeholder="SERGIK"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-zinc-500">
                        Mastering engineer
                        <input
                          value={creditDraft.mastering}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, mastering: e.target.value }))
                          }
                          placeholder="SERGIK"
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-zinc-500">
                        Track no.
                        <input
                          type="number"
                          min={1}
                          value={creditDraft.trackNumber}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, trackNumber: e.target.value }))
                          }
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-zinc-500">
                        Language
                        <select
                          value={creditDraft.language}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, language: e.target.value }))
                          }
                          className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          {TRACK_LANGUAGES.map((lang) => (
                            <option key={lang.id} value={lang.id}>
                              {lang.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-300 sm:col-span-1">
                        <input
                          type="checkbox"
                          checked={creditDraft.instrumental}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, instrumental: e.target.checked }))
                          }
                          className="rounded border-zinc-600"
                        />
                        Instrumental
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                        <input
                          type="checkbox"
                          checked={creditDraft.explicit}
                          onChange={(e) =>
                            setCreditDraft((draft) => ({ ...draft, explicit: e.target.checked }))
                          }
                          className="rounded border-zinc-600"
                        />
                        Explicit
                      </label>
                      <div className="sm:col-span-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-3">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                          DSP ingest
                        </p>
                        {(() => {
                          const missing: string[] = []
                          if (!creditDraft.primary.trim()) missing.push('performer')
                          if (!creditDraft.producer.trim()) missing.push('producer')
                          if (!missing.length) {
                            return (
                              <p className="text-[11px] text-emerald-400/90">
                                Apple Music credits ready (performer + producer).
                              </p>
                            )
                          }
                          const fillAs = creditDraft.primary.trim() || albumArtist || 'SERGIK'
                          return (
                            <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 space-y-2">
                              <p className="text-xs text-amber-200">
                                Apple Music needs a {missing.join(' and ')} credit.
                              </p>
                              {missing.includes('producer') ? (
                                <div className="flex flex-wrap items-end gap-2">
                                  <label className="flex-1 min-w-[12rem] text-xs text-zinc-400">
                                    Producer(s)
                                    <input
                                      value={creditDraft.producer}
                                      onChange={(e) =>
                                        setCreditDraft((draft) => ({
                                          ...draft,
                                          producer: e.target.value,
                                        }))
                                      }
                                      placeholder={fillAs}
                                      className="mt-1 w-full bg-zinc-950 border border-amber-800/60 rounded-lg px-3 py-2 text-sm text-white"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCreditDraft((draft) => ({
                                        ...draft,
                                        producer: fillAs,
                                      }))
                                    }
                                    className="shrink-0 rounded-lg border border-amber-700/60 px-3 py-2 text-xs text-amber-100 hover:bg-amber-900/40"
                                  >
                                    Use {fillAs}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )
                        })()}
                        <div className="grid sm:grid-cols-2 gap-3">
                          <fieldset className="text-xs text-zinc-500">
                            <legend className="mb-1">Original or cover</legend>
                            <label className="flex items-center gap-2 text-sm text-zinc-300 mb-1">
                              <input
                                type="radio"
                                name={`origin-${track.id}`}
                                checked={creditDraft.origin === 'original'}
                                onChange={() =>
                                  setCreditDraft((draft) => ({ ...draft, origin: 'original' }))
                                }
                              />
                              I wrote this / original
                            </label>
                            <label className="flex items-center gap-2 text-sm text-zinc-300">
                              <input
                                type="radio"
                                name={`origin-${track.id}`}
                                checked={creditDraft.origin === 'cover'}
                                onChange={() =>
                                  setCreditDraft((draft) => ({ ...draft, origin: 'cover' }))
                                }
                              />
                              Cover song
                            </label>
                          </fieldset>
                          <fieldset className="text-xs text-zinc-500" data-catalog-section="ai">
                            <legend className="mb-1">AI-generated music / vocals / lyrics</legend>
                            <label className="flex items-center gap-2 text-sm text-zinc-300 mb-1">
                              <input
                                type="radio"
                                name={`ai-${track.id}`}
                                checked={creditDraft.aiGenerated === 'no'}
                                onChange={() =>
                                  setCreditDraft((draft) => ({ ...draft, aiGenerated: 'no' }))
                                }
                              />
                              No
                            </label>
                            <label className="flex items-center gap-2 text-sm text-zinc-300">
                              <input
                                type="radio"
                                name={`ai-${track.id}`}
                                checked={creditDraft.aiGenerated === 'yes'}
                                onChange={() =>
                                  setCreditDraft((draft) => ({ ...draft, aiGenerated: 'yes' }))
                                }
                              />
                              Yes
                            </label>
                            <p className="text-[11px] text-zinc-600 mt-1">
                              Mixing or mastering with AI does not count.
                            </p>
                          </fieldset>
                        </div>
                        {creditDraft.origin === 'cover' && (
                          <div className="grid sm:grid-cols-2 gap-3">
                            <label className="text-xs text-zinc-500">
                              Original song title
                              <input
                                value={creditDraft.coverTitle}
                                onChange={(e) =>
                                  setCreditDraft((draft) => ({ ...draft, coverTitle: e.target.value }))
                                }
                                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                              />
                            </label>
                            <label className="text-xs text-zinc-500">
                              Original artist
                              <input
                                value={creditDraft.coverArtist}
                                onChange={(e) =>
                                  setCreditDraft((draft) => ({
                                    ...draft,
                                    coverArtist: e.target.value,
                                  }))
                                }
                                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                              />
                            </label>
                          </div>
                        )}
                        <div className="sm:col-span-2 space-y-2" data-catalog-section="writer-legal">
                          <p className="text-xs text-zinc-500">Collaborator full legal names</p>
                          {seedWriterLegalRows(
                            contributorsFromCreditFields({
                              ...creditDraft,
                              featured: creditDraft.featuredOther ? creditDraft.featured : '',
                              vocalist: creditDraft.vocalist,
                              instruments: creditDraft.instruments,
                            }),
                            serializeWriterLegalNames(creditDraft.writerLegals),
                          ).map((row) => (
                            <label key={row.stage} className="block text-xs text-zinc-500">
                              {row.stage}
                              <span className="text-zinc-600"> · stage name</span>
                              <input
                                data-writer-legal-stage={row.stage.toLowerCase()}
                                value={
                                  creditDraft.writerLegals.find(
                                    (item) => item.stage.toLowerCase() === row.stage.toLowerCase(),
                                  )?.legal ?? row.legal
                                }
                                onChange={(e) =>
                                  setCreditDraft((draft) => {
                                    const legal = e.target.value
                                    const existing = draft.writerLegals.filter(
                                      (item) => item.stage.toLowerCase() !== row.stage.toLowerCase(),
                                    )
                                    return {
                                      ...draft,
                                      writerLegals: [...existing, { stage: row.stage, legal }],
                                    }
                                  })
                                }
                                placeholder={
                                  row.stage.toLowerCase() === 'sergik'
                                    ? US_ISRC_REGISTRANT.name
                                    : 'First and last legal name'
                                }
                                className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                              />
                            </label>
                          ))}
                          <span className="text-[11px] text-zinc-600 block">
                            PROs and Apple need a real first + last name for every billed, featured, and vocalist collaborator — not the stage name.
                          </span>
                        </div>
                        {creditDraft.versionKind === 'radio' && (
                          <label className="text-xs text-zinc-500 block">
                            Explicit version ISRC
                            <input
                              value={creditDraft.pairedExplicitIsrc}
                              onChange={(e) =>
                                setCreditDraft((draft) => ({
                                  ...draft,
                                  pairedExplicitIsrc: e.target.value.toUpperCase(),
                                }))
                              }
                              placeholder="QT-A53-26-00001"
                              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                            />
                          </label>
                        )}
                        <fieldset className="text-xs text-zinc-500">
                          <legend className="mb-1">Preview clip start (TikTok, Apple, iTunes)</legend>
                          <label className="flex items-center gap-2 text-sm text-zinc-300 mb-1">
                            <input
                              type="radio"
                              name={`preview-${track.id}`}
                              checked={creditDraft.previewMode === 'auto'}
                              onChange={() =>
                                setCreditDraft((draft) => ({ ...draft, previewMode: 'auto' }))
                              }
                            />
                            Let streaming services decide
                          </label>
                          <label className="flex items-center gap-2 text-sm text-zinc-300">
                            <input
                              type="radio"
                              name={`preview-${track.id}`}
                              checked={creditDraft.previewMode === 'custom'}
                              onChange={() =>
                                setCreditDraft((draft) => ({ ...draft, previewMode: 'custom' }))
                              }
                            />
                            Start at
                            <input
                              type="number"
                              min={0}
                              disabled={creditDraft.previewMode !== 'custom'}
                              value={creditDraft.previewStart}
                              onChange={(e) =>
                                setCreditDraft((draft) => ({
                                  ...draft,
                                  previewStart: e.target.value,
                                }))
                              }
                              className="w-20 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-white disabled:opacity-40"
                            />
                            seconds
                          </label>
                        </fieldset>
                        <label className="text-xs text-zinc-500 sm:col-span-2 block">
                          Lyrics
                          <textarea
                            value={creditDraft.lyrics}
                            onChange={(e) =>
                              setCreditDraft((draft) => ({ ...draft, lyrics: e.target.value }))
                            }
                            rows={6}
                            placeholder="Paste lyrics for press notes, UGC, and DSP metadata."
                            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white leading-relaxed"
                          />
                        </label>
                        {(() => {
                          const billed = contributorsFromCreditFields({
                            ...creditDraft,
                            featured: creditDraft.featuredOther ? creditDraft.featured : '',
                            vocalist: creditDraft.vocalist,
                            instruments: creditDraft.instruments,
                          })
                          const preview = previewStoreTitle({
                            title: creditDraft.title || track.title,
                            version:
                              creditDraft.versionKind === 'normal' ? null : creditDraft.version,
                            featured: namesForRole(billed, 'featured'),
                            remixer: creditDraft.remixer
                              ? creditDraft.remixer.split(',').map((name) => name.trim())
                              : [],
                            billedArtists: namesForRole(billed, 'primary'),
                            origin: creditDraft.origin === 'cover' ? 'cover' : 'original',
                            coverOriginalArtist: creditDraft.coverArtist,
                          })
                          return (
                            <div className="rounded-lg border border-zinc-800 p-3">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                                Song title preview
                              </p>
                              <p className="text-white font-medium">{preview.display}</p>
                              <p className="text-sm text-zinc-400">
                                {displayArtistLine(billed, albumArtist || 'SERGIK')}
                              </p>
                              {preview.warnings.length > 0 && (
                                <ul className="mt-2 text-xs text-amber-300 space-y-1 list-disc list-inside">
                                  {preview.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => void saveCredits(track.id)}
                          disabled={savingCredits}
                          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-50"
                        >
                          <FaSave />
                          {savingCredits ? 'Saving…' : 'Save credits'}
                        </button>
                      </div>
                    </div>
                  )}

                  {pasteId === track.id && (
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={pasteValue}
                        onChange={(e) => setPasteValue(e.target.value.toUpperCase())}
                        placeholder="QT-A53-26-00001"
                        className="flex-1 min-w-[200px] bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => void savePastedIsrc(track.id)}
                        disabled={savingPaste}
                        className="text-xs px-3 py-1.5 rounded-full bg-violet-600 text-white disabled:opacity-50"
                      >
                        Save code
                      </button>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex flex-wrap gap-2">
                      {splits.length > 0 ? (
                        splits.map((s) => (
                          <button
                            type="button"
                            key={`${s.name}-${s.role || 'performer'}`}
                            onClick={() => startEditSplits(track)}
                            title="Edit splits"
                            className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                          >
                            {s.name}
                            {s.legal_name ? ` (${s.legal_name})` : ''}: {s.percentage}%
                            {s.role ? ` · ${s.role}` : ''}
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditSplits(track)}
                          title="Edit splits"
                          className="text-xs px-2 py-1 rounded-full border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200"
                        >
                          Add splits
                        </button>
                      )}
                      {splits.length > 0 && Math.abs(splitTotal - 100) > 0.01 && (
                        <button
                          type="button"
                          onClick={() => startEditSplits(track)}
                          title="Edit splits"
                          className="text-xs text-amber-400 hover:text-amber-300"
                        >
                          Total {splitTotal}%
                        </button>
                      )}
                    </div>
                  )}

                  {isEditing && (
                    <div
                      data-catalog-section="splits"
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-3"
                    >
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSplitRows(
                              splitsFromCredits(track.contributors, track.writer_legal_names),
                            )
                          }
                          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                        >
                          Seed from credits
                        </button>
                        <button
                          type="button"
                          onClick={equalizeSplitRows}
                          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                        >
                          Equal shares
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSplitRows((rows) => [
                              ...rows,
                              {
                                name: '',
                                percentage: 0,
                                legal_name: '',
                                role: 'performer',
                                publisher: null,
                                ipi: null,
                                pro: null,
                              },
                            ])
                          }
                          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                        >
                          Add party
                        </button>
                        <span
                          className={`text-xs px-2 py-1.5 ${
                            Math.abs(splitRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) - 100) <
                            0.01
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          Total {Math.round(splitRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) * 100) / 100}%
                        </span>
                      </div>
                      <div className="space-y-2">
                        {splitRows.map((row, index) => (
                          <div key={`${row.name}-${index}`} className="grid sm:grid-cols-6 gap-2">
                            <input
                              value={row.name}
                              onChange={(e) => updateSplitRow(index, { name: e.target.value })}
                              placeholder="Artist / party"
                              className="sm:col-span-2 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                            />
                            <input
                              value={row.legal_name || ''}
                              onChange={(e) => updateSplitRow(index, { legal_name: e.target.value })}
                              placeholder="Legal name"
                              className="sm:col-span-2 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={row.percentage}
                              onChange={(e) =>
                                updateSplitRow(index, { percentage: Number(e.target.value) || 0 })
                              }
                              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                            />
                            <select
                              value={row.role || 'performer'}
                              onChange={(e) => updateSplitRow(index, { role: e.target.value })}
                              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                            >
                              {SPLIT_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                            <input
                              value={row.publisher || ''}
                              onChange={(e) => updateSplitRow(index, { publisher: e.target.value })}
                              placeholder="Publisher"
                              className="sm:col-span-2 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                            />
                            <input
                              value={row.ipi || ''}
                              onChange={(e) => updateSplitRow(index, { ipi: e.target.value })}
                              placeholder="IPI"
                              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white font-mono"
                            />
                            <select
                              value={row.pro || ''}
                              onChange={(e) => updateSplitRow(index, { pro: e.target.value || null })}
                              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                            >
                              <option value="">PRO</option>
                              {SPLIT_PROS.map((pro) => (
                                <option key={pro} value={pro}>
                                  {pro}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setSplitRows((rows) => rows.filter((_, i) => i !== index))
                              }
                              className="text-xs text-zinc-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => saveSplits(track.id)}
                        disabled={savingSplits}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-50"
                      >
                        <FaSave />
                        Save splits
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

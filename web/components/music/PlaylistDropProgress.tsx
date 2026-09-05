'use client'

export type PlaylistDropItemState =
  | 'queued'
  | 'uploading'
  | 'converting'
  | 'processing'
  | 'added'
  | 'matched'
  | 'exists'
  | 'failed'

export type PlaylistDropItem = {
  id: string
  name: string
  sizeLabel: string
  state: PlaylistDropItemState
  percent: number
  detail?: string
}

const STATE_LABEL: Record<PlaylistDropItemState, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  converting: 'Converting',
  processing: 'Adding to vault',
  added: 'Added',
  matched: 'Matched existing',
  exists: 'Already in playlist',
  failed: 'Failed',
}

const DONE_STATES: PlaylistDropItemState[] = ['added', 'matched', 'exists', 'failed']

export function playlistDropOverallPercent(items: PlaylistDropItem[]): number {
  if (!items.length) return 0
  const sum = items.reduce((acc, item) => acc + Math.max(0, Math.min(100, item.percent)), 0)
  return Math.round(sum / items.length)
}

function stateTone(state: PlaylistDropItemState): string {
  if (state === 'failed') return 'text-red-300'
  if (state === 'added' || state === 'matched') return 'text-teal-300'
  if (state === 'exists') return 'text-gray-400'
  return 'text-purple-200'
}

function barTone(state: PlaylistDropItemState): string {
  if (state === 'failed') return 'bg-red-400'
  if (state === 'added' || state === 'matched') return 'bg-teal-400'
  if (state === 'exists') return 'bg-gray-500'
  return 'bg-purple-400'
}

export default function PlaylistDropProgress({
  items,
  playlistName,
  compact = false,
}: {
  items: PlaylistDropItem[]
  playlistName?: string
  compact?: boolean
}) {
  if (!items.length) return null
  const overall = playlistDropOverallPercent(items)
  const done = items.filter((item) => DONE_STATES.includes(item.state)).length
  const failed = items.filter((item) => item.state === 'failed').length
  const active = items.find((item) => !DONE_STATES.includes(item.state))

  return (
    <div className={compact ? 'w-full text-left' : 'mx-auto w-full max-w-xl text-left'}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">
            {done < items.length
              ? `Adding to${playlistName ? ` “${playlistName}”` : ' playlist'}…`
              : failed
                ? `Finished with ${failed} failure${failed === 1 ? '' : 's'}`
                : 'All tracks added'}
          </p>
          <p className="text-[11px] text-gray-400">
            {done} of {items.length}
            {active ? ` · ${STATE_LABEL[active.state]} ${active.name}` : ''}
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums text-white">{overall}%</p>
      </div>
      <div
        className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={overall}
        aria-label="Playlist drop progress"
      >
        <div
          className="h-full rounded-full bg-purple-400 transition-[width] duration-300"
          style={{ width: `${overall}%` }}
        />
      </div>
      <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border border-gray-800 bg-black/30 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-gray-100">{item.name}</p>
              <p className="shrink-0 text-[11px] tabular-nums text-gray-400">{item.percent}%</p>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${barTone(item.state)}`}
                style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className={`text-[11px] ${stateTone(item.state)}`}>
                {STATE_LABEL[item.state]}
                {item.detail ? ` · ${item.detail}` : ''}
              </p>
              <p className="text-[10px] text-gray-600">{item.sizeLabel}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

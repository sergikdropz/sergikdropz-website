'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  FaBrain,
  FaCopy,
  FaEllipsisV,
  FaExternalLinkAlt,
  FaFolderOpen,
  FaLink,
  FaPen,
  FaPlus,
  FaRocket,
  FaTrash,
} from 'react-icons/fa'
import { Dialog } from '@/components/ui/Dialog'
import { useNotifications } from '@/contexts/NotificationContext'
import { dispatchAdminAiPrompt } from '@/lib/admin-ai-client'
import type { StudioRelease } from '@/lib/api/studio-hooks'
import { queryKeys } from '@/lib/api/query-keys'
import { getStudioStepAiPrompt } from '@/lib/studio/admin-ai-step-prompts'
import { STATUS_STYLES, WORKFLOW_STEPS, type WorkflowStepId } from '@/lib/studio/constants'
import {
  studioReleaseHref,
  studioReleasePublicHref,
  workflowStepForActionKind,
} from '@/lib/studio/studio-ia'
import AddTracksModal from './AddTracksModal'
import ReleaseReadinessRing from './ReleaseReadinessRing'
import StudioContextMenu, { type StudioContextMenuEntry } from './StudioContextMenu'

type MenuAnchor = { x: number; y: number }

type Props = {
  release: StudioRelease
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export default function StudioReleaseCard({ release }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { showNotification } = useNotifications()
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(release.title)
  const [renaming, setRenaming] = useState(false)
  const [addTracksOpen, setAddTracksOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const statusKey = release.distributor_status || 'draft'
  const st = STATUS_STYLES[statusKey] || STATUS_STYLES.draft
  const score = release.copyright?.readiness_score ?? 0
  const nextKind = release.copyright?.next_best_action?.kind
  const nextLabel = release.copyright?.next_best_action?.label || release.copyright?.blockers?.[0]
  const nextStep = workflowStepForActionKind(nextKind)
  const openHref = studioReleaseHref(release.id)
  const isLive = statusKey === 'live'

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY })
  }, [])

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['studio', 'releases'] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.studio.release(release.id) })
  }, [queryClient, release.id])

  const openStep = useCallback(
    (step?: WorkflowStepId | null, newTab = false) => {
      const href = studioReleaseHref(release.id, step)
      if (newTab) {
        window.open(href, '_blank', 'noopener,noreferrer')
        return
      }
      router.push(href)
    },
    [release.id, router]
  )

  const askAi = useCallback(
    (step: WorkflowStepId) => {
      const prompt = getStudioStepAiPrompt(step, release.id, release.title)
      dispatchAdminAiPrompt({
        message: prompt.message,
        agentMode: prompt.agentMode,
      })
    },
    [release.id, release.title]
  )

  const renameRelease = useCallback(async () => {
    const title = renameValue.trim()
    if (!title || title === release.title) {
      setRenameOpen(false)
      return
    }
    setRenaming(true)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(release.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Rename failed')
      showNotification('Release renamed', 'success')
      setRenameOpen(false)
      invalidate()
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Rename failed', 'error')
    } finally {
      setRenaming(false)
    }
  }, [invalidate, release.id, release.title, renameValue, showNotification])

  const duplicateRelease = useCallback(async () => {
    setBusy(true)
    try {
      const sourceRes = await fetch(`/api/studio/releases/${encodeURIComponent(release.id)}`)
      const source = await sourceRes.json().catch(() => ({}))
      if (!sourceRes.ok) throw new Error(source.error || 'Could not load release')
      const original = source.release || release
      const id = `release-${Date.now()}`
      const res = await fetch('/api/studio/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: `${original.title || release.title} (copy)`,
          type: original.type || release.type || 'single',
          release_date: original.release_date || null,
          artwork_url: original.artwork_url || release.artwork_url || null,
          description: original.description || null,
          explicit: Boolean(original.explicit),
          genre: original.genre || null,
          subgenre: original.subgenre || null,
          label_name: original.label_name || null,
          marketing_copy: original.marketing_copy || {},
          distribution_mode: original.distribution_mode || 'self',
          target_stores: original.target_stores || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Duplicate failed')
      showNotification('Draft copy created', 'success')
      invalidate()
      router.push(studioReleaseHref(id))
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Duplicate failed', 'error')
    } finally {
      setBusy(false)
    }
  }, [invalidate, release, router, showNotification])

  const goLive = useCallback(
    async (force = false) => {
      const ok = window.confirm(
        force
          ? `Force go-live for “${release.title}”? This bypasses strict rights checks.`
          : `Go live with “${release.title}”? This publishes on SERGIK and creates campaign + smart link.`
      )
      if (!ok) return
      setBusy(true)
      try {
        const res = await fetch(`/api/studio/releases/${encodeURIComponent(release.id)}/go-live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const blockers = Array.isArray(data.blockers) ? data.blockers.join(' ') : ''
          throw new Error(data.error || blockers || 'Go-live failed')
        }
        showNotification(force ? 'Force launched' : 'Release is live', 'success')
        invalidate()
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'Go-live failed', 'error')
      } finally {
        setBusy(false)
      }
    },
    [invalidate, release.id, release.title, showNotification]
  )

  const deleteRelease = useCallback(async () => {
    if (!window.confirm(`Delete “${release.title}”? This cannot be undone.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/studio/releases/${encodeURIComponent(release.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      showNotification('Release deleted', 'success')
      invalidate()
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Delete failed', 'error')
    } finally {
      setBusy(false)
    }
  }, [invalidate, release.id, release.title, showNotification])

  const items = useMemo<StudioContextMenuEntry[]>(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const studioUrl = `${origin}${openHref}`
    const publicPath = studioReleasePublicHref(release.id)
    return [
      {
        type: 'command',
        command: {
          id: 'open',
          label: 'Open',
          shortcut: '↵',
          icon: <FaFolderOpen className="h-3 w-3" />,
          onSelect: () => openStep(),
        },
      },
      {
        type: 'command',
        command: {
          id: 'open-tab',
          label: 'Open in new tab',
          icon: <FaExternalLinkAlt className="h-3 w-3" />,
          onSelect: () => openStep(null, true),
        },
      },
      { type: 'separator' },
      { type: 'heading', label: 'Edit' },
      {
        type: 'command',
        command: {
          id: 'rename',
          label: 'Rename…',
          icon: <FaPen className="h-3 w-3" />,
          onSelect: () => {
            setRenameValue(release.title)
            setRenameOpen(true)
          },
        },
      },
      {
        type: 'command',
        command: {
          id: 'add-tracks',
          label: 'Add tracks…',
          icon: <FaPlus className="h-3 w-3" />,
          onSelect: () => setAddTracksOpen(true),
        },
      },
      {
        type: 'command',
        command: {
          id: 'edit-metadata',
          label: 'Edit metadata',
          icon: <FaPen className="h-3 w-3" />,
          onSelect: () => openStep('metadata'),
        },
      },
      {
        type: 'command',
        command: {
          id: 'duplicate',
          label: busy ? 'Duplicating…' : 'Duplicate as draft',
          icon: <FaCopy className="h-3 w-3" />,
          disabled: busy,
          onSelect: () => void duplicateRelease(),
        },
      },
      { type: 'separator' },
      { type: 'heading', label: 'Workflow' },
      ...WORKFLOW_STEPS.map((step) => ({
        type: 'command' as const,
        command: {
          id: `step-${step.id}`,
          label: step.label,
          shortcut: nextStep === step.id ? 'Next' : undefined,
          onSelect: () => openStep(step.id),
        },
      })),
      ...(nextLabel
        ? [
            {
              type: 'command' as const,
              command: {
                id: 'next-action',
                label: nextLabel,
                onSelect: () => {
                  if (nextKind === 'assign_tracks') {
                    setAddTracksOpen(true)
                    return
                  }
                  openStep(nextStep)
                },
              },
            },
          ]
        : []),
      { type: 'separator' },
      { type: 'heading', label: 'Commands' },
      {
        type: 'command',
        command: {
          id: 'copy-link',
          label: 'Copy studio link',
          icon: <FaLink className="h-3 w-3" />,
          onSelect: () => {
            void copyText(studioUrl).then(() => showNotification('Studio link copied', 'success'))
          },
        },
      },
      {
        type: 'command',
        command: {
          id: 'copy-id',
          label: 'Copy release ID',
          icon: <FaCopy className="h-3 w-3" />,
          onSelect: () => {
            void copyText(release.id).then(() => showNotification('Release ID copied', 'success'))
          },
        },
      },
      {
        type: 'command',
        command: {
          id: 'public-page',
          label: isLive ? 'Open public page' : 'Preview public page',
          icon: <FaExternalLinkAlt className="h-3 w-3" />,
          onSelect: () => window.open(publicPath, '_blank', 'noopener,noreferrer'),
        },
      },
      {
        type: 'command',
        command: {
          id: 'ask-ai',
          label: 'Ask AI about this release',
          icon: <FaBrain className="h-3 w-3 text-violet-400" />,
          onSelect: () => askAi(nextStep),
        },
      },
      ...(!isLive
        ? [
            {
              type: 'command' as const,
              command: {
                id: 'go-live',
                label: busy ? 'Publishing…' : 'Go live on SERGIK',
                icon: <FaRocket className="h-3 w-3" />,
                disabled: busy,
                onSelect: () => void goLive(false),
              },
            },
          ]
        : []),
      { type: 'separator' },
      {
        type: 'command',
        command: {
          id: 'delete',
          label: 'Delete release',
          icon: <FaTrash className="h-3 w-3" />,
          danger: true,
          disabled: busy,
          onSelect: () => void deleteRelease(),
        },
      },
    ]
  }, [
    askAi,
    busy,
    deleteRelease,
    duplicateRelease,
    goLive,
    isLive,
    nextKind,
    nextLabel,
    nextStep,
    openHref,
    openStep,
    release.id,
    release.title,
    showNotification,
  ])

  return (
    <>
      <Link
        href={openHref}
        className="group relative cursor-context-menu bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 hover:border-violet-500/50 transition-all"
        onContextMenu={openMenu}
      >
        <button
          type="button"
          aria-label={`Actions for ${release.title}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(menu)}
          className="absolute top-3 right-3 z-10 rounded-lg p-2 text-zinc-400 opacity-80 transition hover:bg-zinc-800 hover:text-white md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const box = event.currentTarget.getBoundingClientRect()
            setMenu({ x: box.right - 8, y: box.bottom + 4 })
          }}
          onContextMenu={openMenu}
        >
          <FaEllipsisV className="h-3 w-3" />
        </button>
        <div className="flex gap-4 mb-2">
          {release.artwork_url ? (
            <img
              src={release.artwork_url}
              alt=""
              className="w-20 h-20 rounded-xl object-cover shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-zinc-800 shrink-0" />
          )}
          <div className="min-w-0 flex-1 pr-6">
            <h3 className="text-lg font-semibold truncate">{release.title}</h3>
            <p className="text-sm text-zinc-500 capitalize">{release.type}</p>
            <span
              className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${st.bg} ${st.text}`}
            >
              {st.label}
            </span>
          </div>
          <ReleaseReadinessRing score={score} size={48} />
        </div>
        {release.copyright?.blockers?.[0] && (
          <p className="text-xs text-amber-400/90 line-clamp-1">
            {release.copyright.blockers[0]}
          </p>
        )}
      </Link>

      <StudioContextMenu
        open={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        title={release.title}
        items={items}
        onClose={closeMenu}
      />

      <Dialog
        open={renameOpen}
        title="Rename release"
        onClose={() => {
          if (!renaming) setRenameOpen(false)
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void renameRelease()
          }}
          className="space-y-4"
        >
          <label className="block text-sm text-zinc-400">
            Title
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              onClick={() => setRenameOpen(false)}
              disabled={renaming}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              disabled={renaming || !renameValue.trim()}
            >
              {renaming ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Dialog>

      <AddTracksModal
        releaseId={release.id}
        releaseTitle={release.title}
        open={addTracksOpen}
        onClose={() => setAddTracksOpen(false)}
        onAttached={() => {
          setAddTracksOpen(false)
          invalidate()
        }}
      />
    </>
  )
}

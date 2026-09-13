'use client'

import { useState } from 'react'
import { DSP_STORES, type DspStoreId } from '@/lib/studio/constants'
import { FaExternalLinkAlt, FaPlus, FaTrash } from 'react-icons/fa'

export type StoreLinkRow = {
  id: string
  store: string
  url: string
}

type Props = {
  targetStores: DspStoreId[]
  storeLinks: StoreLinkRow[]
  onTargetsChange: (stores: DspStoreId[]) => void
  onAddLink: (store: string, url: string) => void
  onRemoveLink: (id: string) => void
}

export default function DspDeliveryBoard({
  targetStores,
  storeLinks,
  onTargetsChange,
  onAddLink,
  onRemoveLink,
}: Props) {
  const [newStore, setNewStore] = useState<DspStoreId>(DSP_STORES[0].id)
  const [newUrl, setNewUrl] = useState('')

  function toggleTarget(id: DspStoreId) {
    if (targetStores.includes(id)) {
      onTargetsChange(targetStores.filter((s) => s !== id))
    } else {
      onTargetsChange([...targetStores, id])
    }
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newUrl.trim()) return
    onAddLink(newStore, newUrl.trim())
    setNewUrl('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Target DSPs</h3>
        <div className="flex flex-wrap gap-2">
          {DSP_STORES.map((dsp) => {
            const selected = targetStores.includes(dsp.id)
            return (
              <button
                key={dsp.id}
                type="button"
                onClick={() => toggleTarget(dsp.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  selected
                    ? 'border-white/30 text-white'
                    : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                }`}
                style={
                  selected
                    ? { boxShadow: `0 0 20px ${dsp.color}33`, borderColor: dsp.color }
                    : undefined
                }
              >
                {dsp.name}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Live store links</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-4">
          <select
            value={newStore}
            onChange={(e) => setNewStore(e.target.value as DspStoreId)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {DSP_STORES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://open.spotify.com/..."
            className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium"
          >
            <FaPlus className="text-xs" />
            Add link
          </button>
        </form>
        <div className="space-y-2">
          {storeLinks.length === 0 ? (
            <p className="text-sm text-zinc-600">
              Paste links as each platform goes live — your site pulls from here.
            </p>
          ) : (
            storeLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 group"
              >
                <span className="text-xs font-medium text-zinc-400 w-24 capitalize">
                  {link.store.replace(/_/g, ' ')}
                </span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-violet-300 hover:text-violet-200 truncate flex items-center gap-1"
                >
                  {link.url}
                  <FaExternalLinkAlt className="text-[10px] shrink-0" />
                </a>
                <button
                  type="button"
                  onClick={() => onRemoveLink(link.id)}
                  className="p-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  title="Remove link"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

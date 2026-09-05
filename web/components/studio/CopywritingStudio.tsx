'use client'

import { useState } from 'react'
import AiField from '@/components/AiField'
import { COPY_TEMPLATES, type MarketingCopy } from '@/lib/studio/constants'
import { dispatchAdminAiPrompt } from '@/lib/admin-ai-client'
import { FaBrain, FaCopy, FaPen } from 'react-icons/fa'

type Props = {
  title: string
  genre?: string | null
  releaseId?: string
  copy: MarketingCopy
  onChange: (copy: MarketingCopy) => void
  onSave: () => void
  saving?: boolean
}

export default function CopywritingStudio({
  title,
  genre,
  releaseId,
  copy,
  onChange,
  onSave,
  saving,
}: Props) {
  const [activeField, setActiveField] = useState<keyof MarketingCopy>('elevator_pitch')

  function updateField(key: keyof MarketingCopy, value: string) {
    onChange({ ...copy, [key]: value })
  }

  function fillFromTemplate() {
    const g = genre || 'electronic'
    const templates: MarketingCopy = {
      elevator_pitch: `${title} — a new ${g} release from SERGIK, built for club systems and late-night listening.`,
      press_blurb: `SERGIK unveils "${title}", continuing a run of ${g} productions shaped by hardware synths and meticulous sound design. Available on all major platforms.`,
      spotify_pitch: `Mood: ${g}, driving, cinematic. For fans of modern techno and leftfield club music. ${title} is a focused statement track with strong playlist fit.`,
      social_caption: `🎧 "${title}" is out now — stream everywhere. Link in bio. #newmusic #${g.replace(/\s+/g, '')}`,
      store_description: `${title}\n\nTracklist and production notes. Written, produced, and mixed by SERGIK.`,
      credits_block: `Written & produced by SERGIK.\nPublished © ${new Date().getFullYear()} SERGIK. All rights reserved.`,
    }
    onChange({ ...copy, ...templates })
  }

  async function copyActive() {
    const text = copy[activeField] || ''
    if (!text) return
    await navigator.clipboard.writeText(text)
  }

  const meta = COPY_TEMPLATES[activeField]

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
      data-ai-scope={JSON.stringify({
        entityType: 'distribution_release',
        entityId: releaseId,
        entityLabel: title,
        formId: 'release_marketing_copy',
      })}
    >
      <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FaPen className="text-violet-400" />
          <h3 className="text-lg font-semibold text-white">Copywriting studio</h3>
        </div>
        <div className="flex gap-2">
          {releaseId ? (
            <button
              type="button"
              onClick={() =>
                dispatchAdminAiPrompt({
                  agentMode: 'studio_release',
                  message: [
                    `Draft marketing copy for "${title}" (${releaseId}).`,
                    `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
                    `Then /exec patch_release_marketing_copy ${JSON.stringify({
                      releaseId,
                      marketingCopy: {
                        elevator_pitch: '',
                        spotify_pitch: '',
                        social_caption: '',
                        press_blurb: '',
                      },
                      merge: true,
                    })}`,
                    'Approve the preview to write into Copywriting Studio.',
                  ].join('\n'),
                })
              }
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-violet-500/50 text-violet-100 hover:bg-violet-500/15 transition"
            >
              <FaBrain />
              Draft with AI
            </button>
          ) : null}
          <button
            type="button"
            onClick={fillFromTemplate}
            className="text-xs px-3 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 transition"
          >
            Auto-draft from metadata
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="text-xs px-4 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : 'Save copy'}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row min-h-[320px]">
        <div className="md:w-48 border-b md:border-b-0 md:border-r border-zinc-800 p-2 flex md:flex-col gap-1 overflow-x-auto">
          {(Object.keys(COPY_TEMPLATES) as (keyof MarketingCopy)[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveField(key)}
              className={`text-left px-3 py-2 rounded-lg text-xs whitespace-nowrap transition ${
                activeField === key
                  ? 'bg-violet-600/20 text-violet-200'
                  : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {COPY_TEMPLATES[key].label}
            </button>
          ))}
        </div>
        <div className="flex-1 p-5">
          <p className="text-xs text-zinc-500 mb-2">{meta.hint}</p>
          <AiField
            as="textarea"
            fieldKey={`release.marketing_copy.${activeField}`}
            label={meta.label}
            entityType="distribution_release"
            entityId={releaseId}
            entityLabel={title}
            formId="release_marketing_copy"
            hint={meta.hint}
            value={copy[activeField] || ''}
            onChange={(e) => updateField(activeField, e.target.value)}
            placeholder={meta.placeholder}
            rows={10}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-y min-h-[200px]"
          />
          <button
            type="button"
            onClick={copyActive}
            className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition"
          >
            <FaCopy />
            Copy to clipboard
          </button>
        </div>
      </div>
    </div>
  )
}

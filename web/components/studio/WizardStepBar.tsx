'use client'

import { FaCheck } from 'react-icons/fa'

export type WizardStep = {
  id: string
  label: string
  description?: string
}

type Props = {
  steps: WizardStep[]
  currentIndex: number
  onStepClick?: (index: number) => void
}

export default function WizardStepBar({ steps, currentIndex, onStepClick }: Props) {
  return (
    <ol className="flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between mb-8">
      {steps.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li key={step.id} className="flex-1">
            <button
              type="button"
              disabled={!onStepClick || index > currentIndex}
              onClick={() => onStepClick?.(index)}
              className={`w-full flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 px-3 py-3 rounded-xl border text-left transition ${
                active
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : done
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-zinc-800 bg-zinc-900/30 opacity-60'
              } ${onStepClick && index <= currentIndex ? 'cursor-pointer hover:border-zinc-600' : 'cursor-default'}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : active
                      ? 'bg-violet-500/30 text-violet-200'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {done ? <FaCheck className="text-[10px]" /> : index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{step.label}</span>
                {step.description && (
                  <span className="block text-[11px] text-zinc-500 mt-0.5">
                    {step.description}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

'use client'

import { WORKFLOW_STEPS, type WorkflowStepId } from '@/lib/studio/constants'
import { FaCheck, FaBrain } from 'react-icons/fa'

type Props = {
  activeStep: WorkflowStepId
  completedSteps: WorkflowStepId[]
  onStepClick?: (step: WorkflowStepId) => void
  onCompleteWithAi?: (step: WorkflowStepId) => void
}

export default function WorkflowStepper({
  activeStep,
  completedSteps,
  onStepClick,
  onCompleteWithAi,
}: Props) {
  return (
    <ol className="flex flex-wrap gap-2 md:gap-0 md:flex-nowrap md:justify-between relative">
      {WORKFLOW_STEPS.map((step, index) => {
        const done = completedSteps.includes(step.id)
        const active = step.id === activeStep
        return (
          <li key={step.id} className="flex-1 min-w-[7rem] md:min-w-0">
            <button
              type="button"
              onClick={() => onStepClick?.(step.id)}
              disabled={!onStepClick}
              className={`w-full text-left px-2 py-3 rounded-lg transition border ${
                active
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : done
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-transparent hover:border-zinc-700 hover:bg-zinc-900/50'
              } ${onStepClick ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mb-2 ${
                  done
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : active
                      ? 'bg-violet-500/30 text-violet-200'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {done ? <FaCheck className="text-[10px]" /> : index + 1}
              </div>
              <span className="block text-xs font-semibold text-white">{step.label}</span>
              <span className="block text-[10px] text-zinc-500 mt-0.5 leading-tight">
                {step.description}
              </span>
              {onCompleteWithAi && active && !done ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCompleteWithAi(step.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      onCompleteWithAi(step.id)
                    }
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-950/40 px-2 py-0.5 text-[9px] font-medium text-violet-200 hover:bg-violet-900/50"
                >
                  <FaBrain className="text-[8px]" />
                  AI complete
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

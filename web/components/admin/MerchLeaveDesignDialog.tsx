'use client'

type Props = {
  open: boolean
  detail: string
  busy?: boolean
  onKeepWorking: () => void
  onDiscard: () => void
  onSaveAndContinue: () => void
}

export default function MerchLeaveDesignDialog({
  open,
  detail,
  busy = false,
  onKeepWorking,
  onDiscard,
  onSaveAndContinue,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merch-leave-title"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-5 text-white shadow-2xl"
      >
        <h2 id="merch-leave-title" className="text-base font-semibold">
          This design isn’t saved
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{detail}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onSaveAndContinue}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save draft and continue'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-40"
          >
            Discard and continue
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onKeepWorking}
            className="rounded-lg px-4 py-2.5 text-sm text-white/70 hover:text-white disabled:opacity-40"
          >
            Keep working
          </button>
        </div>
      </div>
    </div>
  )
}

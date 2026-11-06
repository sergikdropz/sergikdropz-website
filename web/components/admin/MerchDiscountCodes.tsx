'use client'

import { useEffect, useState } from 'react'
import { discountLabel, type MerchDiscount, type MerchDiscountType } from '@/lib/merch/discount'

const emptyDraft = { code: '', type: 'percent' as MerchDiscountType, value: '20', expiresAt: '' }

export default function MerchDiscountCodes() {
  const [codes, setCodes] = useState<MerchDiscount[]>([])
  const [draft, setDraft] = useState(emptyDraft)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/admin/merch/discounts')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load codes'))))
      .then((data) => {
        if (!cancelled) setCodes(Array.isArray(data.codes) ? data.codes : [])
      })
      .catch((error: unknown) => {
        if (!cancelled) setNote(error instanceof Error ? error.message : 'Could not load codes')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function save(next: MerchDiscount[]) {
    setSaving(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/merch/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save codes')
      setCodes(Array.isArray(data.codes) ? data.codes : next)
      setNote('Discount codes saved.')
      return true
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Could not save codes')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function addCode() {
    const value = Number(draft.value)
    const type = draft.type
    const row: MerchDiscount = {
      code: draft.code,
      type,
      value,
      label: discountLabel(type, value),
      active: true,
      expiresAt: draft.expiresAt || null,
    }
    const saved = await save([...codes, row])
    if (saved) setDraft(emptyDraft)
  }

  return (
    <section className="mx-auto mb-8 max-w-xl rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-left">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-sm text-white"
      >
        <span className="font-semibold">Discount codes</span>
        <span className="text-xs text-gray-500">{open ? 'Hide' : 'Edit'}</span>
      </button>
      {open ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">
            Fans enter a code on the product page. Checkout charges the discounted price.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_7rem_6rem_auto]">
            <input
              aria-label="New discount code"
              value={draft.code}
              onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
              placeholder="Code"
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm uppercase text-white"
            />
            <select
              aria-label="Discount type"
              value={draft.type}
              onChange={(event) =>
                setDraft((current) => ({ ...current, type: event.target.value as MerchDiscountType }))
              }
              className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-white"
            >
              <option value="percent">Percent</option>
              <option value="amount">Dollars</option>
            </select>
            <input
              aria-label="Discount amount"
              inputMode="decimal"
              value={draft.value}
              onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              disabled={saving || draft.code.trim().length < 2}
              onClick={() => void addCode()}
              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <label className="flex items-center justify-between gap-3 text-xs text-gray-400">
            Expires
            <input
              type="date"
              aria-label="Discount expiry"
              value={draft.expiresAt}
              onChange={(event) => setDraft((current) => ({ ...current, expiresAt: event.target.value }))}
              className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-white"
            />
          </label>
          {codes.length === 0 ? <p className="text-xs text-gray-500">No codes yet.</p> : null}
          <ul className="space-y-2">
            {codes.map((code) => (
              <li key={code.code} className="flex items-center justify-between gap-3 text-sm text-white">
                <span>
                  <span className="font-semibold tracking-wide">{code.code}</span>
                  <span className="text-gray-400"> · {code.label}</span>
                  {code.expiresAt ? <span className="text-gray-500"> · until {code.expiresAt.slice(0, 10)}</span> : null}
                  {code.active ? null : <span className="text-gray-500"> · off</span>}
                </span>
                <span className="flex gap-3 text-xs">
                  <button
                    type="button"
                    className="text-gray-400 underline underline-offset-2 hover:text-white"
                    onClick={() => void save(codes.map((row) => (row.code === code.code ? { ...row, active: !row.active } : row)))}
                  >
                    {code.active ? 'Turn off' : 'Turn on'}
                  </button>
                  <button
                    type="button"
                    className="text-gray-400 underline underline-offset-2 hover:text-white"
                    onClick={() => void save(codes.filter((row) => row.code !== code.code))}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {note ? <p className="text-xs text-gray-300">{note}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

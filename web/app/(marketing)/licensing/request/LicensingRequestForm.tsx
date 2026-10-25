'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const USAGE = [
  'Personal',
  'Creator / Social',
  'Commercial',
  'Advertising',
  'Film',
  'Television',
  'Game',
  'Podcast',
  'Exhibition',
  'Custom',
]

const STEPS = ['You', 'Project', 'Rights', 'Review']

export default function LicensingRequestForm() {
  const params = useSearchParams()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ publicId: string; deskPath: string } | null>(null)
  const [form, setForm] = useState({
    kind: params.get('kind') === 'custom_production' ? 'custom_production' : 'catalog',
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    website: '',
    country: '',
    address: '',
    contactRole: '',
    partyKind: 'direct',
    contractingEntity: '',
    projectName: '',
    projectDescription: '',
    usageType: 'Commercial',
    channels: 'Website',
    term: '1 year',
    territory: 'United States',
    exclusivity: 'non-exclusive',
    reach: 'unknown',
    mediaBudget: '',
    needsStems: false,
    trackId: params.get('track') || '',
    trackTitle: params.get('title') || '',
    budgetNote: '',
    authorized: false,
  })

  const summary = useMemo(() => {
    return [
      ['Request', form.kind === 'custom_production' ? 'Custom production' : 'Catalog license'],
      ['Track', form.trackTitle || '—'],
      ['Company', form.companyName],
      ['Project', form.projectName],
      ['Usage', form.usageType],
      ['Territory', form.territory],
      ['Term', form.term],
      ['Exclusivity', form.exclusivity],
      ['Distribution', form.reach],
      ['Stems', form.needsStems ? 'Requested' : 'Not requested'],
    ]
  }, [form])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/licensing/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          channels: form.channels.split(',').map((item) => item.trim()).filter(Boolean),
          authorized: form.authorized,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not send the inquiry.')
      setResult({ publicId: body.publicId, deskPath: body.deskPath })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not send the inquiry.')
    } finally {
      setPending(false)
    }
  }

  if (result) {
    return (
      <div className="rounded-xl border border-white/10 bg-gray-900/60 p-6">
        <h2 className="text-2xl text-white mb-2">Inquiry {result.publicId}</h2>
        <p className="text-gray-300 mb-4">This does not grant permission to use the music. Confirm the email we sent, then use your private desk.</p>
        <Link href={result.deskPath} className="text-white underline">Open your desk</Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex gap-2 text-sm text-gray-400">
        {STEPS.map((label, index) => (
          <span key={label} className={index === step ? 'text-white' : ''}>{index + 1}. {label}</span>
        ))}
      </div>
      {step === 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Full name" value={form.fullName} onChange={(value) => set('fullName', value)} />
          <Field label="Company" value={form.companyName} onChange={(value) => set('companyName', value)} />
          <Field label="Business email" value={form.email} onChange={(value) => set('email', value)} />
          <Field label="Phone" value={form.phone} onChange={(value) => set('phone', value)} />
          <Field label="Website" value={form.website} onChange={(value) => set('website', value)} />
          <Field label="Country" value={form.country} onChange={(value) => set('country', value)} />
          <Field label="Role" value={form.contactRole} onChange={(value) => set('contactRole', value)} />
          <Field label="Contracting entity" value={form.contractingEntity} onChange={(value) => set('contractingEntity', value)} />
          <label className="text-sm text-gray-300">
            You are
            <select className="mt-1 w-full rounded-md bg-black border border-white/15 px-3 py-2" value={form.partyKind} onChange={(event) => set('partyKind', event.target.value)}>
              <option value="direct">The client</option>
              <option value="agency">An agency for the client</option>
            </select>
          </label>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-4">
          <label className="text-sm text-gray-300">
            Request
            <select className="mt-1 w-full rounded-md bg-black border border-white/15 px-3 py-2" value={form.kind} onChange={(event) => set('kind', event.target.value)}>
              <option value="catalog">License an existing track</option>
              <option value="custom_production">Commission new music</option>
            </select>
          </label>
          <Field label="Track title" value={form.trackTitle} onChange={(value) => set('trackTitle', value)} />
          <Field label="Project name" value={form.projectName} onChange={(value) => set('projectName', value)} />
          <label className="text-sm text-gray-300">
            Project description
            <textarea className="mt-1 w-full rounded-md bg-black border border-white/15 px-3 py-2 min-h-32" value={form.projectDescription} onChange={(event) => set('projectDescription', event.target.value)} />
          </label>
          <Field label="Budget note" value={form.budgetNote} onChange={(value) => set('budgetNote', value)} />
        </div>
      )}
      {step === 2 && (
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm text-gray-300">
            Usage
            <select className="mt-1 w-full rounded-md bg-black border border-white/15 px-3 py-2" value={form.usageType} onChange={(event) => set('usageType', event.target.value)}>
              {USAGE.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <Field label="Platforms, comma separated" value={form.channels} onChange={(value) => set('channels', value)} />
          <Field label="Term" value={form.term} onChange={(value) => set('term', value)} />
          <Field label="Territory" value={form.territory} onChange={(value) => set('territory', value)} />
          <label className="text-sm text-gray-300">
            Exclusivity
            <select className="mt-1 w-full rounded-md bg-black border border-white/15 px-3 py-2" value={form.exclusivity} onChange={(event) => set('exclusivity', event.target.value)}>
              <option value="non-exclusive">Non-exclusive</option>
              <option value="exclusive">Exclusive (manual approval)</option>
            </select>
          </label>
          <label className="text-sm text-gray-300">
            How the music will run
            <select className="mt-1 w-full rounded-md bg-black border border-white/15 px-3 py-2" value={form.reach} onChange={(event) => set('reach', event.target.value)}>
              <option value="unknown">Not sure yet</option>
              <option value="organic">Organic posts</option>
              <option value="paid">Paid ads</option>
            </select>
          </label>
          <Field label="Media budget, if you have one" value={form.mediaBudget} onChange={(value) => set('mediaBudget', value)} />
          <label className="flex items-center gap-3 text-sm text-gray-300 md:col-span-2">
            <input type="checkbox" checked={form.needsStems} onChange={(event) => set('needsStems', event.target.checked)} />
            This project needs stems
          </label>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <dl className="grid gap-2 text-sm">
            {summary.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-white/10 py-2">
                <dt className="text-gray-400">{label}</dt>
                <dd className="text-white text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <label className="flex items-start gap-3 text-sm text-gray-200">
            <input type="checkbox" checked={form.authorized} onChange={(event) => set('authorized', event.target.checked)} />
            The information is accurate and I am authorized to inquire for the named company. I understand this request does not allow use of the music.
          </label>
        </div>
      )}
      {error && <p className="text-red-300 text-sm">{error}</p>}
      <div className="flex gap-3">
        {step > 0 && (
          <button type="button" className="rounded-full border border-white/20 px-4 py-2" onClick={() => setStep((value) => value - 1)}>
            Back
          </button>
        )}
        {step < 3 && (
          <button type="button" className="rounded-full bg-white text-black px-4 py-2" onClick={() => setStep((value) => value + 1)}>
            Continue
          </button>
        )}
        {step === 3 && (
          <button type="submit" disabled={pending} className="rounded-full bg-white text-black px-4 py-2 disabled:opacity-50">
            {pending ? 'Sending…' : 'Submit inquiry'}
          </button>
        )}
      </div>
    </form>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm text-gray-300">
      {label}
      <input className="mt-1 w-full rounded-md bg-black border border-white/15 px-3 py-2 text-white" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

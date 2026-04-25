'use client'

import { useState, useEffect } from 'react'
import { fetchSupabaseUserIdForCheckout } from '@/lib/checkoutActor'

interface TipConfig {
  presetAmounts: number[]
  minAmount: number
  maxAmount: number
  defaultAmount: number
  heading: string
  description: string
  messages: Record<string, string>
}

export default function TipJar() {
  const [config, setConfig] = useState<TipConfig | null>(null)
  const [amount, setAmount] = useState(5)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    import('@/data/tip-jar-config.json').then((data) => {
      setConfig(data as unknown as TipConfig)
      setAmount(data.defaultAmount)
    })
  }, [])

  const handlePreset = (preset: number) => {
    setAmount(preset)
    setIsCustom(false)
    setCustomAmount('')
  }

  const handleCustom = () => {
    setIsCustom(true)
  }

  const handleSubmit = async () => {
    const tipAmount = isCustom ? Number(customAmount) : amount
    if (!tipAmount || tipAmount < (config?.minAmount || 1)) {
      setError(`Minimum tip is $${config?.minAmount || 1}`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const uid = await fetchSupabaseUserIdForCheckout()
      const res = await fetch('/api/stripe/create-tip-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: tipAmount,
          message,
          ...(uid ? { supabaseUserId: uid } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create checkout')
      }

      const { url } = await res.json()
      if (url) window.location.href = url
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!config) return null

  const activeAmount = isCustom ? Number(customAmount) : amount
  const activeMessage = config.messages[String(activeAmount)]

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 md:p-8 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-white text-center">{config.heading}</h2>
      <p className="text-gray-400 text-sm text-center mt-2 max-w-md mx-auto">
        {config.description}
      </p>

      {/* Preset amounts */}
      <div className="flex flex-wrap justify-center gap-3 mt-6">
        {config.presetAmounts.map((preset) => (
          <button
            key={preset}
            onClick={() => handlePreset(preset)}
            className={`px-5 py-3 rounded-lg font-semibold text-sm transition-all ${
              !isCustom && amount === preset
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            ${preset}
          </button>
        ))}
        <button
          onClick={handleCustom}
          className={`px-5 py-3 rounded-lg font-semibold text-sm transition-all ${
            isCustom
              ? 'bg-white text-black'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Custom amount input */}
      {isCustom && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="text-white text-xl font-bold">$</span>
          <input
            type="number"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            min={config.minAmount}
            max={config.maxAmount}
            placeholder="Enter amount"
            className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-lg focus:outline-none focus:border-gray-500"
          />
        </div>
      )}

      {/* Message label */}
      {activeMessage && (
        <p className="text-gray-500 text-sm text-center mt-3">{activeMessage}</p>
      )}

      {/* Optional message */}
      <div className="mt-4">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Leave a message (optional)"
          maxLength={200}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
        />
      </div>

      {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || (!isCustom && !amount) || (isCustom && !customAmount)}
        className="w-full mt-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
      >
        {loading
          ? 'Processing...'
          : `Send $${isCustom ? customAmount || '0' : amount} Tip`}
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

type AgentBody = {
  ok?: boolean
  note?: string
  agentResponse?: string | null
  conversationId?: string | null
  canOnboard?: boolean
  eligible?: boolean | null
}

export function MetaBusinessAgentPanel() {
  const [note, setNote] = useState('Checking Meta Business Agent.')
  const [reply, setReply] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [canOnboard, setCanOnboard] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'test' | 'onboard' | null>(null)

  function apply(body: AgentBody) {
    if (typeof body.note === 'string' && body.note) setNote(body.note)
    setReply(typeof body.agentResponse === 'string' ? body.agentResponse : null)
    if (typeof body.conversationId === 'string' && body.conversationId) setConversationId(body.conversationId)
    setCanOnboard(body.canOnboard === true)
  }

  useEffect(() => {
    let cancelled = false
    void fetch('/api/studio/meta/business-agent')
      .then(async (response) => {
        if (!response.ok || cancelled) return
        apply((await response.json()) as AgentBody)
      })
      .catch(() => {
        if (!cancelled) setNote('Meta Business Agent status could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function send(action: 'test' | 'onboard') {
    setBusy(action)
    try {
      const response = await fetch('/api/studio/meta/business-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          message,
          conversationId,
        }),
      })
      apply((await response.json()) as AgentBody)
    } catch {
      setNote('Meta Business Agent did not answer.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5" data-testid="meta-business-agent">
      <h2 className="text-lg font-semibold mb-1">Meta Business Agent</h2>
      <p className="text-sm text-zinc-500 mb-4" data-testid="meta-business-agent-note">
        {note}
      </p>
      {reply ? (
        <p className="text-sm text-zinc-100 mb-4 whitespace-pre-wrap" data-testid="meta-business-agent-reply">
          {reply}
        </p>
      ) : null}
      <label className="block text-xs text-zinc-500 mb-2" htmlFor="meta-business-agent-message">
        Test question
      </label>
      <textarea
        id="meta-business-agent-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        placeholder="Ask the Meta Business Agent. This stays a test chat."
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-950 disabled:opacity-50"
          disabled={busy !== null || !message.trim()}
          onClick={() => void send('test')}
        >
          {busy === 'test' ? 'Asking…' : 'Ask Meta'}
        </button>
        {canOnboard ? (
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void send('onboard')}
          >
            {busy === 'onboard' ? 'Creating…' : 'Create agent'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

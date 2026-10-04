'use client'

import { useEffect, useRef, useState } from 'react'
import { YT_SUB_GATE_POPUP_MESSAGE, youtubeSubscribeSmartLinkHref } from '@/lib/youtube/subscribe-gate-public'

type GapiYoutube = {
  load?: (name: string, callback: () => void) => void
  ytsubscribe?: {
    render?: (container: string | HTMLElement, parameters: Record<string, string>) => void
  }
}

function gapiYoutube(): GapiYoutube | null {
  return (window as Window & { gapi?: GapiYoutube }).gapi ?? null
}

export default function YoutubeSubscribePopup() {
  const [channel, setChannel] = useState('sergikdropz')
  const [channelId, setChannelId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [widgetFailed, setWidgetFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sent = useRef(false)
  const slotRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    void fetch('/api/youtube/subscribe-gate/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { channel?: string; channelId?: string | null } | null) => {
        if (cancelled || !data) return
        if (data.channel) setChannel(String(data.channel).replace(/^@/, ''))
        if (data.channelId) setChannelId(data.channelId)
      })
      .catch(() => {
        if (!cancelled) setWidgetFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!channelId || !slotRef.current) return
    let cancelled = false
    const slot = slotRef.current

    const render = () => {
      if (cancelled) return
      const api = gapiYoutube()
      if (!api?.ytsubscribe?.render) {
        setWidgetFailed(true)
        return
      }
      slot.replaceChildren()
        api.ytsubscribe.render(slot, {
        channelid: channelId,
        layout: 'default',
        theme: 'dark',
        count: 'hidden',
      })
      setReady(true)
    }

    const start = () => {
      const api = gapiYoutube()
      if (api?.load) api.load('ytsubscribe', render)
      else render()
    }

    const existing = document.getElementById('yt-subscribe-platform') as HTMLScriptElement | null
    if (existing) {
      if (gapiYoutube()) start()
      else existing.addEventListener('load', start, { once: true })
    } else {
      const script = document.createElement('script')
      script.id = 'yt-subscribe-platform'
      script.src = 'https://apis.google.com/js/platform.js'
      script.async = true
      script.onload = () => start()
      script.onerror = () => {
        if (!cancelled) setWidgetFailed(true)
      }
      document.body.appendChild(script)
    }

    const giveUp = window.setTimeout(() => {
      if (!cancelled && !slot.querySelector('iframe')) setWidgetFailed(true)
    }, 8000)

    return () => {
      cancelled = true
      window.clearTimeout(giveUp)
    }
  }, [channelId])

  useEffect(() => {
    const onBlur = () => {
      window.setTimeout(() => {
        const active = document.activeElement
        if (active?.tagName === 'IFRAME' && slotRef.current?.contains(active)) {
          confirmRef.current()
        }
      }, 0)
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  async function confirmSubscribed() {
    if (sent.current) return
    sent.current = true
    setError(null)
    try {
      const res = await fetch('/api/youtube/subscribe-gate/confirm', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = (await res.json().catch(() => null)) as { unlocked?: boolean; error?: string } | null
      if (!data?.unlocked) {
        sent.current = false
        setError(data?.error || 'The video stays locked until the Subscribe button is used.')
        return
      }
      setDone(true)
      try {
        window.opener?.postMessage(
          { source: YT_SUB_GATE_POPUP_MESSAGE, flag: 'ok' },
          window.location.origin,
        )
        window.opener?.focus()
      } catch {
        /* the library tab can also unlock when this window closes */
      }
    } catch {
      sent.current = false
      setError('Could not save the subscription. Use the Subscribe button again.')
    }
  }

  confirmRef.current = () => {
    void confirmSubscribed()
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-5 py-8 text-center text-white">
      <p className="text-[11px] uppercase tracking-[0.16em] text-red-400">@{channel}</p>
      <h1 className="mt-2 text-lg font-semibold">Subscribe to watch</h1>
      <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-neutral-400">
        This window stays on YouTube’s Subscribe button for @{channel}. The music page stays open.
      </p>
      <a
        href={youtubeSubscribeSmartLinkHref(channel)}
        className="mt-5 inline-flex min-h-[52px] w-full max-w-xs items-center justify-center rounded-md bg-red-600 px-4 text-base font-semibold text-white hover:bg-red-500"
      >
        Subscribe
      </a>
      <div id="yt-sub" className="mt-4 flex min-h-[72px] items-center justify-center">
        <div className="origin-center scale-[1.8]">
          <div ref={slotRef} />
        </div>
      </div>
      {!ready && !widgetFailed ? <p className="mt-3 text-[11px] text-neutral-500">Loading the Subscribe button…</p> : null}
      {done ? (
        <p className="mt-4 text-[12px] text-emerald-300">Saved. You can close this window.</p>
      ) : null}
      {error ? <p className="mt-4 text-[12px] text-amber-200">{error}</p> : null}
    </main>
  )
}

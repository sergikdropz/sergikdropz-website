/**
 * Fill SoundCloud's upload form from a database-backed packet.
 * Attaches nothing by itself. Never clicks Save, Upload, or Publish.
 */

import type { SoundCloudUploadPacket } from '@/lib/ai/soundcloud-upload'

export type SoundCloudPrefillResult = {
  ok: boolean
  filled: string[]
  skipped: string[]
  errors: string[]
  url: string
}

type FillablePage = {
  url: () => string
  evaluate: (fn: (...args: never[]) => unknown, ...args: never[]) => Promise<unknown>
}

function soundcloudPrefillInPage(packet: SoundCloudUploadPacket): {
  filled: string[]
  skipped: string[]
  errors: string[]
} {
  const filled: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()
  const forbidden = /^(save|upload|publish|post|done|continue|submit|cancel)$/i

  function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (desc?.set) desc.set.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function blobFor(el: Element): string {
    const id = el.id
    const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null
    const parent = el.closest('label, fieldset, div')
    return normalize(
      [
        el.getAttribute('placeholder'),
        el.getAttribute('aria-label'),
        el.getAttribute('name'),
        el.getAttribute('data-testid'),
        byFor?.textContent,
        parent?.textContent?.slice(0, 180),
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  function controls(): HTMLElement[] {
    return Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]')) as HTMLElement[]
  }

  function writeField(el: HTMLElement | null, value: string, label: string) {
    if (!el || !value) {
      skipped.push(`${label} (field not found)`)
      return
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      setNativeValue(el, value)
      filled.push(label)
      return
    }
    if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
      filled.push(label)
      return
    }
    skipped.push(`${label} (not editable)`)
  }

  function clickSafe(el: HTMLElement | null, label: string): boolean {
    if (!el) {
      skipped.push(`${label} (control missing)`)
      return false
    }
    const name = normalize(el.textContent || el.getAttribute('aria-label') || '')
    if (forbidden.test(name)) {
      skipped.push(`${label} (refused ${name})`)
      return false
    }
    el.click()
    filled.push(label)
    return true
  }

  const all = controls()
  const playlistToggle = all.find((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox') return false
    return /playlist|album|ep/.test(blobFor(el))
  }) as HTMLInputElement | undefined
  if (playlistToggle && !playlistToggle.checked) {
    playlistToggle.checked = true
    playlistToggle.dispatchEvent(new Event('change', { bubbles: true }))
    clickSafe(playlistToggle, 'Make a playlist')
  } else if (!playlistToggle) {
    const button = Array.from(document.querySelectorAll('button, [role="switch"], [role="checkbox"]')).find((el) =>
      /make a playlist|create a playlist|add to playlist/.test(normalize(el.textContent || '')),
    ) as HTMLElement | undefined
    clickSafe(button || null, 'Make a playlist')
  } else {
    filled.push('Make a playlist (already)')
  }

  const playlistType = packet.playlist_type
  const typeSelect = all.find((el) => el instanceof HTMLSelectElement && /playlist type|release type|type/.test(blobFor(el))) as
    | HTMLSelectElement
    | undefined
  if (typeSelect) {
    const option = Array.from(typeSelect.options).find((opt) => normalize(opt.text) === playlistType || normalize(opt.value) === playlistType)
    if (option) {
      setNativeValue(typeSelect, option.value)
      filled.push(`Playlist type ${playlistType}`)
    } else {
      skipped.push(`Playlist type ${playlistType} (option missing)`)
    }
  } else {
    const typeButton = Array.from(document.querySelectorAll('button, [role="option"], li, a, span')).find(
      (el) => normalize(el.textContent || '') === playlistType,
    ) as HTMLElement | undefined
    if (typeButton) clickSafe(typeButton, `Playlist type ${playlistType}`)
    else skipped.push(`Playlist type ${playlistType} (control missing)`)
  }

  const titleFields = all.filter((el) => /title/.test(blobFor(el)) && !/tag/.test(blobFor(el)))
  const playlistTitle = titleFields.find((el) => /playlist|album|release/.test(blobFor(el))) || null
  const trackTitles = titleFields.filter((el) => el !== playlistTitle)
  writeField(playlistTitle, packet.title, 'EP title')
  packet.tracks.forEach((track, index) => {
    writeField(trackTitles[index] || null, track.title, `Track ${track.track_number} title`)
  })

  const areas = all.filter((el) => el instanceof HTMLTextAreaElement || /description|caption/.test(blobFor(el)))
  const playlistDescription = areas.find((el) => /playlist|album|release/.test(blobFor(el))) || areas[0] || null
  writeField(playlistDescription, packet.description, 'EP description')
  const trackAreas = areas.filter((el) => el !== playlistDescription)
  packet.tracks.forEach((track, index) => {
    if (!trackAreas[index]) return
    writeField(trackAreas[index], track.description, `Track ${track.track_number} description`)
  })

  const genreFields = all.filter((el) => el instanceof HTMLSelectElement && /genre/.test(blobFor(el))) as HTMLSelectElement[]
  if (!genreFields.length) skipped.push(`Genre ${packet.genre} (dropdown missing)`)
  for (const select of genreFields) {
    const option = Array.from(select.options).find((opt) => {
      const text = normalize(opt.text)
      const want = normalize(packet.genre)
      return text === want || text.includes(want)
    })
    if (!option) {
      skipped.push(`Genre ${packet.genre} (option missing)`)
      continue
    }
    setNativeValue(select, option.value)
    filled.push(`Genre ${packet.genre}`)
  }

  const tagLine = packet.tags
    .map((tag) => (/\s/.test(tag) ? `"${tag.replace(/"/g, '')}"` : tag))
    .join(' ')
  const tagField = all.find((el) => /tag/.test(blobFor(el)) && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) || null
  writeField(tagField, tagLine, 'Tags')

  const privacy = Array.from(document.querySelectorAll('input, button, [role="radio"], label')).find((el) => {
    const text = normalize(`${el.getAttribute('aria-label') || ''} ${el.textContent || ''} ${el.getAttribute('value') || ''}`)
    return text === 'public' || text === 'public anyone can listen'
  }) as HTMLElement | undefined
  if (privacy instanceof HTMLInputElement && (privacy.type === 'radio' || privacy.type === 'checkbox')) {
    privacy.checked = true
    privacy.dispatchEvent(new Event('change', { bubbles: true }))
    filled.push('Privacy public')
  } else if (privacy) {
    clickSafe(privacy, 'Privacy public')
  } else {
    skipped.push('Privacy public (control missing)')
  }

  if (!filled.length && !errors.length) {
    errors.push('SoundCloud upload form had no matching fields. Drop is ready only after the database files attach.')
  }
  return { filled, skipped, errors }
}

export async function prefillSoundCloudPage(
  page: FillablePage,
  packet: SoundCloudUploadPacket,
): Promise<SoundCloudPrefillResult> {
  const url = page.url()
  if (!/soundcloud\.com\/upload/i.test(url)) {
    return {
      ok: false,
      filled: [],
      skipped: [],
      errors: ['Open SoundCloud upload (soundcloud.com/upload) while signed in. This never clicks Save.'],
      url,
    }
  }
  if (/\/(signin|login|connect)\b/i.test(url)) {
    return {
      ok: false,
      filled: [],
      skipped: [],
      errors: ['SoundCloud is showing sign-in. Sign in on this browser, then fill again.'],
      url,
    }
  }
  try {
    const result = (await page.evaluate(soundcloudPrefillInPage as never, packet as never)) as {
      filled: string[]
      skipped: string[]
      errors: string[]
    }
    return {
      ok: result.errors.length === 0 && result.filled.length > 0,
      filled: result.filled,
      skipped: result.skipped,
      errors: result.errors,
      url,
    }
  } catch (err) {
    return {
      ok: false,
      filled: [],
      skipped: [],
      errors: [`SoundCloud prefill failed: ${err instanceof Error ? err.message : String(err)}`],
      url,
    }
  }
}

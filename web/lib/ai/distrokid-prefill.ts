/**
 * Prefill DistroKid's /new/ upload form from a Release Studio DistroKid packet.
 * Uses DistroKid DOM ids/names (probed 2026-10). Never submits. Never enables Social Media Pack.
 */

export type DistroKidPrefillTrack = {
  track_number: number
  title: string
  artist: string
  featuring: string
  songwriters: string
  isrc: string
  explicit: boolean
  instrumental: boolean
  ai_generated: boolean
  wav_url: string
  preview_start_seconds: number | null
  apple_performer_name: string
  apple_performer_instrument: string
  apple_producer_name: string
}

export type DistroKidPrefillPacket = {
  release: {
    previously_released: boolean
    artist: string
    label: string
    title: string
    language: string
    primary_genre: string
    secondary_genre: string
    release_date: string
    upc: string
    artwork_url: string
    stores: string[]
  }
  tracks: DistroKidPrefillTrack[]
}

export type DistroKidPrefillResult = {
  ok: boolean
  filled: string[]
  skipped: string[]
  errors: string[]
  url: string
}

type FillablePage = {
  url: () => string
  evaluate: (fn: (...args: never[]) => unknown, ...args: never[]) => Promise<unknown>
  waitForTimeout?: (ms: number) => Promise<void>
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Runs inside DistroKid page context — must be self-contained (Playwright cannot close over helpers). */
function distrokidPrefillInPage(packet: DistroKidPrefillPacket): {
  filled: string[]
  skipped: string[]
  errors: string[]
} {
  const filled: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()

  function splitLegalName(full: string): { first: string; middle: string; last: string } {
    const parts = full.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return { first: '', middle: '', last: '' }
    if (parts.length === 1) return { first: parts[0], middle: '', last: '' }
    if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] }
    return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] }
  }

  function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    try {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : el instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc?.set) desc.set.call(el, value)
      else el.value = value
    } catch {
      try {
        el.value = value
      } catch (err) {
        errors.push(`Could not set value on ${el.id || el.name || el.tagName}: ${String(err)}`)
        return
      }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  function clickEl(el: HTMLElement) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    el.click()
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null
  }

  /** DistroKid radios often ignore a bare .click() — force checked + sibling clear + label click. */
  function setRadio(el: HTMLInputElement | null, label: string): boolean {
    if (!el) {
      skipped.push(`${label} (control missing)`)
      return false
    }
    if (el.checked) {
      filled.push(`${label} (already)`)
      return true
    }
    const group = el.name
      ? (Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)) as HTMLInputElement[])
      : []
    for (const sibling of group) sibling.checked = false
    el.checked = true
    clickEl(el)
    if (!el.checked) {
      const lab =
        (el.id && document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`)) ||
        el.closest('label')
      if (lab) clickEl(lab)
    }
    if (!el.checked) {
      el.checked = true
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    try {
      const w = window as unknown as {
        jQuery?: (sel: HTMLElement) => { prop: (k: string, v: boolean) => unknown; trigger: (e: string) => unknown }
      }
      if (typeof w.jQuery === 'function') {
        const $el = w.jQuery(el)
        $el.prop('checked', true)
        $el.trigger('change')
      }
    } catch {
      /* ignore */
    }
    if (el.checked) {
      filled.push(label)
      return true
    }
    skipped.push(`${label} (could not select)`)
    return false
  }

  function trackBlockFor(n: number, titleInput: HTMLElement | null): HTMLElement {
    let best: HTMLElement = titleInput?.parentElement || document.body
    let node: HTMLElement | null = titleInput
    for (let up = 0; up < 16 && node; up++) {
      node = node.parentElement
      if (!node) break
      const hasTitle = Boolean(node.querySelector(`input[placeholder="Track ${n} title"]`))
      const hasFeat = Boolean(node.querySelector(`#js-no-feat-${n}, #js-add-feat-${n}`))
      const hasWriter = Boolean(node.querySelector(`input[name="songwriter_real_name_first${n}"]`))
      const hasAi = Boolean(node.querySelector(`input[type="radio"][name*="ai_gate"]`))
      const hasDolby = Boolean(node.querySelector(`input[type="radio"][name="dolby_${n}"]`))
      if (hasTitle && hasFeat) best = node
      // Prefer the container that also holds legal-name / AI / Dolby controls.
      if (hasTitle && hasFeat && (hasWriter || hasAi || hasDolby)) best = node
      if (hasTitle && hasFeat && hasWriter && hasAi) return node
    }
    return best
  }

  function selectByText(select: HTMLSelectElement, wantRaw: string, label: string) {
    const want = normalize(wantRaw)
    if (!want) {
      skipped.push(`${label} (empty)`)
      return
    }
    const option = Array.from(select.options).find((opt) => {
      const text = normalize(opt.text)
      const value = normalize(opt.value)
      return text === want || value === want || text.includes(want) || want.includes(text)
    })
    if (!option) {
      skipped.push(`${label} (option “${wantRaw}” missing)`)
      return
    }
    setNativeValue(select, option.value)
    filled.push(label)
  }

  function setText(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, label: string) {
    if (!el) {
      skipped.push(`${label} (field not found)`)
      return
    }
    if (!value) {
      skipped.push(`${label} (empty)`)
      return
    }
    clickEl(el)
    setNativeValue(el, value)
    filled.push(label)
  }

  function ensureUnchecked(id: string, label: string) {
    const el = byId<HTMLInputElement>(id)
    if (!el) {
      skipped.push(`${label} (control missing)`)
      return
    }
    if (el.checked) {
      clickEl(el)
      filled.push(`${label} unchecked`)
    } else {
      filled.push(`${label} left OFF`)
    }
  }

  // Never enroll DistroKid Social Media Pack — SERGIK UGC is first-party.
  ensureUnchecked('socialmediapack', 'Social Media Pack')
  ensureUnchecked('socialmediapack_alternate', 'Social Media Pack (alt)')

  const songCount = Math.max(1, Math.min(35, packet.tracks.length || 1))
  const songSelect = byId<HTMLSelectElement>('howManySongsOnThisAlbum')
  if (songSelect) {
    const option = Array.from(songSelect.options).find((opt) => {
      const text = normalize(opt.text)
      return text.startsWith(`${songCount} song`) || opt.value === String(songCount)
    })
    if (option) {
      setNativeValue(songSelect, option.value)
      songSelect.dispatchEvent(new Event('input', { bubbles: true }))
      songSelect.dispatchEvent(new Event('change', { bubbles: true }))
      // DistroKid wires this select through jQuery — native change alone often does not expand tracks.
      try {
        const w = window as unknown as {
          jQuery?: (el: HTMLElement) => { val: (v?: string) => unknown }
        }
        if (typeof w.jQuery === 'function') {
          const $el = w.jQuery(songSelect) as {
            val: (v?: string) => unknown
            trigger: (e: string) => unknown
          }
          $el.val(String(option.value))
          $el.trigger('change')
        }
      } catch {
        /* ignore */
      }
      filled.push(`Number of songs → ${songCount}`)
    } else {
      skipped.push(`Number of songs → ${songCount}`)
    }
  } else {
    skipped.push('Number of songs (select missing)')
  }

  const prevWant = packet.release.previously_released ? '1' : '0'
  const prevRadios = Array.from(
    document.querySelectorAll('input[type="radio"][name^="previouslyReleased"]')
  ) as HTMLInputElement[]
  const prev = prevRadios.find((radio) => radio.value === prevWant) || null
  setRadio(prev, `Previously released → ${packet.release.previously_released ? 'Yes' : 'No'}`)

  setText(byId<HTMLInputElement>('artistName'), packet.release.artist, 'Artist/band name')
  setText(byId<HTMLInputElement>('recordLabel'), packet.release.label, 'Record label')
  setText(byId<HTMLInputElement>('release-date-dp'), packet.release.release_date, 'Release date')

  const albumTitle =
    byId<HTMLInputElement>('albumTitleInput') ||
    byId<HTMLInputElement>('albumtitle') ||
    byId<HTMLInputElement>('albumTitle') ||
    document.querySelector<HTMLInputElement>('input[name="albumtitle" i], input[name="albumTitle" i]') ||
    document.querySelector<HTMLInputElement>('input[placeholder*="Album title" i], input[placeholder*="album name" i]')
  if (albumTitle) setText(albumTitle, packet.release.title, 'Release title')
  else if (songCount > 1) {
    skipped.push('Release title (appears after song count expands — will retry)')
  } else {
    skipped.push('Release title (single — DistroKid uses track title)')
  }

  // Secondary genre: DistroKid options vary; try exact then common Dance siblings without skip spam.
  const genre2el = byId<HTMLSelectElement>('genreSecondary')
  if (genre2el && packet.release.secondary_genre) {
    const candidates = [packet.release.secondary_genre, 'Disco', 'Funk', 'House', 'Electronic']
    let set = false
    for (const wantRaw of candidates) {
      const want = normalize(wantRaw)
      const option = Array.from(genre2el.options).find((opt) => {
        const text = normalize(opt.text)
        const value = normalize(opt.value)
        return text === want || value === want || text.includes(want) || want.includes(text)
      })
      if (option) {
        setNativeValue(genre2el, option.value)
        filled.push(
          wantRaw === packet.release.secondary_genre
            ? 'Secondary genre'
            : `Secondary genre (alt ${wantRaw} — “${packet.release.secondary_genre}” not in DistroKid)`
        )
        set = true
        break
      }
    }
    if (!set) skipped.push(`Secondary genre (“${packet.release.secondary_genre}” not in DistroKid)`)
  }

  const language = byId<HTMLSelectElement>('language')
  if (language) selectByText(language, packet.release.language || 'English', 'Language')
  else skipped.push('Language')

  const genre1 = byId<HTMLSelectElement>('genrePrimary')
  if (genre1) selectByText(genre1, packet.release.primary_genre, 'Primary genre')
  else skipped.push('Primary genre')

  if (packet.release.upc) {
    const upc =
      byId<HTMLInputElement>('customUpc') ||
      document.querySelector<HTMLInputElement>('input[name="customUpc"], input[name*="upc" i], input[id*="upc" i], input[placeholder*="UPC" i]')
    // DistroKid often keeps UPC hidden until “I already have a UPC” is opened.
    const upcToggle = Array.from(document.querySelectorAll<HTMLElement>('a, button, label, span')).find((el) =>
      /already have (a |an )?upc|enter.*upc|own upc|custom upc/i.test(el.textContent || '')
    )
    if (upcToggle) {
      try {
        clickEl(upcToggle)
      } catch {
        /* ignore */
      }
    }
    setText(upc, packet.release.upc, 'UPC')
  } else {
    filled.push('UPC left blank (DistroKid assigns)')
  }

  // Ensure Studio target stores stay checked (DistroKid defaults are usually on).
  const storeMap: Record<string, string> = {
    spotify: 'chkspotify',
    'apple music': 'chkapplemusic',
    itunes: 'chkitunes',
    beatport: 'chkbeatport',
    'instagram / meta': 'chkfacebook',
    'tiktok / commercial': 'chktiktok',
    tiktok: 'chktiktok',
    'youtube music': 'chkgoogle',
    youtube: 'chkgoogle',
    amazon: 'chkamazon',
    'amazon music': 'chkamazon',
    pandora: 'chkrdio',
    deezer: 'chkdeezer',
    tidal: 'chktidal',
    iheartradio: 'chkiheart',
    qobuz: 'chkqobuz',
    jiosaavn: 'chksaavn',
    saavn: 'chksaavn',
    boomplay: 'chkboomplay',
    anghami: 'chkanghami',
    'netease cloud music': 'chknetease',
    netease: 'chknetease',
    'tencent music': 'chktencent',
    tencent: 'chktencent',
    massivemusic: 'chkmassivemusic',
    'claro música': 'chkimusica',
    joox: 'chkjoox',
    'kuack media': 'chkkuackmedia',
    adaptr: 'chkfeedfm',
    flo: 'chkflo',
    medianet: 'chkbeats',
    snapchat: 'chksnap',
    roblox: 'chkroblox',
    shazam: '', // Discovery Pack checkbox — leave default
  }
  if (packet.release.stores?.length) {
    let ensured = 0
    for (const store of packet.release.stores) {
      const id = storeMap[normalize(store)]
      if (!id) continue
      const box = byId<HTMLInputElement>(id)
      if (box && !box.checked) {
        clickEl(box)
        ensured += 1
      } else if (box?.checked) {
        ensured += 1
      }
    }
    if (ensured) filled.push(`Stores ensured (${ensured})`)
  }

  packet.tracks.forEach((track, index) => {
    const n = track.track_number || index + 1
    const titleInput =
      document.querySelector<HTMLInputElement>(`input[placeholder="Track ${n} title"]`) ||
      document.querySelector<HTMLInputElement>(`input[name^="title_"][placeholder*="Track ${n}"]`)
    if (!titleInput) {
      skipped.push(`Track ${n} title (row not in DOM yet)`)
      return
    }
    setText(titleInput, track.title, `Track ${n} title`)
    const trackRoot = trackBlockFor(n, titleInput)

    const noFeat = byId<HTMLInputElement>(`js-no-feat-${n}`)
    const addFeat = byId<HTMLInputElement>(`js-add-feat-${n}`)
    const featNames = (track.featuring || '')
      .split(/\s*,\s*|\s+&\s+|\s+x\s+/i)
      .map((s) => s.trim())
      .filter(Boolean)

    if (featNames.length && addFeat) {
      setRadio(addFeat, `Track ${n} featuring → Yes`)
      featNames.forEach((name, fi) => {
        const slot = fi + 1
        let artistInput = byId<HTMLInputElement>(`tracks_${n}_artists_${slot}_artist`)
        if (!artistInput && slot > 1) {
          const localAdd = Array.from(trackRoot.querySelectorAll<HTMLElement>('a, button, span')).find((el) =>
            /add another (featured )?artist/i.test((el.textContent || '').replace(/\s+/g, ' '))
          )
          if (localAdd) clickEl(localAdd)
          artistInput = byId<HTMLInputElement>(`tracks_${n}_artists_${slot}_artist`)
        }
        const role = byId<HTMLSelectElement>(`tracks_${n}_artists_${slot}_role`)
        if (role) {
          const featOpt = Array.from(role.options).find(
            (opt) => /featuring|feat/i.test(opt.text) || /featuring|feat/i.test(opt.value)
          )
          if (featOpt) setNativeValue(role, featOpt.value)
        }
        if (artistInput) setText(artistInput, name, `Track ${n} featured artist ${slot}`)
        else skipped.push(`Track ${n} featured artist “${name}” (slot ${slot} missing — add manually)`)
      })
      // Clear unused extra slots so DistroKid does not leave red empty Name fields.
      for (let slot = featNames.length + 1; slot <= 6; slot++) {
        const extra = byId<HTMLInputElement>(`tracks_${n}_artists_${slot}_artist`)
        if (extra?.value) setNativeValue(extra, '')
      }
    } else {
      // Critical: empty featured Name fields stay red if “Yes” is left selected.
      setRadio(noFeat, `Track ${n} featuring → No`)
      for (let slot = 1; slot <= 6; slot++) {
        const stray = byId<HTMLInputElement>(`tracks_${n}_artists_${slot}_artist`)
        if (stray) setNativeValue(stray, '')
      }
      // If DistroKid ignored No, force-hide by ensuring addFeat is unchecked.
      if (addFeat?.checked && noFeat) {
        addFeat.checked = false
        noFeat.checked = true
        noFeat.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }

    const versionNo =
      byId<HTMLInputElement>(`track-${n}-version-no`) ||
      (trackRoot.querySelector(
        `input[type="radio"][name^="version_"][value=""], input[type="radio"][name^="version_"]`
      ) as HTMLInputElement | null)
    // Prefer the radio whose label says “normal version”.
    const versionNormal =
      byId<HTMLInputElement>(`track-${n}-version-no`) ||
      (Array.from(trackRoot.querySelectorAll('input[type="radio"][name^="version_"]')) as HTMLInputElement[]).find(
        (radio) => {
          const lab = radio.closest('label')?.textContent || ''
          return /normal version/i.test(lab)
        }
      ) ||
      versionNo
    setRadio(versionNormal || null, `Track ${n} version → normal`)

    const original = byId<HTMLInputElement>(`not_coversong_radio_button_${n}`)
    setRadio(original, `Track ${n} original song`)

    // Songwriter legal names + DistroKid originalSongwriters field for this track block.
    const writers = (track.songwriters || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const origWriters = trackRoot.querySelector<HTMLInputElement>(`input[name^="originalSongwriters"]`)
    if (origWriters && track.songwriters) {
      setText(origWriters, track.songwriters, `Track ${n} original songwriters`)
    }

    function writerPair(firstEl: HTMLInputElement): {
      middle: HTMLInputElement | null
      last: HTMLInputElement | null
    } {
      // DistroKid reuses name=songwriter_real_name_first1 across co-writer rows — never query globally.
      let middle: HTMLInputElement | null = null
      let last: HTMLInputElement | null = null
      let scope: HTMLElement | null = firstEl.parentElement
      for (let depth = 0; depth < 6 && scope; depth++) {
        const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="text"]'))
        const idx = inputs.indexOf(firstEl)
        if (idx >= 0) {
          middle =
            inputs.find(
              (el, j) => j > idx && /middle/i.test(`${el.name} ${el.placeholder}`)
            ) || null
          last =
            inputs.find((el, j) => j > idx && /last/i.test(`${el.name} ${el.placeholder}`)) || null
          if (last) return { middle, last }
        }
        scope = scope.parentElement
      }
      // Sibling walk — DistroKid often lays out first/middle/last as adjacent inputs.
      let sib: Element | null = firstEl.nextElementSibling
      for (let i = 0; i < 8 && sib; i++) {
        if (sib instanceof HTMLInputElement) {
          if (!middle && /middle/i.test(`${sib.name} ${sib.placeholder}`)) middle = sib
          if (/last/i.test(`${sib.name} ${sib.placeholder}`)) {
            last = sib
            break
          }
        }
        const nested = sib.querySelectorAll?.('input[type="text"]')
        if (nested) {
          for (const el of Array.from(nested) as HTMLInputElement[]) {
            if (!middle && /middle/i.test(`${el.name} ${el.placeholder}`)) middle = el
            if (/last/i.test(`${el.name} ${el.placeholder}`)) last = el
          }
          if (last) break
        }
        sib = sib.nextElementSibling
      }
      return { middle, last }
    }

    writers.forEach((writer, wi) => {
      const legal = splitLegalName(writer)
      const scope = trackRoot
      const primaryFirst = scope.querySelector<HTMLInputElement>(
        `input[name="songwriter_real_name_first${n}"]`
      )
      if (wi === 0) {
        // Primary legal-name row uses first${n}/middle${n}/last${n} — fall back to document if
        // the track wrapper is still too tight after expand.
        const first =
          primaryFirst ||
          scope.querySelector<HTMLInputElement>(`input[name="songwriter_real_name_first${n}"]`) ||
          document.querySelector<HTMLInputElement>(`input[name="songwriter_real_name_first${n}"]`)
        const middle =
          scope.querySelector<HTMLInputElement>(`input[name="songwriter_real_name_middle${n}"]`) ||
          document.querySelector<HTMLInputElement>(`input[name="songwriter_real_name_middle${n}"]`)
        const last =
          scope.querySelector<HTMLInputElement>(`input[name="songwriter_real_name_last${n}"]`) ||
          document.querySelector<HTMLInputElement>(`input[name="songwriter_real_name_last${n}"]`)
        if (first) {
          setText(first, legal.first, `Track ${n} songwriter 1 first`)
          if (legal.middle && middle) setText(middle, legal.middle, `Track ${n} songwriter 1 middle`)
          if (last) setText(last, legal.last, `Track ${n} songwriter 1 last`)
        } else {
          skipped.push(`Track ${n} songwriter (fields missing)`)
        }
        return
      }
      const addWriter = Array.from(scope.querySelectorAll<HTMLElement>('a, button, span')).find((el) =>
        /add (another )?songwriter/i.test((el.textContent || '').replace(/\s+/g, ' '))
      )
      if (addWriter) clickEl(addWriter)
      const firsts = Array.from(scope.querySelectorAll<HTMLInputElement>('input[name^="songwriter_real_name_first"]'))
      const targetFirst =
        firsts.find(
          (el) =>
            el !== primaryFirst &&
            !el.value.trim() &&
            (el.name === `songwriter_real_name_first${n}` ||
              el.name.startsWith(`songwriter_real_name_first${n}_`) ||
              el.name.includes(`_${n}_`))
        ) ||
        firsts.find((el) => el !== primaryFirst && !el.value.trim())
      if (targetFirst) {
        const { middle, last } = writerPair(targetFirst)
        setText(targetFirst, legal.first, `Track ${n} songwriter ${wi + 1} first`)
        if (legal.middle && middle) setText(middle, legal.middle, `Track ${n} songwriter ${wi + 1} middle`)
        if (last && legal.last) setText(last, legal.last, `Track ${n} songwriter ${wi + 1} last`)
        else if (legal.last) {
          // Last-ditch: any empty last-name input in the same visual row group as targetFirst.
          const near = targetFirst.closest('div, tr, li, fieldset, section')
          const emptyLast = near
            ? Array.from(near.querySelectorAll<HTMLInputElement>('input[type="text"]')).find(
                (el) => /last/i.test(`${el.name} ${el.placeholder}`) && !el.value.trim()
              )
            : null
          if (emptyLast) setText(emptyLast, legal.last, `Track ${n} songwriter ${wi + 1} last`)
          else skipped.push(`Track ${n} co-writer “${writer}” last name field missing`)
        }
      } else {
        skipped.push(
          `Track ${n} co-writer “${writer}” listed in original songwriters — confirm/add legal-name row in DistroKid if required`
        )
      }
    })

    const notExplicit = byId<HTMLInputElement>(`js-not-explicit-radio-button-${n}`)
    const explicit = byId<HTMLInputElement>(`js-explicit-radio-button-${n}`)
    if (track.explicit) setRadio(explicit, `Track ${n} explicit → Yes`)
    else setRadio(notExplicit, `Track ${n} explicit → No`)

    const notCleaned = byId<HTMLInputElement>(`js-not-cleaned-radio-button-${n}`)
    setRadio(notCleaned, `Track ${n} cleaned → No`)

    const hasLyrics = byId<HTMLInputElement>(`js-not-instrumental-radio-button-${n}`)
    const instrumental = byId<HTMLInputElement>(`js-instrumental-radio-button-${n}`)
    if (track.instrumental) setRadio(instrumental, `Track ${n} instrumental`)
    else setRadio(hasLyrics, `Track ${n} lyrics`)

    const dolbyNo =
      trackRoot.querySelector<HTMLInputElement>(`input[type="radio"][name="dolby_${n}"][value="0"]`) ||
      document.querySelector<HTMLInputElement>(`input[type="radio"][name="dolby_${n}"][value="0"]`)
    setRadio(dolbyNo, `Track ${n} Dolby Atmos → No`)

    // AI radios are named ai_gate_<uuid> — scope to this track block first.
    const aiRadios = Array.from(
      trackRoot.querySelectorAll<HTMLInputElement>(`input[type="radio"][name*="ai_gate"]`)
    )
    const aiNo =
      aiRadios.find((r) => r.value === '0') ||
      (document.querySelectorAll(`input[type="radio"][name*="ai_gate"][value="0"]`)[n - 1] as
        | HTMLInputElement
        | undefined) ||
      null
    const aiYes =
      aiRadios.find((r) => r.value === '1') ||
      (document.querySelectorAll(`input[type="radio"][name*="ai_gate"][value="1"]`)[n - 1] as
        | HTMLInputElement
        | undefined) ||
      null
    if (track.ai_generated) setRadio(aiYes, `Track ${n} AI → Yes`)
    else setRadio(aiNo, `Track ${n} AI → No`)

    // ISRC — DistroKid hides this until “I already have an ISRC”. Always paste Studio QTA53; never mint.
    if (track.isrc) {
      const compact = track.isrc.replace(/[\s-]/g, '').toUpperCase()
      const checkboxIds = [
        `alreadyHaveISRC_${n}`,
        `already_have_isrc_${n}`,
        `js-already-have-isrc-${n}`,
        `js-have-isrc-${n}`,
        `useOwnIsrc_${n}`,
        `isrcCheckbox_${n}`,
        `chkisrc_${n}`,
      ]
      for (const id of checkboxIds) {
        const box = byId<HTMLInputElement>(id)
        if (box && (box.type === 'checkbox' || box.type === 'radio') && !box.checked) clickEl(box)
      }
      const isrcToggle =
        Array.from(trackRoot.querySelectorAll<HTMLElement>('a, button, label, span, input')).find((el) =>
          /already have an isrc|enter.*isrc|own isrc|custom isrc|use.*isrc|i have an isrc|have my own isrc/i.test(
            (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ')
          )
        ) || null
      if (isrcToggle) {
        try {
          if (isrcToggle instanceof HTMLInputElement && isrcToggle.type === 'checkbox' && !isrcToggle.checked) {
            clickEl(isrcToggle)
          } else if (!(isrcToggle instanceof HTMLInputElement && isrcToggle.type === 'checkbox')) {
            clickEl(isrcToggle)
          }
        } catch {
          /* ignore */
        }
      }
      const isrcCandidates = Array.from(
        trackRoot.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type]), input[type="search"]')
      ).filter((el) => /isrc/i.test(`${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label') || ''}`))
      const isrc =
        isrcCandidates[0] ||
        document.querySelector<HTMLInputElement>(
          `#isrc_${n}, #isrc${n}, input[name="isrc_${n}"], input[name="isrc${n}"], input[name="ISRC_${n}"]`
        )
      if (isrc) setText(isrc, compact, `Track ${n} ISRC`)
      else skipped.push(`Track ${n} ISRC ${compact} (open “I already have an ISRC” if needed — do not mint)`)
    }

    // Preview start — packet uses 0 as Auto; leave DistroKid default unless > 0.
    if (track.preview_start_seconds != null && track.preview_start_seconds > 0) {
      const previewYes = trackRoot.querySelector<HTMLInputElement>(
        `input[type="radio"][name="previewStart_${n}"][value="yes"]`
      )
      if (setRadio(previewYes, `Track ${n} preview → specify`)) {
        const total = Math.round(track.preview_start_seconds)
        const mm = Math.floor(total / 60)
        const ss = total % 60
        const minSel =
          trackRoot.querySelector<HTMLSelectElement>(`select[name*="preview"][name*="min"], select[id*="preview"][id*="min"]`) ||
          trackRoot.querySelector<HTMLSelectElement>(`select[name="previewMinute_${n}"], select[name="preview_min_${n}"]`)
        const secSel =
          trackRoot.querySelector<HTMLSelectElement>(`select[name*="preview"][name*="sec"], select[id*="preview"][id*="sec"]`) ||
          trackRoot.querySelector<HTMLSelectElement>(`select[name="previewSecond_${n}"], select[name="preview_sec_${n}"]`)
        if (minSel) selectByText(minSel, String(mm).padStart(2, '0'), `Track ${n} preview minute`)
        if (secSel) selectByText(secSel, String(ss).padStart(2, '0'), `Track ${n} preview second`)
        if (!minSel && !secSel) {
          filled.push(`Track ${n} preview → ${total}s (set mm:ss manually if selects appear)`)
        }
      }
    } else {
      const previewNo =
        trackRoot.querySelector<HTMLInputElement>(
          `input[type="radio"][name="previewStart_${n}"][value="no"]`
        ) ||
        document.querySelector<HTMLInputElement>(
          `input[type="radio"][name="previewStart_${n}"][value="no"]`
        )
      setRadio(previewNo, `Track ${n} preview → auto`)
    }
  })

  // Apple Music Additional Requirements — performer + producer (DistroKid ids: track-N-performer-1-*).
  function openAppleCreditsSection() {
    const section = byId<HTMLElement>('requirements-credits')
    if (!section) return false
    if (!section.classList.contains('open')) {
      const title = section.querySelector<HTMLElement>('.requirements-item-title')
      if (title) clickEl(title)
    }
    return true
  }

  function selectOptionContaining(select: HTMLSelectElement, wantRaw: string, label: string) {
    const want = normalize(wantRaw)
    if (!want) {
      skipped.push(`${label} (empty)`)
      return
    }
    const option = Array.from(select.options).find((opt) => {
      const text = normalize(opt.text)
      const value = normalize(opt.value)
      return (
        text === want ||
        value === want ||
        text.includes(want) ||
        want.includes(text) ||
        (want.includes('drum') && /drum/.test(text))
      )
    })
    if (!option) {
      skipped.push(`${label} (option “${wantRaw}” missing)`)
      return
    }
    setNativeValue(select, option.value)
    filled.push(label)
  }

  openAppleCreditsSection()
  packet.tracks.forEach((track, index) => {
    const n = track.track_number || index + 1
    const performerName = (track.apple_performer_name || '').trim()
    const performerInstrument = (track.apple_performer_instrument || 'Drum Machine').trim()
    const producerName = (track.apple_producer_name || performerName).trim()
    if (!performerName && !producerName) return

    const performerRole = byId<HTMLSelectElement>(`track-${n}-performer-1-role`)
    const performerNameEl = byId<HTMLInputElement>(`track-${n}-performer-1-name`)
    const performerInstrumentSel =
      byId<HTMLSelectElement>(`track-${n}-performer-1-instrument`) ||
      byId<HTMLSelectElement>(`track-${n}-performer-1-instrument-type`) ||
      document.querySelector<HTMLSelectElement>(
        `select[id*="track-${n}-performer"][id*="instrument"], select[name*="track_${n}_performer"][name*="instrument"]`
      )

    if (performerNameEl && performerName) setText(performerNameEl, performerName, `Track ${n} Apple performer name`)
    if (performerRole) {
      selectOptionContaining(
        performerRole,
        performerInstrument,
        `Track ${n} Apple performer role (${performerInstrument})`
      )
      // Some DistroKid builds use a generic performer role + separate instrument select.
      if (performerInstrumentSel) {
        selectOptionContaining(
          performerInstrumentSel,
          performerInstrument,
          `Track ${n} Apple performer instrument (${performerInstrument})`
        )
      }
    } else if (performerName) {
      skipped.push(`Track ${n} Apple performer role (open “Apple Music Additional Requirements”)`)
    }

    const producerRole = byId<HTMLSelectElement>(`track-${n}-producer-1-role`)
    const producerNameEl = byId<HTMLInputElement>(`track-${n}-producer-1-name`)
    if (producerNameEl && producerName) setText(producerNameEl, producerName, `Track ${n} Apple producer name`)
    if (producerRole) selectOptionContaining(producerRole, 'Producer', `Track ${n} Apple producer role`)
    else if (producerName) skipped.push(`Track ${n} Apple producer role (section missing)`)
  })

  // Final pass: clear red empty featured-name slots when Featuring is OFF.
  packet.tracks.forEach((track, index) => {
    const n = track.track_number || index + 1
    const addFeat = byId<HTMLInputElement>(`js-add-feat-${n}`)
    const noFeat = byId<HTMLInputElement>(`js-no-feat-${n}`)
    const wantsFeat = Boolean((track.featuring || '').trim())
    if (!wantsFeat) {
      if (addFeat?.checked || !noFeat?.checked) setRadio(noFeat, `Track ${n} featuring → No (repair)`)
      for (let slot = 1; slot <= 6; slot++) {
        const stray = byId<HTMLInputElement>(`tracks_${n}_artists_${slot}_artist`)
        if (stray?.value) {
          setNativeValue(stray, '')
          filled.push(`Track ${n} cleared empty featured slot ${slot}`)
        }
      }
    } else {
      const artistInput = byId<HTMLInputElement>(`tracks_${n}_artists_1_artist`)
      if (artistInput && !artistInput.value.trim()) {
        skipped.push(`Track ${n} featured artist Name still empty (red)`)
      }
    }
  })

  // Featured-artist Spotify/Apple/YouTube mapping: Studio has no guest URIs yet → choose
  // “No — doesn’t yet have artist profiles” so empty URI fields do not stay red.
  const mappingYes = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="radio"][id^="js-artist-mapping-"]')
  )
  for (const yes of mappingYes) {
    const idx = (yes.id.match(/js-artist-mapping-(\d+)/) || [])[1]
    if (idx == null) continue
    const spotify = byId<HTMLInputElement>(`js-my-spotify-artist-mapping-${idx}`)
    const apple = byId<HTMLInputElement>(`js-my-apple-artist-mapping-${idx}`)
    const google = byId<HTMLInputElement>(`js-my-google-artist-mapping-${idx}`)
    const hasUri = Boolean(
      (spotify?.value || '').trim() || (apple?.value || '').trim() || (google?.value || '').trim()
    )
    if (hasUri) continue
    const noProfiles = byId<HTMLInputElement>(`js-let-streaming-services-decide-${idx}`)
    setRadio(noProfiles, `Featured artist mapping ${idx} → no profiles yet`)
  }

  // Audit remaining empty featured Name fields while Featuring=Yes (DistroKid red).
  for (let n = 1; n <= 35; n++) {
    const addFeat = byId<HTMLInputElement>(`js-add-feat-${n}`)
    if (!addFeat?.checked) continue
    const name = byId<HTMLInputElement>(`tracks_${n}_artists_1_artist`)
    if (name && !name.value.trim()) {
      skipped.push(`Track ${n} featured Name empty while Featuring=Yes (red)`)
    }
  }

  return { filled, skipped, errors }
}

export async function prefillDistroKidPage(
  page: FillablePage,
  packet: DistroKidPrefillPacket
): Promise<DistroKidPrefillResult> {
  const url = page.url()
  if (!/distrokid\.com\/new/i.test(url)) {
    return {
      ok: false,
      filled: [],
      skipped: [],
      errors: [`Open DistroKid new-release first (got ${url}).`],
      url,
    }
  }

  async function runPass(): Promise<{ filled: string[]; skipped: string[]; errors: string[] }> {
    try {
      return (await page.evaluate(distrokidPrefillInPage as never, packet as never)) as {
        filled: string[]
        skipped: string[]
        errors: string[]
      }
    } catch (err) {
      return { filled: [], skipped: [], errors: [`evaluate failed: ${String(err)}`] }
    }
  }

  // Pass 1: set song count + album fields.
  const first = await runPass()
  // DistroKid rebuilds track rows after howManySongs change — wait for titles + songwriter rows.
  const trackCount = Math.max(1, packet.tracks.length)
  for (let attempt = 0; attempt < 16; attempt++) {
    if (page.waitForTimeout) await page.waitForTimeout(450)
    else await sleep(450)
    try {
      const titleFeat = (await page.evaluate(
        ((n: number) =>
          Boolean(
            document.querySelector(`input[placeholder="Track ${n} title"]`) &&
              document.getElementById(`js-no-feat-${n}`)
          )) as never,
        trackCount as never
      )) as boolean
      const writersReady = (await page.evaluate(
        ((n: number) => {
          let ok = 0
          for (let i = 1; i <= n; i++) {
            if (document.querySelector(`input[name="songwriter_real_name_first${i}"]`)) ok += 1
          }
          return ok >= Math.min(n, 2)
        }) as never,
        trackCount as never
      )) as boolean
      if (titleFeat && (writersReady || attempt >= 8)) break
    } catch {
      /* keep waiting */
    }
    if (attempt === 4 || attempt === 8 || attempt === 12) {
      try {
        await page.evaluate(
          ((n: number) => {
            const sel = document.getElementById('howManySongsOnThisAlbum') as HTMLSelectElement | null
            if (!sel) return
            sel.value = String(n)
            sel.dispatchEvent(new Event('change', { bubbles: true }))
            const w = window as unknown as {
              jQuery?: (el: HTMLElement) => { val: (v?: string) => unknown; trigger: (e: string) => unknown }
            }
            if (typeof w.jQuery === 'function') {
              const $el = w.jQuery(sel)
              $el.val(String(n))
              $el.trigger('change')
            }
            // Nudge “original song” radios so legal-name rows mount.
            for (let i = 1; i <= n; i++) {
              const original = document.getElementById(
                `not_coversong_radio_button_${i}`
              ) as HTMLInputElement | null
              if (original && !original.checked) {
                original.checked = true
                original.click()
                original.dispatchEvent(new Event('change', { bubbles: true }))
              }
            }
          }) as never,
          trackCount as never
        )
      } catch {
        /* ignore */
      }
    }
  }

  // Pass 2–4: fill expanded track rows + album title + legal names after original-song expand.
  const second = await runPass()
  if (page.waitForTimeout) await page.waitForTimeout(900)
  else await sleep(900)
  const third = await runPass()
  if (page.waitForTimeout) await page.waitForTimeout(700)
  else await sleep(700)
  const fourth = await runPass()

  const filled = Array.from(
    new Set([...first.filled, ...second.filled, ...third.filled, ...fourth.filled])
  )
  // Drop stale “fields missing” skips if a later pass filled the same control.
  const skippedRaw = Array.from(
    new Set([...first.skipped, ...second.skipped, ...third.skipped, ...fourth.skipped])
  )
  const skipped = skippedRaw.filter((item) => {
    if (/songwriter \(fields missing\)/i.test(item)) {
      const track = item.match(/Track\s+(\d+)/i)?.[1]
      return !filled.some((f) => new RegExp(`Track\\s+${track}\\s+songwriter`, 'i').test(f))
    }
    if (/control missing/i.test(item)) {
      const stem = item.replace(/\s*\(control missing\)\s*$/i, '')
      return !filled.some((f) => f.startsWith(stem) || f.includes(stem))
    }
    if (/Featuring=Yes \(red\)|featured Name still empty/i.test(item)) return true
    return true
  })
  const errors = Array.from(
    new Set([...first.errors, ...second.errors, ...third.errors, ...fourth.errors])
  )

  return {
    ok: filled.length > 0 && !errors.some((e) => e.startsWith('evaluate failed')),
    filled,
    skipped,
    errors,
    url: page.url(),
  }
}

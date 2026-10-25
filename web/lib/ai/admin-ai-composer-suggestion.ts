/**
 * Ghost text for an empty admin composer.
 * One next message. Tab inserts it.
 * Open work comes first. Once that goal is finished, the ghost offers one
 * unused upgrade. A future-dated step also yields an armed prompt.
 */

import { parseAdminChatActionChoices } from '@/lib/ai/admin-chat-action-choices'

export type ComposerGhostMessage = {
  role: string
  content: string
  toolSteps?: { summary?: string | null }[] | null
}

export type ComposerGhostInput = {
  messages?: ComposerGhostMessage[] | null
  /** Submit-row label from the held-actions bar, such as "Release UPC 700563968501 — submit". */
  heldWrite?: string | null
  /** Clock for "wait until" steps. Tests pin this; the panel uses today. */
  now?: Date | string | null
  /** Sticky chat goal, when the thread has one. */
  goal?: string | null
  /** Release the chat is working on. */
  releaseTitle?: string | null
  /** Release Studio gaps already on the open page. */
  studio?: {
    title?: string | null
    nextAction?: string | null
    blockers?: string[] | null
    hasArtwork?: boolean | null
    hasGenre?: boolean | null
    trackCount?: number | null
    releaseDate?: string | null
    readinessScore?: number | null
  } | null
  /** The form field the user is focused on, when field focus is on. */
  focus?: {
    fieldLabel?: string | null
    fieldKey?: string | null
    fieldType?: string | null
    value?: string | null
    section?: string | null
    entityLabel?: string | null
    hint?: string | null
  } | null
}

const MAX_SUGGESTION = 280

function clip(value: string, max = MAX_SUGGESTION): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 80 ? cut.slice(0, space) : cut).trim()}…`
}

function latestOutcome(message: ComposerGhostMessage): string {
  const steps = (message.toolSteps ?? [])
    .map((step) => step.summary?.trim() ?? '')
    .filter((summary) => summary && summary !== 'Working…')
  if (steps.length) return steps.slice(-4).join('\n')
  return ''
}

function conversational(messages: ComposerGhostMessage[]): ComposerGhostMessage[] {
  return messages.filter((message) => {
    if (message.role !== 'assistant') return false
    const text = message.content.trim()
    if (!text || text === 'Working…' || text === '…') return false
    return true
  })
}

function isAssistantError(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length > 500) return false
  return /^(error:|runbook preview failed:|apply preview failed:|playbook error:|preflight blocked|skill output validation failed)/i.test(
    trimmed,
  )
}

function codeNear(text: string, label: RegExp): string | null {
  const match = label.exec(text)
  if (!match || match.index == null) return null
  const window = text.slice(match.index, match.index + 120)
  return window.match(/\b(\d{12,13})\b/)?.[1] ?? null
}

function upcMismatchFollowUp(text: string): string | null {
  const distro = codeNear(text, /distrokid upc/i)
  const studio = codeNear(text, /studio upc/i)
  if (!distro || !studio || distro === studio) return null
  return `Approve the Studio UPC write from ${studio} to ${distro}.`
}

function stuckOnAdminLogin(text: string): boolean {
  return /admin\/login/i.test(text) || (/admin login/i.test(text) && /sign in/i.test(text))
}

function recommendationFrom(text: string): string | null {
  const at = text.search(/recommendation\b/i)
  if (at < 0) return null
  const slice = text.slice(at, at + 1600)
  const rows = [...slice.matchAll(/^\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|/gm)]
    .map((match) => ({
      scenario: match[1].replace(/[*_`]/g, '').trim(),
      action: match[2].replace(/[*_`]/g, '').trim(),
    }))
    .filter(
      (row) =>
        row.scenario.length > 2 &&
        row.action.length > 2 &&
        !/^scenario$/i.test(row.scenario) &&
        !/^action$/i.test(row.action) &&
        !/^[-:| ]+$/.test(row.scenario),
    )
  if (!rows.length) return null
  const action = rows[0]!.action.replace(/[.]+$/g, '').trim()
  if (action.length < 2) return null
  return `Priority: ${action}.`
}

function shortAnswer(text: string): string | null {
  const match = text.match(/short answer:\s*([^\n]+)/i)
  if (!match?.[1]) return null
  const sentence = match[1].replace(/[*_`]/g, '').trim()
  if (sentence.length < 8) return null
  return sentence.replace(/[.]+$/g, '')
}

function choiceFollowUp(text: string): string | null {
  const parsed = parseAdminChatActionChoices(text)
  if (!parsed) return null
  if (parsed.proceedAll && parsed.options.length >= 2) {
    const first = parsed.options[0]?.label.replace(/[.]+$/g, '').trim()
    if (!first) return null
    return clip(`Priority: ${first}.`)
  }
  const pick = parsed.options[0]
  if (!pick) return null
  const message = pick.label.replace(/\s+/g, ' ').trim()
  if (!message || /^(yes|no)$/i.test(message)) return null
  return clip(`Priority: ${message}.`)
}

function errorFollowUp(text: string): string | null {
  const trimmed = text.trim()
  if (!isAssistantError(trimmed) && !/^unauthorized$/i.test(trimmed)) return null
  const reason = trimmed.replace(/^(error:\s*)/i, '').replace(/\s+/g, ' ').trim()
  if (/unauthorized/i.test(reason)) {
    return 'The last reply failed with Unauthorized, so nothing was completed. Sign in again, then have the assistant continue that same step.'
  }
  return clip(`The last reply failed (${reason}). Fix that failure, then have the assistant continue the same step.`)
}

type WorkflowStep = { title: string; detail: string }

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

function workflowSteps(text: string): WorkflowStep[] {
  const at = text.search(/the right workflow|what (?:you|we) should do next|priority from here/i)
  if (at < 0) return []
  return text
    .slice(at, at + 2200)
    .split(/\n+/)
    .map((line) => line.replace(/^[\d]+[.)]\s*/, '').replace(/[`*]/g, '').trim())
    .filter((line) => line.length > 12 && !/the right workflow/i.test(line) && !/^what the snapshot/i.test(line))
    .filter((line) => /^[A-Z][^:]{0,40}—/.test(line) || /^(wait|pull|write|register|store|update|copy|let)\b/i.test(line))
    .slice(0, 3)
    .map((line) => {
      const parts = line.split(/\s+[—–-]\s+/)
      const title = (parts[0] ?? '').replace(/[:.]+$/g, '').trim()
      const detail = (parts.slice(1).join(' — ') || '').trim()
      return { title, detail }
    })
    .filter((step) => step.title.length > 1)
}

function isBlockingWait(step: WorkflowStep): boolean {
  return /^wait$/i.test(step.title) || /^let\b/i.test(step.title)
}

function workflowSuggestion(text: string): string | null {
  const steps = workflowSteps(text)
  if (!steps.length) return null
  const actions = steps.map((step) => {
    if (/^wait$/i.test(step.title)) {
      const sentence = step.detail.split(/[.(]/)[0]?.trim() ?? ''
      return sentence || step.title
    }
    return step.title
  })
  const [first, ...rest] = actions
  if (!first) return null
  const next = rest.length
    ? ` Then ${rest.map((step) => `${step.charAt(0).toLowerCase()}${step.slice(1)}`).join('. Then ')}.`
    : ''
  return `Priority: ${first}.${next}`
}

function calendarDay(text: string): { year: number; month: number; day: number } | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) }
  const named = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i,
  )
  if (!named) return null
  const month = MONTH_INDEX[named[1].slice(0, 3).toLowerCase()]
  if (month == null) return null
  return { year: Number(named[3]), month, day: Number(named[2]) }
}

function clockTime(text: string): { hour: number; minute: number } | null {
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (ampm) {
    let hour = Number(ampm[1])
    const minute = Number(ampm[2] ?? '0')
    const mer = ampm[3].toLowerCase()
    if (hour === 12) hour = mer === 'am' ? 0 : 12
    else if (mer === 'pm') hour += 12
    if (hour > 23 || minute > 59) return null
    return { hour, minute }
  }
  const h24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (!h24) return null
  return { hour: Number(h24[1]), minute: Number(h24[2]) }
}

function scheduledInstant(text: string): Date | null {
  const day = calendarDay(text)
  if (!day) return null
  const time = clockTime(text) ?? { hour: 9, minute: 0 }
  return new Date(day.year, day.month, day.day, time.hour, time.minute, 0, 0)
}

function formatArmedWhen(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export type ArmedPromptPlan = {
  prompt: string
  runAt: number
  whenLabel: string
}

/** The later action, armed for the date and time named in the reply. */
export function planArmedPrompt(reply: string, now: Date = new Date()): ArmedPromptPlan | null {
  const steps = workflowSteps(reply)
  if (!steps.length) return null
  const blob = steps.map((step) => `${step.title} ${step.detail}`).join('\n')
  const when = scheduledInstant(blob)
  if (!when || when.getTime() <= now.getTime()) return null
  const later = steps.filter((step) => !isBlockingWait(step))
  if (!later.length) return null
  const laterBlob = later.map((step) => `${step.title} ${step.detail}`).join(' ')
  const prompt = /isrc/i.test(laterBlob)
    ? 'Copy each DistroKid ISRC into this release.'
    : later.map((step) => step.title.replace(/[.]+$/g, '').trim()).join('. Then ') + '.'
  return { prompt, runAt: when.getTime(), whenLabel: formatArmedWhen(when) }
}

export type StoredArmedPrompt = {
  id: string
  prompt: string
  runAt: number
  whenLabel: string
  status: 'armed' | 'fired' | 'cancelled'
}

/** Kept on the chat so a long armed list can scroll. The menu shows four at a time. */
export const MAX_STORED_ARMED_PROMPTS = 16

export function sanitizeArmedPrompts(raw: unknown): StoredArmedPrompt[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Partial<StoredArmedPrompt>
      if (typeof row.prompt !== 'string' || !row.prompt.trim()) return []
      if (typeof row.runAt !== 'number' || !Number.isFinite(row.runAt)) return []
      const status: StoredArmedPrompt['status'] =
        row.status === 'fired' || row.status === 'cancelled' ? row.status : 'armed'
      return [
        {
          id: typeof row.id === 'string' && row.id ? row.id : `armed-${row.runAt}`,
          prompt: row.prompt.trim().slice(0, 400),
          runAt: row.runAt,
          whenLabel: typeof row.whenLabel === 'string' ? row.whenLabel.slice(0, 80) : formatArmedWhen(new Date(row.runAt)),
          status,
        },
      ]
    })
    .slice(-MAX_STORED_ARMED_PROMPTS)
}

function loginFollowUp(reply: string): string {
  const plan = recommendationFrom(reply)?.replace(/^Priority:\s*/i, '') || shortAnswer(reply) || ''
  const stalled = 'Continue that on the Studio page already signed in. The side browser stopped on Admin Login.'
  if (!plan) return clip(stalled)
  return clip(`${plan.replace(/[.]+$/g, '')}. ${stalled}`)
}

function isPageChrome(line: string): boolean {
  return (
    line.length > 240 ||
    /^https?:/i.test(line) ||
    /^(done|working…|admin_browser|query_|opened https?:)/i.test(line) ||
    /^preview created\b/i.test(line) ||
    /\bexecuted\.?$/i.test(line) ||
    /privacy policy|cookie policy|terms of use|© |all rights reserved/i.test(line)
  )
}

function isWorkflowStepLine(line: string): boolean {
  return /^(wait|pull|write|register|store|update|copy|let)\b/i.test(line) || /^[A-Z][^:]{0,48}—/.test(line)
}

/** Sentences the assistant actually said, ignoring scraped pages and tool status. */
function proseIntents(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/[`*]/g, '').trim())
    .filter((line) => line.length >= 20 && line.length <= 220 && !isPageChrome(line) && !isWorkflowStepLine(line))
}

function actionSentence(line: string): string {
  const parts = line
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12)
  const action = [...parts]
    .reverse()
    .find((part) => /\b(let me|i'll|i will|navigate|open|go to|update|approve|draft)\b/i.test(part))
  return action || line
}

function latestProseIntent(text: string): string | null {
  const intents = proseIntents(text)
  const action = [...intents]
    .reverse()
    .find((line) => /\b(let me|i'll|i will|navigate|open|pull|copy|write|check|read|go to|update|approve|draft)\b/i.test(line))
  const chosen = action || intents.at(-1)
  return chosen ? actionSentence(chosen) : null
}

function informativeToolLine(outcome: string): string | null {
  const lines = outcome
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const line = [...lines]
    .reverse()
    .find(
      (row) =>
        row.length > 18 &&
        row.length < 200 &&
        !/^(done|working…|scrolled the page\.?)$/i.test(row) &&
        !/^opened https?:\/\/\S*admin\/login/i.test(row),
    )
  return line || null
}

function summarizeReply(reply: string, outcome: string): string | null {
  const prose = latestProseIntent(reply)
  const workflowAt = reply.search(/the right workflow|what (?:you|we) should do next|priority from here/i)
  const proseAt = prose ? reply.lastIndexOf(prose.slice(0, 40)) : -1
  const proseIsAction = Boolean(
    prose && /\b(let me|i'll|i will|navigate|open|go to|update|approve|draft)\b/i.test(prose),
  )
  if (prose && proseIsAction && workflowAt >= 0 && proseAt > workflowAt) return prose
  const workflow = workflowSuggestion(reply)
  if (workflow) return workflow
  const stalled = stuckOnAdminLogin(outcome) || stuckOnAdminLogin(reply.slice(-700))
  if (stalled) return loginFollowUp(reply)
  const upc = upcMismatchFollowUp(reply)
  if (upc) return upc
  const recommendation = recommendationFrom(reply)
  if (recommendation) return recommendation
  const lead = shortAnswer(reply)
  if (lead) return clip(lead.endsWith('.') ? lead : `${lead}.`)
  const choice = choiceFollowUp(reply)
  if (choice) return choice
  const error = errorFollowUp(reply)
  if (error) return error
  if (prose) return prose
  const tool = informativeToolLine(outcome)
  if (tool) return tool
  return null
}

function heldWriteMessage(label: string | null | undefined): string {
  const clean = (label ?? '').replace(/\s+[—–-]\s+(submit|preview)\s*$/i, '').trim()
  if (!clean || /preview$/i.test(clean)) return ''
  const upc = clean.match(/\b(\d{12,13})\b/)
  if (/upc/i.test(clean) && upc) return `Approve the Studio UPC write for ${upc[1]}.`
  return `Approve the held write: ${clean}.`
}

/** The thread ended on a tool status line. Offer the next thing to ask, not the status. */
function toolStatusFollowUp(messages: ComposerGhostMessage[]): string | null {
  const replies = conversational(messages)
  const last = replies[replies.length - 1]
  if (!last || !isPageChrome(last.content.trim())) return null
  const text = last.content.trim()
  if (/^preview created\b/i.test(text) && !/executed\.?$/i.test(text)) {
    return 'Approve the preview and run it.'
  }
  const ask = lastUserAsk(messages)
  const tool = ask.match(/\/exec\s+([a-z0-9_]+)/i)?.[1] || text.match(/^([a-z0-9_]+) executed/i)?.[1] || ''
  const focus = ask.match(/"focus"\s*:\s*"([^"]+)"/i)?.[1]
  if (tool === 'query_ops_snapshot') return `Read the ${focus || 'ops'} snapshot and name the next action.`
  if (tool === 'query_release_studio_snapshot') return 'Read that release snapshot and name the next unfinished step.'
  if (tool === 'query_platform_growth_snapshot') return 'Read the growth snapshot and name the next outreach move.'
  if (tool === 'query_studio_command_center') return 'Read the command center and name the next due step.'
  if (tool === 'query_intelligence_harness') return 'Use the harness result and name the next step.'
  if (tool) return `Use the ${tool.replace(/_/g, ' ')} result and name the next action.`
  return null
}

function asUserMessage(priority: string): string {
  let stripped = priority.replace(/^Priority:\s*/i, '').replace(/\s+/g, ' ').trim()
  stripped = stripped.replace(/^(let me|i'll|i will)\s+/i, '')
  const text = stripped ? `${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}` : ''
  if (!text) return ''
  return clip(text.endsWith('.') || text.endsWith('…') ? text : `${text}.`)
}

function focusFieldSuggestion(focus: NonNullable<ComposerGhostInput['focus']>): string {
  const label = (focus.fieldLabel || focus.fieldKey || 'this field').replace(/\s+/g, ' ').trim()
  const section = focus.section?.replace(/\s+/g, ' ').trim()
  const entity = focus.entityLabel?.replace(/\s+/g, ' ').trim()
  const where = [section, entity].filter((part) => part && !label.toLowerCase().includes(part.toLowerCase())).join(', ')
  const target = where ? `${label} (${where})` : label
  const value = focus.value?.replace(/\s+/g, ' ').trim() ?? ''
  const empty = !value || value === 'false'
  if (focus.fieldType === 'checkbox') {
    return value === 'true' ? `Review whether ${target} should stay on.` : `Turn on ${target} if it belongs on this release.`
  }
  if (empty) return `Draft a strong value for ${target}.`
  const shown = (value.length > 80 ? `${value.slice(0, 77).trim()}…` : value).replace(/[.]+$/g, '')
  const sentence = `Suggest a refined value for ${target}. Current value: ${shown}`
  return sentence.endsWith('…') ? sentence : `${sentence}.`
}

export function clock(value: Date | string | null | undefined): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

function formatDay(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

function doneRecord(messages: ComposerGhostMessage[]): string {
  const tools = messages.flatMap((message) => (message.toolSteps ?? []).map((step) => step.summary ?? ''))
  const reports = messages.flatMap((message) => proseIntents(message.content))
  return [...tools, ...reports].join('\n').toLowerCase()
}

function doneLines(done: string): string[] {
  return done
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function openedIsrcPage(done: string): boolean {
  return doneLines(done).some((line) => /opened/.test(line) && /isrc/.test(line))
}

function isrcsWritten(done: string): boolean {
  return doneLines(done).some(
    (line) =>
      /isrc/.test(line) &&
      /\b(copied|patched|wrote|written|updated)\b/.test(line) &&
      /\b(studio|catalog|release|track)\b/.test(line),
  )
}

function workflowMentionsIsrc(steps: WorkflowStep[]): boolean {
  return steps.some((step) => /isrc/i.test(`${step.title} ${step.detail}`))
}

function isIsrcJob(step: WorkflowStep, steps: WorkflowStep[]): boolean {
  const blob = `${step.title} ${step.detail}`.toLowerCase()
  if (/isrc/.test(blob) && /\b(pull|copy|write|patch)\b/.test(blob)) return true
  return workflowMentionsIsrc(steps) && /\b(write|patch)\b/.test(blob) && /studio|catalog/.test(blob)
}

function stepStillOpen(step: WorkflowStep, done: string, steps: WorkflowStep[]): boolean {
  if (isIsrcJob(step, steps)) return !isrcsWritten(done)
  return true
}

function stepFollowUp(step: WorkflowStep, steps: WorkflowStep[]): string {
  if (isIsrcJob(step, steps)) return 'Copy each DistroKid ISRC into this release.'
  if (/^wait$/i.test(step.title)) return step.detail.split(/[.(]/)[0]?.trim() || step.title
  return step.title
}

function intentStillOpen(intent: string, done: string): boolean {
  const lower = intent.toLowerCase()
  if (/\b(navigat\w*|open)\b/.test(lower) && /isrc/.test(lower)) return !openedIsrcPage(done)
  if (/\b(pull|copy|write)\b/.test(lower) && /isrc/.test(lower)) return !isrcsWritten(done)
  return true
}

/**
 * Next follow-up from the whole thread: finished tool steps come off the list,
 * a future wait is not the action, and a newer undone step outranks the old plan.
 */
function prioritizedFollowUp(messages: ComposerGhostMessage[], now: Date): string | null {
  const replies = conversational(messages)
  if (!replies.length) return null
  const done = doneRecord(replies)
  const steps = workflowSteps(replies.map((reply) => reply.content).join('\n'))
  const intent = latestProseIntent(replies[replies.length - 1]?.content ?? '')
  const intentIsAction = Boolean(
    intent && /\b(let me|i'll|i will|navigate|open|go to|draft|approve|update)\b/i.test(intent),
  )
  const wait = steps.find((step) => isBlockingWait(step))
  const waitUntil = wait ? scheduledInstant(`${wait.title} ${wait.detail}`) : null
  const waiting = Boolean(waitUntil && waitUntil.getTime() > now.getTime())
  const actionable = steps.filter((step) => !isBlockingWait(step) && stepStillOpen(step, done, steps))

  if (intent && intentIsAction && !RESUPPLY_ASK.test(intent) && intentStillOpen(intent, done)) return intent
  if (waiting && !openedIsrcPage(done)) {
    const after = actionable[0]
    if (!after || !waitUntil) return null
    const follow = stepFollowUp(after, steps)
    return `After DistroKid delivers on ${formatDay(waitUntil)}, ${follow.charAt(0).toLowerCase()}${follow.slice(1)}`
  }
  const next = actionable[0]
  return next ? stepFollowUp(next, steps) : null
}

const GOAL_DONE =
  /\b(?:goal is (?:done|complete|finished)|that(?:'s| is) everything for (?:this|the) goal|nothing left on (?:this|the) goal|workflow is complete|(?:the )?(?:upc|isrcs?|codes) (?:now )?match(?:es)? distrokid|copied (?:each|the) distrokid isrcs? into)\b/i

function goalWorkSettled(messages: ComposerGhostMessage[]): boolean {
  const replies = conversational(messages)
  if (!replies.length) return false
  const done = doneRecord(replies)
  const transcript = replies.map((reply) => reply.content).join('\n')
  const steps = workflowSteps(transcript)
  const intent = latestProseIntent(replies[replies.length - 1]?.content ?? '')
  const intentIsAction = Boolean(
    intent && /\b(let me|i'll|i will|navigate|open|go to|draft|approve|update)\b/i.test(intent),
  )
  if (intent && intentIsAction && intentStillOpen(intent, done)) return false
  const open = steps.filter((step) => !isBlockingWait(step) && stepStillOpen(step, done, steps))
  if (open.length) return false
  const closed = steps.some((step) => !isBlockingWait(step) && !stepStillOpen(step, done, steps))
  return closed || GOAL_DONE.test(transcript)
}

function releaseName(input: ComposerGhostInput): string {
  const title = input.releaseTitle?.trim() || input.studio?.title?.trim()
  return title || 'this release'
}

function dropLabel(messages: ComposerGhostMessage[], studioDate: string | null | undefined): string | null {
  const fromThread = calendarDay(messages.map((message) => message.content).join('\n'))
  const day = fromThread ?? (studioDate ? calendarDay(studioDate) : null)
  if (!day) return null
  return formatDay(new Date(day.year, day.month, day.day))
}

function repeatsFinishedWork(text: string, done: string): boolean {
  const lower = text.toLowerCase()
  if (/isrc/.test(lower) && isrcsWritten(done)) return true
  if (/upc/.test(lower) && /upc/.test(done) && /patched|wrote|written|matches/.test(done)) return true
  if (/\bnavigat/.test(lower) && /isrc/.test(lower) && openedIsrcPage(done)) return true
  return false
}

/**
 * One unused improvement once the chat's goal is finished.
 * Studio gaps come first. Then advice the thread has not already covered.
 */
function creativeFollowUp(input: ComposerGhostInput, messages: ComposerGhostMessage[]): string | null {
  const replies = conversational(messages)
  const done = doneRecord(replies)
  const blob = replies.map((reply) => reply.content).join('\n').toLowerCase()
  const name = releaseName(input)
  const drop = dropLabel(replies, input.studio?.releaseDate)
  const tracks =
    input.studio?.trackCount && input.studio.trackCount > 0
      ? `the ${input.studio.trackCount} tracks`
      : 'the catalog facts already in this chat'
  const aimed = drop ? `, aimed at the ${drop} drop` : ''

  if (input.studio?.hasArtwork === false) {
    return `Attach final cover art for ${name} so the stores are not waiting on a placeholder.`
  }
  if (input.studio?.hasGenre === false) {
    return `Set the store genre for ${name} so delivery does not have to guess it.`
  }

  const blocker = (input.studio?.blockers ?? []).find(
    (row) => row.trim().length > 8 && !repeatsFinishedWork(row, done),
  )
  if (blocker) return `Clear the remaining gap on ${name}: ${blocker.trim().replace(/[.]+$/g, '')}.`

  const nextAction = input.studio?.nextAction?.trim() ?? ''
  if (
    nextAction.length >= 12 &&
    nextAction.length <= 180 &&
    !/ready for distribution|nothing left|all set/i.test(nextAction) &&
    !repeatsFinishedWork(nextAction, done)
  ) {
    return nextAction
  }

  const upgrades = [
    {
      seen: /spotify pitch/,
      text: `Draft a Spotify pitch for ${name} from ${tracks}${aimed}.`,
    },
    {
      seen: /elevator pitch|press blurb/,
      text: `Tighten the elevator pitch for ${name} so the first line names the groove${drop ? ` and the ${drop} drop` : ''}.`,
    },
    {
      seen: /sonic dna/,
      text: `Fill the missing Sonic DNA pass on ${name}.`,
    },
    {
      seen: /soundexchange/,
      text: `Register ${name} with SoundExchange. The ISRC locker is storage, not registration.`,
    },
    {
      seen: /smartlink|hyperfollow|tracked listen/,
      text: `Build a tracked listen link for ${name}${drop ? ` before the ${drop} drop` : ''}.`,
    },
    {
      seen: /youtube visualizer|timestamp/,
      text: `Map YouTube visualizer timestamps for ${name} from the track order.`,
    },
  ]
  const unused = upgrades.find((option) => !option.seen.test(blob))
  return unused?.text ?? `Find one artwork, mix, or store-page upgrade on ${name} this chat has not touched.`
}

export type ReplyFollowUp = {
  id: string
  label: string
  message: string
}

const RESUPPLY_ASK =
  /\b(paste|drop)\b[\s\S]{0,80}\b(copy|content|draft|it here|email|body)\b|\b(do not|don't|did not|didn't)\s+see it\b|\bneed the actual copy\b|\b(did not|didn't)\s+paste\b/i

function looksLikeDraft(text: string): boolean {
  return text.length > 80 && /\bsubject\s*:/i.test(text)
}

function followUpId(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${index}-${slug || 'next'}`
}

function sentence(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return /[.!?…]$/.test(text) ? text : `${text}.`
}

function idAfter(text: string, marker: RegExp): string | null {
  const at = text.search(marker)
  if (at < 0) return null
  return text.slice(at, at + 280).match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0] ?? null
}

function campaignFacts(text: string, releaseTitle: string | null): {
  name: string
  id: string
  when: string
  slug: string
  smartlinkId: string
  tool: string
} {
  const plain = text.replace(/\*\*/g, '').replace(/`/g, '')
  const named =
    plain.match(/campaign:\s*[“"]([^"”\n]+)[”"]/i)?.[1]?.trim() ||
    plain.match(/"([^"\n]{3,80}-\s*release campaign)"/i)?.[1]?.trim() ||
    ''
  const when =
    plain.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] ||
    plain.match(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/i,
    )?.[0] ||
    ''
  return {
    name: named || releaseTitle?.trim() || '',
    id: idAfter(plain, /\bcampaign\b/i) || '',
    when,
    slug: plain.match(/smartlink slug:\s*([a-z0-9-]+)/i)?.[1] || '',
    smartlinkId: idAfter(plain, /smartlink id/i) || '',
    tool: plain.match(/\b(generate_[a-z0-9_]+)\b/i)?.[1] || '',
  }
}

function lastUserAsk(messages: ComposerGhostMessage[]): string {
  const ask = [...messages].reverse().find((message) => message.role === 'user' && message.content.trim())
  return ask?.content.replace(/\s+/g, ' ').trim() ?? ''
}

function pushFollowUp(items: ReplyFollowUp[], label: string, message: string) {
  const cleanLabel = label.replace(/\s+/g, ' ').trim()
  const cleanMessage = sentence(message)
  if (!cleanLabel || !cleanMessage) return
  const key = cleanLabel.toLowerCase()
  if (items.some((item) => item.label.toLowerCase() === key || item.message.toLowerCase() === cleanMessage.toLowerCase())) return
  items.push({ id: followUpId(cleanLabel, items.length), label: cleanLabel, message: clip(cleanMessage, 700) })
}

function draftAlreadyWritten(replies: ComposerGhostMessage[]): boolean {
  if (replies.length < 2) return false
  return replies.slice(0, -1).some((reply) => looksLikeDraft(reply.content))
}

/** The reply asked the user to resupply a draft this thread already wrote. */
function recoverDraftFollowUps(input: ComposerGhostInput, replies: ComposerGhostMessage[]): ReplyFollowUp[] {
  const last = replies[replies.length - 1]
  if (!last || !RESUPPLY_ASK.test(last.content) || !draftAlreadyWritten(replies)) return []
  const blob = replies.map((reply) => reply.content).join('\n')
  const facts = campaignFacts(`${blob}\n${lastUserAsk(input.messages ?? [])}`, input.releaseTitle ?? input.studio?.title ?? null)
  const name = facts.name || 'this release'
  const tool = facts.tool || 'campaign approval'
  const bits = [
    facts.name ? `campaign "${facts.name}"` : '',
    facts.id ? `id ${facts.id}` : '',
    facts.when ? `scheduled ${facts.when}` : '',
    facts.slug ? `smartlink slug ${facts.slug}` : '',
    facts.smartlinkId ? `smartlink id ${facts.smartlinkId}` : '',
  ].filter(Boolean)
  const where = bits.length ? ` for ${bits.join(', ')}` : ''
  const items: ReplyFollowUp[] = []
  pushFollowUp(
    items,
    'Build the approval payload from this draft',
    `The ${name} email is already drafted in this chat. Use that subject, preview, body, and links. Generate the ${tool} payload${where}. Do not ask for the copy again.`,
  )
  pushFollowUp(
    items,
    'Tighten the subject, preview, and call to action',
    `Revise the ${name} email already in this chat so the subject, preview text, and call to action are specific${facts.when ? ` to the ${facts.when} send` : ''}. Keep every confirmed link and date, then generate the same ${tool} payload.`,
  )
  pushFollowUp(
    items,
    facts.when ? `Confirm the ${facts.when} send, then build the payload` : 'Confirm the send and link, then build the payload',
    `Before writing the payload, confirm ${facts.name ? `"${facts.name}"` : name} is still a draft${facts.when ? `, the send is ${facts.when}` : ''}, and the pre-save link in this chat resolves. Then build the ${tool} payload from the email already written here.`,
  )
  return items
}

function workflowFollowUps(messages: ComposerGhostMessage[], now: Date, releaseTitle: string | null): ReplyFollowUp[] {
  const replies = conversational(messages)
  if (!replies.length) return []
  const done = doneRecord(replies)
  const steps = workflowSteps(replies.map((reply) => reply.content).join('\n'))
  if (!steps.length) return []
  const open = steps.filter((step) => !isBlockingWait(step) && stepStillOpen(step, done, steps))
  const wait = steps.find((step) => isBlockingWait(step))
  const waitUntil = wait ? scheduledInstant(`${wait.title} ${wait.detail}`) : null
  const waiting = Boolean(waitUntil && waitUntil.getTime() > now.getTime())
  const items: ReplyFollowUp[] = []
  const name = releaseTitle?.trim() || 'this release'
  if (waiting && waitUntil && open[0]) {
    const follow = stepFollowUp(open[0], steps)
    const when = formatDay(waitUntil)
    pushFollowUp(
      items,
      `After ${when}, ${follow.charAt(0).toLowerCase()}${follow.slice(1).replace(/[.]+$/g, '')}`,
      `After DistroKid delivers on ${when}, ${follow.charAt(0).toLowerCase()}${follow.slice(1)}`,
    )
    pushFollowUp(
      items,
      'Prepare the Studio fields while that date is still ahead',
      `While DistroKid delivers, list the Studio fields on ${name} that must be ready so the codes can be written in on ${when} without a second pass.`,
    )
  }
  for (const step of open.slice(waiting ? 1 : 0)) {
    const text = asUserMessage(stepFollowUp(step, steps))
    pushFollowUp(items, text.replace(/[.]+$/g, ''), text)
    if (items.length >= 3) break
  }
  return items
}

function developmentFollowUps(input: ComposerGhostInput, replies: ComposerGhostMessage[]): ReplyFollowUp[] {
  const blob = replies.map((reply) => reply.content).join('\n')
  const lower = blob.toLowerCase()
  const name = releaseName(input)
  const when = dropLabel(replies, input.studio?.releaseDate)
  const items: ReplyFollowUp[] = []
  const ask = lastUserAsk(input.messages ?? [])
  const last = replies[replies.length - 1]?.content ?? ''
  if (RESUPPLY_ASK.test(last) && !draftAlreadyWritten(replies)) {
    pushFollowUp(
      items,
      'Finish the request with the facts already in this chat',
      ask
        ? `Finish this request using only facts and copy already in the thread: ${clip(ask, 220)} Do not ask for material the thread already contains.`
        : 'Continue from the facts already in this chat. Do not ask for material the thread already contains.',
    )
  }
  if (/\bsubject\s*:/.test(lower)) {
    pushFollowUp(
      items,
      'Tighten the subject, preview, and call to action',
      `Revise the email already drafted in this chat so the subject, preview, and call to action are specific to ${name}${when ? ` and the ${when} send` : ''}. Keep the confirmed links and dates.`,
    )
  }
  if (when && /campaign|scheduled/.test(lower)) {
    pushFollowUp(
      items,
      `Confirm the ${when} send before it goes out`,
      `Check that the ${name} campaign is still a draft, the ${when} send is the one we want, and the pre-save link in this chat resolves. Report only what is confirmed.`,
    )
  }
  if (goalWorkSettled(input.messages ?? [])) {
    const upgrade = creativeFollowUp(input, replies)
    if (upgrade) pushFollowUp(items, upgrade.replace(/[.]+$/g, ''), upgrade)
  }
  const upc = upcMismatchFollowUp(blob)
  if (upc) {
    pushFollowUp(items, upc.replace(/[.]+$/g, ''), `Preview the change, then ${upc.charAt(0).toLowerCase()}${upc.slice(1)}`)
  }
  return items
}

/**
 * Recommended next moves for the latest reply.
 * The first one finishes the goal with facts the thread already has.
 * The rest are the useful checks and improvements around that goal.
 */
export function recommendReplyFollowUps(input: ComposerGhostInput): ReplyFollowUp[] {
  const messages = input.messages ?? []
  const replies = conversational(messages)
  if (!replies.length) return []
  const recovered = recoverDraftFollowUps(input, replies)
  if (recovered.length) return recovered

  const items: ReplyFollowUp[] = []
  const held = heldWriteMessage(input.heldWrite)
  if (held) pushFollowUp(items, held.replace(/[.]+$/g, ''), held)
  if (input.focus?.fieldLabel || input.focus?.fieldKey) {
    const focused = focusFieldSuggestion(input.focus)
    pushFollowUp(items, focused.replace(/[.]+$/g, ''), focused)
  }

  const now = clock(input.now)
  if (!items.length) {
    for (const follow of workflowFollowUps(messages, now, input.releaseTitle ?? input.studio?.title ?? null)) {
      pushFollowUp(items, follow.label, follow.message)
    }
  }

  const last = replies[replies.length - 1]!
  const intent = latestProseIntent(last.content)
  const intentIsAction = Boolean(intent && /\b(let me|i'll|i will|navigate|open|go to|draft|approve|update|pull|copy|write)\b/i.test(intent))
  if (intent && intentIsAction && intentStillOpen(intent, doneRecord(replies)) && !RESUPPLY_ASK.test(intent)) {
    const text = asUserMessage(intent)
    pushFollowUp(items, text.replace(/[.]+$/g, ''), text)
  }

  if (!items.length && goalWorkSettled(messages)) {
    const upgrade = creativeFollowUp(input, replies)
    if (upgrade) pushFollowUp(items, upgrade.replace(/[.]+$/g, ''), upgrade)
  }

  if (!items.length) {
    const summary = summarizeReply(last.content, latestOutcome(last))
    if (summary && !RESUPPLY_ASK.test(summary)) {
      const text = asUserMessage(summary)
      pushFollowUp(items, text.replace(/[.]+$/g, ''), text)
    }
  }

  for (const extra of developmentFollowUps(input, replies)) {
    if (items.length >= 4) break
    pushFollowUp(items, extra.label, extra.message)
  }
  return items.slice(0, 4)
}

export function composerGhostSuggestion(input: ComposerGhostInput): string {
  if (input.focus?.fieldLabel || input.focus?.fieldKey) return focusFieldSuggestion(input.focus)
  const held = heldWriteMessage(input.heldWrite)
  if (held) return held
  const messages = input.messages ?? []
  const follow = prioritizedFollowUp(messages, clock(input.now))
  if (follow) return asUserMessage(follow)
  if (goalWorkSettled(messages)) {
    const upgrade = creativeFollowUp(input, messages)
    if (upgrade) return asUserMessage(upgrade)
  }
  const recovered = recoverDraftFollowUps(input, conversational(messages))
  if (recovered[0]) return asUserMessage(recovered[0].label)
  const statusNext = toolStatusFollowUp(messages)
  if (statusNext) return asUserMessage(statusNext)
  const replies = conversational(messages)
  const last = replies[replies.length - 1]
  if (!last) return ''
  const summary = summarizeReply(last.content, latestOutcome(last))
  if (!summary) return ''
  return asUserMessage(summary)
}

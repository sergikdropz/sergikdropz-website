/**
 * A short job list that stays on the thread until the steps are done.
 */

export type ThreadChecklist = {
  id: string
  done: string[]
  next: string[]
}

const DISTROKID_STEPS = [
  'Read the open release',
  'Prefill the DistroKid form',
  'Attach the audio and artwork',
  'Read the album UPC and ISRCs',
  'Leave Continue and Submit for you',
] as const

const RELEASE_COPY_STEPS = [
  'Read the release card',
  'Draft the empty copy fields',
  'Preview the write',
  'Wait for your approval',
  'Confirm the saved fields',
] as const

const START_OVER = /\b(start over|new checklist|forget the (steps|checklist)|drop the checklist)\b/i
const DISTROKID = /\b(distrokid|\/new\/|albumuuid)\b/i
const RELEASE_COPY = /\b(marketing copy|spotify pitch|elevator pitch|press blurb|social caption|release checklist|fill (the |this )?release)\b/i
const CUSTOM_ADVANCE = /^(done|next|continue|proceed)\b/i

export function advanceThreadChecklist(input: {
  previous?: ThreadChecklist | null
  userText: string
  assistantText: string
  releaseOpen: boolean
  toolCalls: Array<{ name: string; payload?: Record<string, unknown> }>
  toolBodies: string[]
}): ThreadChecklist | null | undefined {
  if (START_OVER.test(input.userText)) return null

  const playbook = playbookFor(input.userText)
  let checklist = input.previous ?? undefined
  if (playbook) {
    const keepCurrent =
      checklist != null &&
      checklist.id !== playbook.id &&
      checklist.id !== 'custom' &&
      playbookMatches(checklist.id, input.userText)
    if (!keepCurrent && checklist?.id !== playbook.id) checklist = fresh(playbook.id, playbook.steps)
  }
  if (!checklist) {
    const listed = numberedSteps(input.assistantText)
    if (listed.length < 2) return undefined
    checklist = fresh('custom', listed)
  }

  const evidence = `${input.toolBodies.join('\n')}\n${input.toolCalls
    .map((call) => `${call.name} ${JSON.stringify(call.payload || {})}`)
    .join('\n')}`
  const done = [...checklist.done]
  let next = checklist.next.filter((step) => {
    if (!stepDone(step, input, evidence)) return true
    if (!done.includes(step)) done.push(step)
    return false
  })

  if (checklist.id === 'custom' && CUSTOM_ADVANCE.test(input.userText.trim()) && next.length) {
    const head = next[0]
    if (head && !done.includes(head)) done.push(head)
    next = next.slice(1)
  }

  return {
    id: checklist.id,
    done: done.slice(-8),
    next: next.slice(0, 8),
  }
}

/** Approval happened outside the chat loop. Move the write steps. */
export function noteApprovedWrite(
  checklist: ThreadChecklist | null | undefined,
  input: { verified: boolean | null },
): ThreadChecklist | undefined {
  if (!checklist) return undefined
  const done = [...checklist.done]
  const next = [...checklist.next]
  const complete = (label: string) => {
    const index = next.indexOf(label)
    if (index < 0) return
    next.splice(index, 1)
    if (!done.includes(label)) done.push(label)
  }
  complete('Preview the write')
  complete('Wait for your approval')
  if (input.verified === true) complete('Confirm the saved fields')
  if (input.verified === false && !next.includes('Confirm the saved fields') && !done.includes('Confirm the saved fields')) {
    next.push('Confirm the saved fields')
  }
  return { id: checklist.id, done: done.slice(-8), next: next.slice(0, 8) }
}

export function formatChecklistForPrompt(checklist: ThreadChecklist | null | undefined): string[] {
  if (!checklist || (!checklist.done.length && !checklist.next.length)) return []
  const lines = [`Checklist (${checklist.id}):`]
  if (checklist.done.length) lines.push(`Done: ${checklist.done.join(' · ')}`)
  if (checklist.next[0]) lines.push(`Next: ${checklist.next[0]}`)
  if (checklist.next.length > 1) lines.push(`Remaining: ${checklist.next.slice(1).join(' · ')}`)
  return lines
}

function playbookFor(text: string): { id: string; steps: readonly string[] } | null {
  if (DISTROKID.test(text)) return { id: 'distrokid', steps: DISTROKID_STEPS }
  if (RELEASE_COPY.test(text)) return { id: 'release-copy', steps: RELEASE_COPY_STEPS }
  return null
}

function playbookMatches(id: string, text: string): boolean {
  if (id === 'distrokid') return DISTROKID.test(text)
  if (id === 'release-copy') return RELEASE_COPY.test(text)
  return false
}

function fresh(id: string, steps: readonly string[]): ThreadChecklist {
  return { id, done: [], next: steps.slice(0, 8).map((step) => step.slice(0, 120)) }
}

function numberedSteps(text: string): string[] {
  const steps: string[] = []
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^\d+[.)]\s+(.+)$/)
    const step = match?.[1]?.replace(/\*\*/g, '').trim().slice(0, 120)
    if (!step) continue
    steps.push(step)
    if (steps.length >= 8) break
  }
  return steps
}

function stepDone(
  step: string,
  input: { userText: string; assistantText: string; releaseOpen: boolean },
  evidence: string,
): boolean {
  if (step === 'Read the open release' || step === 'Read the release card') {
    return input.releaseOpen || /query_release_studio_snapshot/.test(evidence)
  }
  if (step === 'Prefill the DistroKid form') return /distrokid_prefill/.test(evidence)
  if (step === 'Attach the audio and artwork') return /distrokid_upload_assets/.test(evidence)
  if (step === 'Read the album UPC and ISRCs') return /distrokidCodes/.test(evidence)
  if (step === 'Leave Continue and Submit for you') {
    return /\b(i submitted|submitted it|i clicked (continue|submit))\b/i.test(input.userText)
  }
  if (step === 'Draft the empty copy fields') {
    return /\b(elevator_pitch|spotify_pitch|press_blurb|social_caption)\b/i.test(input.assistantText)
  }
  if (step === 'Preview the write') return /patch_release_marketing_copy/.test(evidence) && /dryRun|Would update/i.test(evidence)
  if (step === 'Wait for your approval') return /\b(approv(e|ed|al)|save it)\b/i.test(input.userText)
  if (step === 'Confirm the saved fields') return /Re-read (confirmed|mismatch)/i.test(`${input.userText}\n${input.assistantText}`)
  return false
}

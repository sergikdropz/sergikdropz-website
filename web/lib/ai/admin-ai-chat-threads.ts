/** Chat threads live in the Admin AI session store. A thread can be attached to releases. */

export const ADMIN_AI_SESSIONS_KEY = 'admin-ai-chat-sessions-v1'
export const ADMIN_AI_SESSIONS_CHANGED_EVENT = 'admin-ai:sessions-changed'
export const ADMIN_AI_FOCUS_SESSION_EVENT = 'admin-ai:focus-session'

export type StoredChatThread = {
  id: string
  title: string
  updatedAt: number
  attachedReleaseIds: string[]
}

function attachedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 12)
}

export function threadsFromSessionStore(raw: string | null): StoredChatThread[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as { sessions?: unknown }
    if (!Array.isArray(data.sessions)) return []
    return data.sessions.flatMap((row) => {
      if (!row || typeof row !== 'object') return []
      const session = row as { id?: unknown; title?: unknown; updatedAt?: unknown; attachedReleaseIds?: unknown }
      if (typeof session.id !== 'string' || !session.id) return []
      return [
        {
          id: session.id,
          title: typeof session.title === 'string' && session.title.trim() ? session.title : 'Chat',
          updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : 0,
          attachedReleaseIds: attachedIds(session.attachedReleaseIds),
        },
      ]
    })
  } catch {
    return []
  }
}

export function readStoredChatThreads(): StoredChatThread[] {
  if (typeof window === 'undefined') return []
  try {
    return threadsFromSessionStore(window.localStorage.getItem(ADMIN_AI_SESSIONS_KEY))
  } catch {
    return []
  }
}

export function threadsForRelease(releaseId: string): StoredChatThread[] {
  return readStoredChatThreads()
    .filter((thread) => thread.attachedReleaseIds.includes(releaseId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function openAttachedChatThread(sessionId: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ADMIN_AI_FOCUS_SESSION_EVENT, { detail: { sessionId } }))
}

export function notifyChatThreadsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ADMIN_AI_SESSIONS_CHANGED_EVENT))
}

const TOPIC_RULES: Array<[RegExp, string]> = [
  [/\bupc\b/i, 'UPC'],
  [/\bisrc/i, 'ISRC'],
  [/distrokid/i, 'DistroKid'],
  [/soundexchange|\bsx direct\b/i, 'SoundExchange'],
  [/sonic dna/i, 'Sonic DNA'],
  [/\b(pitch|elevator|press blurb|marketing copy)\b/i, 'Copy'],
  [/\bartwork\b/i, 'Artwork'],
  [/\bmetadata\b/i, 'Metadata'],
]

function formatTopics(topics: string[]): string {
  const desks: string[] = topics.filter((topic) => topic === 'DistroKid' || topic === 'SoundExchange')
  const codes: string[] = topics.filter((topic) => topic === 'UPC' || topic === 'ISRC')
  const rest = topics.filter((topic) => !desks.includes(topic) && !codes.includes(topic))
  const parts: string[] = []
  if (desks[0] && codes.length) parts.push(`${desks[0]} ${codes.join(' & ')}`)
  else {
    if (desks[0]) parts.push(desks[0])
    if (codes.length) parts.push(codes.join(' & '))
  }
  if (!parts.length && rest[0]) parts.push(rest[0])
  return parts.join(' · ')
}

function specificGoal(goal: string | null | undefined, releaseTitle: string): string | null {
  if (!goal?.trim()) return null
  const release = releaseTitle.trim()
  const stripped = goal
    .replace(/launch support for/gi, '')
    .replace(release ? new RegExp(release.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : /$^/, '')
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length < 12) return null
  return stripped.length > 48 ? `${stripped.slice(0, 46)}…` : stripped
}

/** Tab name once a thread is attached: release plus what the thread is about. */
export function attachedThreadTitle(input: {
  releaseTitle: string
  goal?: string | null
  texts?: string[]
}): string {
  const release = input.releaseTitle.trim() || 'Release'
  const goal = specificGoal(input.goal, release)
  if (goal) return `${release} · ${goal}`
  const blob = (input.texts ?? []).join('\n')
  const topics: string[] = []
  for (const [pattern, label] of TOPIC_RULES) {
    if (pattern.test(blob) && !topics.includes(label)) topics.push(label)
  }
  const context = formatTopics(topics)
  return context ? `${release} · ${context}` : release
}

export function questionThreadTitle(userLines: string[]): string {
  const first = userLines.map((line) => line.replace(/\s+/g, ' ').trim()).find(Boolean)
  if (!first) return 'New chat'
  return first.length > 40 ? `${first.slice(0, 38)}…` : first
}

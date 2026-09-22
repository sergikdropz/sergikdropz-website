import { parseContributors, type TrackContributor } from '@/lib/studio/track-credits'
import type { RightsPacket, RightsPacketKind } from '@/lib/studio/rights-packets'
import type { RightsTrackLike } from '@/lib/studio/rights-ops'

export type PartyContact = {
  stage: string
  email: string
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

export function isValidPartyEmail(value: string): boolean {
  return EMAIL_RE.test(clean(value))
}

export function parsePartyContacts(raw: unknown): PartyContact[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: PartyContact[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const stage = clean((item as { stage?: unknown; name?: unknown }).stage
      ?? (item as { name?: unknown }).name)
    const email = clean((item as { email?: unknown }).email).toLowerCase()
    if (!stage || !email || !isValidPartyEmail(email)) continue
    const key = stage.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ stage, email })
  }
  return out
}

export function serializePartyContacts(rows: PartyContact[]): PartyContact[] {
  return parsePartyContacts(rows)
}

export function mergePartyContacts(
  current: PartyContact[] | unknown,
  patch: PartyContact[] | unknown,
): PartyContact[] {
  const map = new Map<string, PartyContact>()
  for (const row of parsePartyContacts(current)) {
    map.set(row.stage.toLowerCase(), row)
  }
  for (const row of parsePartyContacts(patch)) {
    map.set(row.stage.toLowerCase(), row)
  }
  return Array.from(map.values())
}

function stageKey(value: string): string {
  return clean(value).toLowerCase()
}

/** Strip display legal suffix: "SERGIK (Jordan Caboga)" → "SERGIK" */
export function stageFromPartyLabel(label: string): string {
  const text = clean(label)
  const match = text.match(/^(.+?)\s*\([^)]+\)\s*$/)
  return clean(match?.[1] || text)
}

function emailFromContributors(tracks: RightsTrackLike[], stage: string): string | null {
  const key = stageKey(stage)
  for (const track of tracks) {
    const rows = parseContributors(track.contributors) as Array<TrackContributor & { email?: string | null }>
    for (const row of rows) {
      if (stageKey(row.name) !== key) continue
      const email = clean(row.email).toLowerCase()
      if (email && isValidPartyEmail(email)) return email
    }
  }
  return null
}

export type ContractSignatory = {
  stage: string
  email: string | null
  skip: boolean
  reason?: string
}

const SELF_STAGES = new Set(['sergik', 'sergik music', 'jordan caboga'])

export function isSelfSignatory(stage: string): boolean {
  return SELF_STAGES.has(stageKey(stage))
}

/** Parties on a packet who may receive a signing email (SERGIK skipped by default). */
export function contractSignatories(
  packet: RightsPacket,
  tracks: RightsTrackLike[],
  partyContacts: PartyContact[] | unknown = [],
): ContractSignatory[] {
  const contacts = parsePartyContacts(partyContacts)
  const contactMap = new Map(contacts.map((row) => [stageKey(row.stage), row.email]))
  const stages = packet.parties.map(stageFromPartyLabel)
  const seen = new Set<string>()
  const out: ContractSignatory[] = []

  for (const stage of stages) {
    const key = stageKey(stage)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (isSelfSignatory(stage)) {
      out.push({
        stage,
        email: contactMap.get(key) || emailFromContributors(tracks, stage),
        skip: true,
        reason: 'SERGIK / self — approve in Studio',
      })
      continue
    }
    const email = contactMap.get(key) || emailFromContributors(tracks, stage) || null
    out.push({
      stage,
      email,
      skip: false,
      reason: email ? undefined : 'Add collaborator email',
    })
  }
  return out
}

export function signatoriesReadyToSend(signatories: ContractSignatory[]): {
  ok: boolean
  recipients: Array<{ stage: string; email: string }>
  missing: string[]
} {
  const recipients: Array<{ stage: string; email: string }> = []
  const missing: string[] = []
  for (const row of signatories) {
    if (row.skip) continue
    if (row.email && isValidPartyEmail(row.email)) {
      recipients.push({ stage: row.stage, email: row.email })
    } else {
      missing.push(row.stage)
    }
  }
  return { ok: missing.length === 0 && recipients.length > 0, recipients, missing }
}

export function contractEmailSubject(
  kind: RightsPacketKind,
  releaseTitle: string,
): string {
  const labels: Record<RightsPacketKind, string> = {
    split_sheet: 'Split sheet',
    producer_agreement: 'Producer agreement',
    collab_agreement: 'Collaboration agreement',
  }
  return `${labels[kind]} for signing — ${releaseTitle || 'SERGIK release'}`
}

export function contractEmailHtml(input: {
  kind: RightsPacketKind
  releaseTitle: string
  albumArtist?: string | null
  partyName: string
  packetText: string
  packetLabel: string
}): string {
  const title = clean(input.releaseTitle) || 'Untitled release'
  const artist = clean(input.albumArtist) || 'SERGIK'
  const party = clean(input.partyName) || 'Collaborator'
  const body = clean(input.packetText)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e4e4e7;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a78bfa;margin:0 0 12px;">SERGIK Studio · Rights</p>
      <h1 style="margin:0 0 8px;font-size:22px;color:#fff;">${input.packetLabel} for signing</h1>
      <p style="margin:0 0 20px;color:#a1a1aa;font-size:14px;line-height:1.5;">
        Hi ${party} — please review the ${input.packetLabel.toLowerCase()} for
        <strong style="color:#fff;">${title}</strong> (${artist}).
        Reply to this email with “I agree” (or sign and return) to confirm.
      </p>
      <pre style="white-space:pre-wrap;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:16px;font-size:12px;line-height:1.55;color:#d4d4d8;overflow:auto;">${body}</pre>
      <p style="margin:20px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
        First-party SERGIK Studio paperwork — not a DistroKid add-on.
        If you were not expecting this, ignore the message.
      </p>
    </div>
  </body>
</html>`
}

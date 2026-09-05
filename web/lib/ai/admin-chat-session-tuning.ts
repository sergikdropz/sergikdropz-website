export type AdminChatHonestyMode = 'strict' | 'relaxed'

export type AdminChatEnergyPreset = 'default' | 'tour_prep' | 'studio_week' | 'launch_day'

export function parseAdminChatHonestyMode(raw: unknown): AdminChatHonestyMode | null {
  if (raw === 'strict' || raw === 'relaxed') return raw
  return null
}

export function parseAdminChatEnergyPreset(raw: unknown): AdminChatEnergyPreset | null {
  if (raw === 'default' || raw === 'tour_prep' || raw === 'studio_week' || raw === 'launch_day') return raw
  return null
}

/** Appended to system prompt when non-empty (session-level UX tuning). */
export function buildSessionTuningPrompt(
  honesty: AdminChatHonestyMode | null,
  energy: AdminChatEnergyPreset | null
): string | null {
  const parts: string[] = []
  if (honesty === 'strict') {
    parts.push(
      'Session honesty: strict — do not present unverified analytics, live counts, or tool/snapshot status as real unless the user ran `/exec` or Plan→Approve in this thread.'
    )
  } else if (honesty === 'relaxed') {
    parts.push(
      'Session honesty: relaxed — when the user explicitly asks for brainstorms, hypotheticals, or "what if", you may outline speculative ideas clearly labeled as hypothetical; never present them as live metrics or executed tools.'
    )
  }
  if (energy === 'tour_prep') {
    parts.push(
      'Session energy: tour prep — prioritize terse logistics checklists (routing, visas, backline, promo windows); minimal prose.'
    )
  } else if (energy === 'studio_week') {
    parts.push(
      'Session energy: studio week — prioritize DAW/session workflow, stems/mix notes, and realistic daily bandwidth; keep answers compact.'
    )
  } else if (energy === 'launch_day') {
    parts.push(
      'Session energy: launch day — prioritize go-live sequencing, comms cadence, and rollback-safe steps; urgent but calm tone.'
    )
  }
  if (!parts.length) return null
  return parts.join(' ')
}

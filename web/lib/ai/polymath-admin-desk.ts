import { getAllSkills } from '@/lib/ai/skills/registry'

/**
 * Sonic DNA polymath specialists. Same desk as copy intelligence:
 * they quote measured facts and the encyclopedia slice.
 */
const POLYMATH_SPECIALISTS: Array<[string, string]> = [
  ['culture', 'Place and era from the encyclopedia slice. Track titles are not places.'],
  ['musicology', 'Form and groove class already on the board.'],
  ['emotion', 'Affect named by the genre profile, not a guessed mood.'],
  ['psychology', 'Listener state only when that layer is already on the board.'],
  ['psychoacoustics', 'Loudness, masking, and pocket from measured facts.'],
  ['genre lock', 'audioPrimary after classify. Folder and playlist names are crates, not genres.'],
  ['intention', 'Weave the peer claims into one listening intention.'],
  ['description', 'Quote the grid. Do not add a BPM, key, or drum family.'],
]

function clip(text: string, max: number): string {
  const value = text.replace(/\s+/g, ' ').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

/** Compact roster: every polymath specialist and every Admin AI skill. */
export function formatPolymathAdminDesk(activeSkillId?: string | null): string {
  const active = (activeSkillId || '').trim()
  const specialists = POLYMATH_SPECIALISTS.map(([name, rule]) => `${name}: ${rule}`).join('\n')
  const desks = getAllSkills().map((skill) => {
    const tools = skill.allowedTools.length ? skill.allowedTools.join(', ') : 'none'
    const mark = skill.id === active ? ' (active)' : ''
    return `- ${skill.name} [${skill.id}]${mark}: ${clip(skill.purpose, 180)} Tools: ${tools}.`
  })
  return [
    'Polymath specialists read measured Sonic DNA and the encyclopedia slice. They do not invent BPM, drums, key, guests, cities, charts, or durations. Skip feel claims when BPM or drum family is missing.',
    specialists,
    'Admin AI desks. Every desk below is in force. Use a desk only when its tool result or live context is in this turn. Do not claim a tool ran if its result is absent.',
    ...desks,
  ].join('\n')
}

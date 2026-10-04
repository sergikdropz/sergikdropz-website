import { skillIdForTool } from '@/lib/ai/skills/tool-skill-map'

export type SkillToolCandidate = {
  id: string
  allowedTools: readonly string[]
  inputSchema?: Record<string, { required?: boolean }> | null
}

/** Prefer the canonical owner when several skills list the same tool. */
export function resolveSkillForTool<T extends SkillToolCandidate>(
  skills: readonly T[],
  tool: string
): T | null {
  const ownerId = skillIdForTool(tool)
  if (ownerId) return skills.find((skill) => skill.id === ownerId) ?? null
  return skills.find((skill) => skill.allowedTools.includes(tool)) ?? null
}

export function missingRequiredSkillFields(
  skill: { inputSchema?: Record<string, { required?: boolean }> | null } | null | undefined,
  payload: Record<string, unknown>
): string[] {
  const schema = skill?.inputSchema
  if (!schema) return []
  return Object.entries(schema)
    .filter(([, config]) => Boolean(config?.required))
    .map(([field]) => field)
    .filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '')
}

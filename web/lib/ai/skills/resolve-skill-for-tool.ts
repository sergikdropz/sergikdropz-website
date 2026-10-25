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

/**
 * These belong to creating a new draft. The Release Studio skill shares one
 * schema across snapshot, copy, rights, and draft tools, so marking them
 * required on the skill blocks an existing-release write such as a UPC sync.
 */
const DRAFT_ONLY_FIELDS = ['title', 'type'] as const

export function schemaFieldRequiredForTool(
  skillId: string | undefined,
  field: string,
  schemaRequired: boolean | undefined,
  tool?: string
): boolean {
  if (skillId === 'studio_release' && (DRAFT_ONLY_FIELDS as readonly string[]).includes(field)) {
    return tool === 'create_distribution_release_draft'
  }
  return Boolean(schemaRequired)
}

export function missingRequiredSkillFields(
  skill: { id?: string; inputSchema?: Record<string, { required?: boolean }> | null } | null | undefined,
  payload: Record<string, unknown>,
  tool?: string
): string[] {
  const schema = skill?.inputSchema
  if (!schema) return []
  return Object.entries(schema)
    .filter(([field, config]) => schemaFieldRequiredForTool(skill?.id, field, config?.required, tool))
    .map(([field]) => field)
    .filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '')
}

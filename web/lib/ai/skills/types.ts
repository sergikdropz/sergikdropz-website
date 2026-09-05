export type SkillRiskTier = 'tier_0_read' | 'tier_1_draft' | 'tier_2_operational'

export type SkillSchemaPrimitive = 'string' | 'number' | 'boolean' | 'object' | 'array'

export type SkillSchemaField = {
  type: SkillSchemaPrimitive
  required?: boolean
  description: string
}

export type SkillSchema = Record<string, SkillSchemaField>

export type AdminSkill = {
  id: string
  name: string
  description: string
  purpose: string
  requiredContext: string[]
  allowedTools: string[]
  outputSchema: SkillSchema
  inputSchema?: SkillSchema
  riskTier: SkillRiskTier
  confidenceRules: string[]
  systemPrompt: string
}

export type SkillValidationResult = {
  valid: boolean
  errors: string[]
}

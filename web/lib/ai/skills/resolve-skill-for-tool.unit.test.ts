import { describe, expect, it } from 'vitest'
import {
  missingRequiredSkillFields,
  resolveSkillForTool,
  type SkillToolCandidate,
} from '@/lib/ai/skills/resolve-skill-for-tool'

const skills: SkillToolCandidate[] = [
  {
    id: 'product_strategy',
    allowedTools: ['draft_product_strategy_pack', 'run_meta_promo_pipeline', 'admin_browser'],
    inputSchema: {
      primaryGoal: { required: true },
      releaseId: { required: false },
      action: { required: false },
    },
  },
  {
    id: 'growth_marketing',
    allowedTools: ['query_platform_growth_snapshot', 'admin_browser', 'generate_campaign_draft'],
    inputSchema: {
      action: { required: false },
      url: { required: false },
    },
  },
  {
    id: 'smartlink_seo',
    allowedTools: ['generate_smartlink_utm_plan'],
    inputSchema: {
      destination: { required: true },
      campaign: { required: true },
    },
  },
]

describe('resolveSkillForTool', () => {
  it('owns admin_browser on growth marketing even when product strategy lists it first', () => {
    const skill = resolveSkillForTool(skills, 'admin_browser')
    expect(skill?.id).toBe('growth_marketing')
    expect(missingRequiredSkillFields(skill, { action: 'probe_fields' })).toEqual([])
  })

  it('still requires primaryGoal on a strategy pack', () => {
    const skill = resolveSkillForTool(skills, 'draft_product_strategy_pack')
    expect(skill?.id).toBe('product_strategy')
    expect(missingRequiredSkillFields(skill, { brandName: 'SERGIK' })).toEqual(['primaryGoal'])
  })

  it('does not treat an empty primaryGoal as present', () => {
    const skill = resolveSkillForTool(skills, 'run_meta_promo_pipeline')
    expect(missingRequiredSkillFields(skill, { primaryGoal: '', action: 'status' }, 'run_meta_promo_pipeline')).toEqual(['primaryGoal'])
  })

  it('does not require a release type when updating an existing release barcode', () => {
    const studio: SkillToolCandidate = {
      id: 'studio_release',
      allowedTools: ['patch_release_marketing_copy', 'create_distribution_release_draft'],
      inputSchema: {
        releaseId: { required: false },
        title: { required: true },
        type: { required: true },
        marketingCopy: { required: false },
      },
    }
    expect(
      missingRequiredSkillFields(
        studio,
        { releaseId: 'release-collection-unreleased-eps-sergik---stayi-mu5pzoor', marketingCopy: { upc: '700563968501' } },
        'patch_release_marketing_copy'
      )
    ).toEqual([])
    expect(missingRequiredSkillFields(studio, { releaseId: 'r1' }, 'create_distribution_release_draft')).toEqual([
      'title',
      'type',
    ])
  })
})

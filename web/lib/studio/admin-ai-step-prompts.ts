import type { WorkflowStepId } from '@/lib/studio/constants'

export type StudioAiStepPrompt = {
  label: string
  message: string
  agentMode?: 'studio_release' | 'growth_marketing' | 'product_strategy'
}

export function getStudioStepAiPrompt(
  step: WorkflowStepId,
  releaseId: string,
  releaseTitle: string
): StudioAiStepPrompt {
  const id = JSON.stringify(releaseId)
  const title = releaseTitle.replace(/"/g, '\\"')

  switch (step) {
    case 'catalog':
      return {
        label: 'Complete catalog with AI',
        agentMode: 'studio_release',
        message: [
          `Help me complete the catalog step for release ${title} (${releaseId}).`,
          `First run: /exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          `Then preview ISRC assignment: /exec assign_isrcs ${JSON.stringify({ releaseId, dryRun: true })}`,
          `If tracks lack ISRCs, propose assign_isrcs (approve to execute).`,
        ].join('\n'),
      }
    case 'metadata':
      return {
        label: 'Complete metadata with AI',
        agentMode: 'studio_release',
        message: [
          `Review metadata gaps for "${title}" (${releaseId}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'List missing artwork, genre, release date, or UPC issues and what to fix in Release Studio.',
        ].join('\n'),
      }
    case 'rights':
      return {
        label: 'Complete rights with AI',
        agentMode: 'studio_release',
        message: [
          `Help complete rights/copyright for "${title}" (${releaseId}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'Suggest update_copyright_checklist fields (preview with dryRun in plan first). Only mark checklist items true when justified by blockers resolved.',
        ].join('\n'),
      }
    case 'copy':
      return {
        label: 'Draft copy with AI',
        agentMode: 'studio_release',
        message: [
          `Draft marketing copy for "${title}" (${releaseId}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          `Then preview: /exec patch_release_marketing_copy ${JSON.stringify({
            releaseId,
            marketingCopy: {
              elevator_pitch: '',
              spotify_pitch: '',
              social_caption: '',
              press_blurb: '',
            },
            merge: true,
            dryRun: true,
          })}`,
          'Fill empty fields only; use genre/title from snapshot. After I approve, execute patch_release_marketing_copy without dryRun.',
        ].join('\n'),
      }
    case 'delivery':
      return {
        label: 'Plan delivery with AI',
        agentMode: 'studio_release',
        message: [
          `Help with DSP delivery for "${title}" (${releaseId}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'Recommend target stores and what store links are still missing.',
        ].join('\n'),
      }
    case 'launch':
      return {
        label: 'Launch + campaign handoff',
        agentMode: 'product_strategy',
        message: [
          `Release "${title}" (${releaseId}) — pre-launch check and go-to-market handoff.`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'If ready, outline go-live blockers. Then `/plan` or `/exec draft_product_strategy_pack` for audit + calendar + conversion scaffold.',
          'Switch agent to **growth_marketing** and plan `generate_campaign_draft` + `generate_smartlink_utm_plan` when you want rows/tasks in admin.',
        ].join('\n'),
      }
    default:
      return {
        label: 'Ask AI',
        message: `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
      }
  }
}

export const COMMAND_CENTER_AI_PROMPT = [
  'Summarize Release Studio priorities for this week.',
  '/exec query_studio_command_center {"dueWithinDays":7}',
  'Return: top 5 daily actions, overdue/at-risk counts, and which releases to open first in Studio.',
].join('\n')

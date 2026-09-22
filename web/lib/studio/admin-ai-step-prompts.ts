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
          'Also check DSP ingest: cover vs original, songwriter legal names, AI declaration, Apple performer+producer, title hygiene (no feat./years/emoji), version/featured radios, and preview-clip start.',
        ].join('\n'),
      }
    case 'metadata':
      return {
        label: 'Complete metadata with AI',
        agentMode: 'studio_release',
        message: [
          `Review metadata gaps for "${title}" (${releaseId}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'List missing DSP genre (map Sonic DNA like Funky House → Dance/House), previously-released flag, artwork ownership, street date, or UPC issues and what to fix in Release Studio.',
        ].join('\n'),
      }
    case 'rights':
      return {
        label: 'Complete rights with AI',
        agentMode: 'studio_release',
        message: [
          `Help complete rights/copyright for "${title}" (${releaseId}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'Suggest update_copyright_checklist fields (preview with dryRun in plan first). Only mark checklist items true when justified by blockers resolved. SERGIK UGC pack is first-party (not DistroKid). Never claim YouTube/TikTok/Meta UGC earnings unless ugc_pack.status is live. DSP attestations (worldwide rights, no other artist names, no fake streams, YouTube Music, artwork owned) live on the release, not the DistroKid form.',
        ].join('\n'),
      }
    case 'copy':
      return {
        label: 'Draft copy with AI',
        agentMode: 'studio_release',
        message: [
          `Draft marketing copy for "${title}" (${releaseId}) from Metadata + Catalog + Sonic DNA.`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          `Then preview: /exec patch_release_marketing_copy ${JSON.stringify({
            releaseId,
            marketingCopy: {
              elevator_pitch: '',
              press_blurb: '',
              spotify_pitch: '',
              social_caption: '',
              store_description: '',
              credits_block: '',
            },
            merge: true,
            dryRun: true,
          })}`,
          'Ground every field in release metadata (description, DSP genres, artwork credits), each track Sonic DNA identity (BPM, key, groove, energy, instruments, intention), press notes, tracklist, and contributor credits. Do not invent guests, cities, or chart facts. After I approve, execute patch_release_marketing_copy without dryRun.',
        ].join('\n'),
      }
    case 'delivery':
      return {
        label: 'Plan delivery with AI',
        agentMode: 'studio_release',
        message: [
          `Help with DSP delivery for "${title}" (${releaseId}).`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'Use Delivery → Connect stores (ISRC / UPC / seed URL). Providers: Spotify/Apple/Deezer/YouTube search, song.link Odesli fan-out, MusicBrainz URL relations, plus DistroKid regional paste targets (iHeart, Qobuz, Anghami, Saavn, Boomplay, Claro, NetEase, Tencent, Joox, Flo). Kuack/Adaptr/MediaNet are DistroKid B2B submitted. Confirm Spotify/Apple/YouTube/Instagram/Facebook artist match cards from artist.json. Bandcamp, Traxsource, and Mixcloud need a pasted artist URL. Do not claim a store is live unless a store link exists.',
        ].join('\n'),
      }
    case 'launch':
      return {
        label: 'Launch + campaign handoff',
        agentMode: 'product_strategy',
        message: [
          `Release "${title}" (${releaseId}) — pre-launch check and go-to-market handoff.`,
          `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
          'If ready, outline go-live blockers including DSP ingest (attestations, AI declaration, previously released, Apple credits). Go-live now also creates campaign + smart link; use Launch step Ensure handoff if already live.',
          'Then `/plan` or `/exec draft_product_strategy_pack` for audit + calendar + conversion scaffold.',
          'Switch agent to **growth_marketing** and plan `generate_campaign_draft` + `generate_smartlink_utm_plan` when you want deeper rows/tasks in admin.',
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

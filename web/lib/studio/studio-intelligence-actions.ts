import { copyFieldContextLine } from '@/lib/studio/copy-intelligence'

export type StudioIntelligenceSurface =
  | 'metadata_listening_journey'
  | 'catalog_press_notes_all'
  | 'catalog_press_note_track'
  | 'rights_packet_audit'
  | 'dsp_connect_stores'
  | 'dsp_fill_missing'
  | 'dsp_check_delivery'

const SURFACE_CONTEXT: Record<StudioIntelligenceSurface, string> = {
  metadata_listening_journey: `SergikAI + polymath: description · culture · musicology · Admin AI: strategy · smartlink`,
  catalog_press_notes_all: `SergikAI listen desk + polymath: description · culture · musicology · Admin AI: studio · strategy`,
  catalog_press_note_track: `SergikAI listen desk + polymath: description · intention · genre lock · Admin AI: studio`,
  rights_packet_audit: `SergikAI polymath: music business counsel — audit masters, compositions, splits, and packet faults`,
  dsp_connect_stores: `Admin AI: studio · ops intel — ISRC/UPC/seed URL store discovery (never claim live without links)`,
  dsp_fill_missing: `Admin AI: studio · ops intel — fill gaps from SERGIK catalog + artist match cards`,
  dsp_check_delivery: `Admin AI: studio · ops intel — Revelator/aggregator status honesty (no invented delivery)`,
}

export function studioIntelligenceContextLine(surface: StudioIntelligenceSurface): string {
  return SURFACE_CONTEXT[surface]
}

export function studioIntelligenceHarnessQuery(surface: StudioIntelligenceSurface): string {
  switch (surface) {
    case 'metadata_listening_journey':
      return 'Sonic DNA unified intelligence Release Studio metadata listening journey polymath'
    case 'catalog_press_notes_all':
    case 'catalog_press_note_track':
      return 'Sonic DNA unified intelligence Release Studio catalog press notes AI listen polymath'
    case 'rights_packet_audit':
      return 'Music Business Counsel global music law split sheet producer collab SERGIK audit'
    case 'dsp_connect_stores':
    case 'dsp_fill_missing':
    case 'dsp_check_delivery':
      return 'Release Studio DSP delivery connect stores aggregator Revelator ops intel'
    default:
      return 'Sonic DNA unified intelligence Release Studio polymath'
  }
}

export function buildListeningJourneyAdminAiPrompt(input: {
  releaseId: string
  releaseTitle: string
  currentDraft?: string
}) {
  const title = input.releaseTitle.replace(/"/g, '\\"')
  return {
    agentMode: 'studio_release' as const,
    message: [
      `Expand or refine the Metadata **listening journey / DSP description** for "${title}" (${input.releaseId}).`,
      studioIntelligenceContextLine('metadata_listening_journey'),
      `Field desk (same stack as store copy): ${copyFieldContextLine('store_description')}.`,
      `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: input.releaseId })}`,
      `/exec query_intelligence_harness ${JSON.stringify({
        mode: 'stack',
        releaseId: input.releaseId,
        query: studioIntelligenceHarnessQuery('metadata_listening_journey'),
      })}`,
      'Write start-to-finish listen copy, ordered tracklist, contributor credits, and artwork credits. Ground in catalog press notes + unified Sonic DNA — never invent guests, cities, charts, or durations.',
      input.currentDraft?.trim()
        ? `Current draft:\n\`\`\`\n${input.currentDraft.trim()}\n\`\`\``
        : 'Current draft is empty — draft fresh from snapshot.',
      'When ready, end with ```ai-apply {"fieldId":"description","value":"..."}``` for the Metadata description field.',
    ].join('\n'),
  }
}

export function buildPressNotesAdminAiPrompt(input: {
  releaseId: string
  releaseTitle: string
  trackId?: string
  trackTitle?: string
}) {
  const title = input.releaseTitle.replace(/"/g, '\\"')
  const trackBit = input.trackTitle
    ? `track "${input.trackTitle.replace(/"/g, '\\"')}" (${input.trackId})`
    : 'all catalog tracks'
  return {
    agentMode: 'studio_release' as const,
    message: [
      `Plan AI listen + journalist press notes for ${trackBit} on "${title}" (${input.releaseId}).`,
      studioIntelligenceContextLine(
        input.trackId ? 'catalog_press_note_track' : 'catalog_press_notes_all',
      ),
      `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: input.releaseId })}`,
      `/exec query_intelligence_harness ${JSON.stringify({
        mode: 'stack',
        releaseId: input.releaseId,
        query: studioIntelligenceHarnessQuery('catalog_press_notes_all'),
      })}`,
      'Use Catalog press note fields + Sonic DNA unified cards. Distinct note per track — no repeating sibling copy. No lab voice or invented lyrics.',
      input.trackId
        ? 'After listen, paste-ready JSON per track: {"description":"...","intention":"..."}.'
        : 'Batch: one unique press note per catalog row.',
    ].join('\n'),
  }
}

export function buildRightsPacketAuditAdminAiPrompt(input: {
  releaseId: string
  releaseTitle: string
  packetLabel: string
  packetKind: string
  packetText: string
}) {
  const title = input.releaseTitle.replace(/"/g, '\\"')
  const dealKind =
    input.packetKind === 'producer_agreement'
      ? 'producer'
      : input.packetKind === 'collab_agreement'
        ? 'collab'
        : 'split_sheet'
  return {
    agentMode: 'music_business_counsel' as const,
    message: [
      `Audit and enhance the ${input.packetLabel} for "${title}" (${input.releaseId}).`,
      studioIntelligenceContextLine('rights_packet_audit'),
      `/exec audit_music_contract ${JSON.stringify({ releaseId: input.releaseId, dealKind })}`,
      'This is first-party SERGIK Release Studio paperwork — not DistroKid.',
      'Counsel is issue-spotting, not a lawyer. Do not invent parties, percentages, licenses, or registration numbers.',
      '1) Start from the audit memo: blockers, then material issues, with the topic id for each.',
      '2) Produce a tightened full packet that addresses those faults (term, territory, governing law, master vs composition, credits).',
      'Keep the same parties and ownership numbers unless Catalog data clearly contradicts them.',
      'Do not mark copyright checklist items true. That write stays on Release Studio.',
      `Focus the Rights packet field \`rights-packet-${input.packetKind}\` and when the enhanced text is ready, end with an \`\`\`ai-apply {"value":"...full revised packet..."}\`\`\` block.`,
      '',
      'Current packet:',
      '```',
      input.packetText,
      '```',
    ].join('\n'),
  }
}

export function buildDspDeliveryAdminAiPrompt(input: {
  releaseId: string
  releaseTitle: string
  surface: 'dsp_connect_stores' | 'dsp_fill_missing' | 'dsp_check_delivery'
  hint?: string
}) {
  const title = input.releaseTitle.replace(/"/g, '\\"')
  const action =
    input.surface === 'dsp_connect_stores'
      ? 'Connect streaming stores (ISRC / UPC / optional seed URL).'
      : input.surface === 'dsp_fill_missing'
        ? 'Add missing store links from the SERGIK catalog matrix.'
        : 'Check aggregator delivery status and interpret store rows honestly.'
  return {
    agentMode: 'studio_release' as const,
    message: [
      `${action} Release: "${title}" (${input.releaseId}).`,
      studioIntelligenceContextLine(input.surface),
      `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId: input.releaseId })}`,
      `/exec query_intelligence_harness ${JSON.stringify({
        mode: 'stack',
        releaseId: input.releaseId,
        query: studioIntelligenceHarnessQuery(input.surface),
      })}`,
      'Never mark a store live unless a store link exists on the snapshot. Confirm Spotify/Apple/YouTube artist match cards when relevant.',
      input.hint?.trim() ? `UI hint: ${input.hint.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

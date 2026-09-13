import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { createSupabaseServerClient } from '@/lib/supabase'
import { findAudioFile } from '@/lib/findAudioFile'
import { generateChatReply } from '@/lib/admin-ai'
import { resolveDefaultAdminChatProvider } from '@/lib/ai/admin-chat-providers'
import { getEnvModelIdsResolvedForChat } from '@/lib/ai/admin-chat-env-models'
import {
  loadAdminAiChatPreferences,
  mergeResolvedModels,
  resolveSonicDnaChatProvider,
} from '@/lib/ai/admin-ai-chat-preferences'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import {
  compactSonicDnaForReview,
  localSonicDnaAccuracyWarnings,
  type SonicDnaReportSectionId,
  SONIC_DNA_REPORT_SECTION_IDS,
} from '@/lib/audio/sonic-dna-report-sections'
import {
  assessSonicDnaPipeline,
  buildAwaitAudioChallengeAnswer,
} from '@/lib/audio/sonic-dna-pipeline'
import { ensureMeasuredOnDna } from '@/lib/audio/normalize-agent-to-measured'
import { unwrapSonicDnaReviewReply } from '@/lib/audio/sonic-dna-review-format'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type ReviewMode = 'question' | 'challenge' | 'regenerate'

function isSectionId(value: unknown): value is SonicDnaReportSectionId {
  return typeof value === 'string' && (SONIC_DNA_REPORT_SECTION_IDS as readonly string[]).includes(value)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const rl = await checkRateLimitAsync(`sonic-dna-review:${auth.session.user.id}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Review rate limit exceeded. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const body = await request.json().catch(() => ({}))
    const trackId = typeof body.trackId === 'string' ? body.trackId.trim() : ''
    const libraryTrackId =
      typeof body.libraryTrackId === 'string' ? body.libraryTrackId.trim() : ''
    const mode = (body.mode === 'challenge' || body.mode === 'regenerate' ? body.mode : 'question') as ReviewMode
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const sectionId = isSectionId(body.sectionId) ? body.sectionId : null
    const lockMeasured = body.lockMeasured !== false
    const allowMeasurementFix = body.allowMeasurementFix === true
    const clientDna = body.sonicDna && typeof body.sonicDna === 'object' ? body.sonicDna : null

    if (!trackId && !libraryTrackId) {
      return NextResponse.json({ error: 'trackId is required' }, { status: 400 })
    }
    if (mode === 'question' && !message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }
    // regenerate with no sectionId + no notes = whole-report rewrite (all sections)

    const supabase = createSupabaseServerClient()
    const audio = await findAudioFile(supabase, {
      trackId: trackId || libraryTrackId,
      select: 'id, title, artist, sonic_dna, sonic_dna_status, bpm, key_signature',
    })
    const sonicDnaRaw = clientDna || audio?.sonic_dna || null
    if (!sonicDnaRaw) {
      return NextResponse.json({ error: 'No Sonic DNA found for this track' }, { status: 404 })
    }
    // Persist-friendly measured from agent fields so regenerate isn't gated forever.
    const sonicDna = ensureMeasuredOnDna(sonicDnaRaw)

    const localWarnings = localSonicDnaAccuracyWarnings(sonicDna)
    const pipeline = assessSonicDnaPipeline(sonicDna)
    const snapshot = compactSonicDnaForReview(sonicDna)
    const title = audio?.title || 'Untitled'
    const artist = audio?.artist || 'Unknown'

    // Stage gate: Accuracy Challenge without DSP burns tokens and invents false confidence.
    if (mode === 'challenge' && !pipeline.canRunAccuracyChallenge) {
      const gated = buildAwaitAudioChallengeAnswer(pipeline)
      return NextResponse.json({
        answer: gated.answer,
        warnings: [...gated.warnings, ...localWarnings].filter(
          (item, index, all) => all.indexOf(item) === index,
        ),
        patches: [],
        nextAction: gated.nextAction,
        pipeline: {
          stage: pipeline.stage,
          nextAction: pipeline.nextAction,
          instruction: pipeline.instruction,
          blockers: pipeline.blockers,
          hasGrooveCore: pipeline.hasGrooveCore,
          canRunAccuracyChallenge: pipeline.canRunAccuracyChallenge,
        },
        provider: 'pipeline-gate',
        model: 'sequential-dsp-first',
      })
    }

    if (mode === 'regenerate' && !pipeline.hasGrooveCore) {
      const gated = buildAwaitAudioChallengeAnswer(pipeline)
      return NextResponse.json({
        answer: [
          '## Regenerate blocked — pipeline gate',
          '',
          'Encyclopedia regenerate requires a measured BPM + drum grid first.',
          '',
          gated.answer,
        ].join('\n'),
        warnings: [...gated.warnings, ...localWarnings].filter(
          (item, index, all) => all.indexOf(item) === index,
        ),
        patches: [],
        nextAction: 'run_audio',
        pipeline: {
          stage: pipeline.stage,
          nextAction: pipeline.nextAction,
          instruction: pipeline.instruction,
          blockers: pipeline.blockers,
          hasGrooveCore: pipeline.hasGrooveCore,
          canRunAccuracyChallenge: false,
        },
        provider: 'pipeline-gate',
        model: 'sequential-dsp-first',
      })
    }

    const task =
      mode === 'question'
        ? `Answer the admin's question about this Sonic DNA report. Do not invent BPM, drums, key, or genre that contradict the measured groove.`
        : mode === 'challenge'
          ? `Accuracy challenge: find claims that are not supported by the measured groove (drum grid, tempo/feel, bass lock, percussion). Flag folder/title/playlist leakage. Prefer "unknown" over a crate-derived genre. When a rewrite is justified, return patches for every affected section (not just one sentence). Follow the sequential pipeline: claims must cite measured BPM/drums/bass — never catalog preference alone.`
          : sectionId
            ? `Rewrite section "${sectionId}" using the admin's notes. Return a full replacement text for that section (and closely related sections only if needed). ${
                allowMeasurementFix
                  ? 'The admin unlocked measured BPM/drums/key — if correcting groove, patch sectionId "groove" with Measured-groove lines (BPM:, Drums:, Key:, Groove class:).'
                  : 'Keep measured BPM/drums/key/groove class. Do not patch sectionId groove.'
              }`
            : `Rewrite the WHOLE report and ALL encyclopedia sections from the fresh measured groove. Return patches for every sectionId except groove (unless measurement fix is unlocked): usage, description, benefits, intention, dsp, related, history, culture, psychology, psychoacoustics, musicology. Each patch text must be a complete replacement grounded in measured BPM, drums, bass lock, and groove class — never playlist/folder/title keywords alone. When Admin input includes ADMIN ACCURACY GUIDANCE or challenge overrides (genre/feel corrections), treat those as highest-priority labeling constraints for description/culture/history/related while remaining consistent with measured BPM/drums/key. ${
                allowMeasurementFix
                  ? 'Measurement fix unlocked: you may also patch sectionId "groove" if BPM/drums/key need correction.'
                  : 'Do not patch sectionId groove — measured facts stay locked.'
              }`

    const userPrompt = [
      `Track: ${artist} — ${title}`,
      `Mode: ${mode}`,
      `Pipeline stage: ${pipeline.stage} (${pipeline.nextAction})`,
      sectionId ? `Section: ${sectionId}` : 'Section: whole report (rewrite every section)',
      `Admin input: ${
        message ||
        (mode === 'challenge'
          ? '(run accuracy challenge)'
          : sectionId
            ? `(rewrite section ${sectionId} for accuracy against the measured groove)`
            : '(rewrite whole report and all sections from measured groove)')
      }`,
      `Local warnings: ${localWarnings.length ? localWarnings.join(' | ') : 'none'}`,
      `Report snapshot JSON: ${JSON.stringify(snapshot)}`,
      task,
      'Reply with JSON only: {"answer":"markdown","warnings":["..."],"patches":[{"sectionId":"culture","text":"..."}]}',
      'The answer field must be readable markdown for a narrow chat column: headings, short paragraphs, and bullet lists. Do not use markdown tables. Do not wrap the JSON in extra commentary.',
      'sectionId must be one of groove, usage, description, benefits, intention, dsp, related, history, culture, psychology, psychoacoustics, musicology.',
      'Description must be a detailed unified knowledge report of all Sonic DNA data for this track. Benefits must explain listening/DJ value from the analysis. Fill every section systematically; do not skip sections.',
      'For question mode, patches may be empty. For regenerate, include the rewritten section text. For challenge, include patches for every section that needs a rewrite.',
      'HARD RULE: Description and groove sections MUST embed at least one literal measured line such as "BPM: …", "Drums: …", or "Groove class: …". Claims without measured evidence are invalid.',
      sectionId
        ? `Prefer patching sectionId "${sectionId}" first; you may also patch closely related sections if needed.`
        : 'WHOLE REPORT: include a patch for every encyclopedia section listed above. Missing sections are a failure — do not return only one or two patches.',
    ].join('\n')

    const [prefs, envResolved] = await Promise.all([
      loadAdminAiChatPreferences(supabase),
      getEnvModelIdsResolvedForChat(),
    ])
    const resolvedModelIds = mergeResolvedModels(envResolved, prefs.modelOverrides)
    const reviewProvider = resolveSonicDnaChatProvider(prefs, resolveDefaultAdminChatProvider())

    const chat = await generateChatReply(userPrompt, {
      provider: reviewProvider,
      modelOverrides: prefs.modelOverrides,
      resolvedModelIds,
      strictProvider: Boolean(reviewProvider),
      honestyMode: 'strict',
      pageContextPrompt:
        'You are reviewing SERGIK Sonic DNA. Genre comes from audio (drums, tempo, bass, percussion), never playlist/folder/title keywords. Chat-only: do not claim tools ran.',
    })

    if (!chat.provider) {
      return NextResponse.json(
        {
          error: 'LLM provider unavailable',
          details: chat.reply,
        },
        { status: 503 },
      )
    }

    const unwrapped = unwrapSonicDnaReviewReply(chat.reply)
    const answer = unwrapped.answer || chat.reply
    const modelWarnings = unwrapped.warnings
    let patches = unwrapped.patches

    // Prefer the focused section; keep related patches when regenerating whole report.
    if (sectionId && mode === 'regenerate') {
      const focused = patches.filter((patch) => patch.sectionId === sectionId)
      if (focused.length) patches = focused
    }

    const safePatches =
      lockMeasured && !allowMeasurementFix ? patches.filter((patch) => patch.sectionId !== 'groove') : patches

    return NextResponse.json({
      success: true,
      mode,
      answer,
      warnings: [...localWarnings, ...modelWarnings],
      patches: safePatches,
      provider: chat.provider || null,
      sectionId,
    })
  } catch (error: any) {
    console.error('[sonic-dna-review]', error)
    return NextResponse.json({ error: error.message || 'Review failed' }, { status: 500 })
  }
}

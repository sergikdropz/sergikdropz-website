import { createHash } from 'crypto'
import type { AdminAiDigestSnapshot } from '@/lib/ai/digest'
import { formatAdminAiDigestMessage, postAdminAiDigestWebhook } from '@/lib/ai/digest-notify'
import { createSupabaseServerClient } from '@/lib/supabase'

export type DigestSendTrigger = 'cron' | 'manual_test'

export type AdminAiDigestSendRow = {
  id: string
  created_at: string
  trigger_source: DigestSendTrigger
  delivered: boolean
  delivery_reason: string | null
  error_message: string | null
  digest_generated_at: string
  summary: Record<string, unknown>
  created_by: string | null
}

function digestSummary(digest: AdminAiDigestSnapshot) {
  return {
    pendingApprovals: digest.pendingApprovals,
    failedRuns7d: digest.failedRuns7d,
    completedRuns24h: digest.completedRuns24h,
    openAiTasks: digest.openAiTasks,
  }
}

type DigestRecordedSummary = ReturnType<typeof digestSummary> & { digestFingerprint: string }

export function computeAdminAiDigestFingerprint(digest: AdminAiDigestSnapshot): string {
  const payload = {
    pendingApprovals: digest.pendingApprovals,
    failedRuns7d: digest.failedRuns7d,
    completedRuns24h: digest.completedRuns24h,
    openAiTasks: digest.openAiTasks,
    alerts: digest.alerts,
    oldestApprovalId: digest.oldestApprovalWaiting?.id ?? null,
    recentFailureIds: digest.recentFailures.map((r) => r.id).join(','),
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)
}

function digestDedupWindowMs(): number {
  const minutes = parseInt(process.env.ADMIN_AI_DIGEST_DEDUP_MINUTES || '45', 10)
  if (Number.isNaN(minutes) || minutes < 1) return 45 * 60 * 1000
  return Math.min(24 * 60, minutes) * 60 * 1000
}

async function wasDigestFingerprintDeliveredRecently(fingerprint: string): Promise<boolean> {
  const supabase = createSupabaseServerClient()
  const since = new Date(Date.now() - digestDedupWindowMs()).toISOString()
  const { data, error } = await supabase
    .from('admin_ai_digest_sends')
    .select('summary')
    .eq('delivered', true)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40)

  if (error || !data?.length) return false

  for (const row of data) {
    const summary = row.summary as Record<string, unknown> | null
    if (summary && typeof summary.digestFingerprint === 'string' && summary.digestFingerprint === fingerprint) {
      return true
    }
  }
  return false
}

export async function recordAdminAiDigestSend(params: {
  trigger: DigestSendTrigger
  delivered: boolean
  deliveryReason?: string | null
  errorMessage?: string | null
  digestGeneratedAt: string
  summary: DigestRecordedSummary
  createdBy?: string | null
}) {
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('admin_ai_digest_sends').insert({
      trigger_source: params.trigger,
      delivered: params.delivered,
      delivery_reason: params.deliveryReason ?? null,
      error_message: params.errorMessage ?? null,
      digest_generated_at: params.digestGeneratedAt,
      summary: params.summary,
      created_by: params.createdBy ?? null,
    })
    if (error) {
      console.error('[admin_ai_digest_sends] insert failed:', error.message)
    }
  } catch (e) {
    console.error('[admin_ai_digest_sends]', e)
  }
}

/**
 * Posts digest to webhook (if configured), appends an audit row when the table exists.
 * Cron: skips webhook when an identical fingerprint was delivered within the dedup window.
 * Rethrows webhook/network errors after logging a failed row.
 */
export async function deliverAdminAiDigestAndLog(params: {
  trigger: DigestSendTrigger
  digest: AdminAiDigestSnapshot
  createdBy?: string | null
}) {
  const fingerprint = computeAdminAiDigestFingerprint(params.digest)
  const summary: DigestRecordedSummary = { ...digestSummary(params.digest), digestFingerprint: fingerprint }
  const message = formatAdminAiDigestMessage(params.digest)

  if (params.trigger === 'cron') {
    const duplicate = await wasDigestFingerprintDeliveredRecently(fingerprint)
    if (duplicate) {
      await recordAdminAiDigestSend({
        trigger: params.trigger,
        delivered: false,
        deliveryReason: 'deduped_identical_snapshot',
        digestGeneratedAt: params.digest.generatedAt,
        summary,
        createdBy: params.createdBy,
      })
      return {
        delivered: false,
        deliveryReason: 'deduped_identical_snapshot' as const,
      }
    }
  }

  try {
    const delivery = await postAdminAiDigestWebhook(message)
    await recordAdminAiDigestSend({
      trigger: params.trigger,
      delivered: delivery.delivered,
      deliveryReason: delivery.delivered ? null : delivery.reason,
      digestGeneratedAt: params.digest.generatedAt,
      summary,
      createdBy: params.createdBy,
    })
    return {
      delivered: delivery.delivered,
      deliveryReason: delivery.delivered ? undefined : delivery.reason,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Webhook delivery failed'
    await recordAdminAiDigestSend({
      trigger: params.trigger,
      delivered: false,
      errorMessage: msg,
      digestGeneratedAt: params.digest.generatedAt,
      summary,
      createdBy: params.createdBy,
    })
    throw error
  }
}

export async function listRecentAdminAiDigestSends(limit = 20): Promise<AdminAiDigestSendRow[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('admin_ai_digest_sends')
    .select(
      'id, created_at, trigger_source, delivered, delivery_reason, error_message, digest_generated_at, summary, created_by'
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[admin_ai_digest_sends] list failed:', error.message)
    return []
  }

  return (data ?? []) as AdminAiDigestSendRow[]
}

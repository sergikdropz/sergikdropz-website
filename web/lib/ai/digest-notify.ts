import type { AdminAiDigestSnapshot } from '@/lib/ai/digest'

export function formatAdminAiDigestMessage(digest: AdminAiDigestSnapshot) {
  const lines: string[] = []
  lines.push(`Admin AI digest (${digest.generatedAt})`)
  lines.push(
    `Approvals: ${digest.pendingApprovals ?? 'n/a'} | Failed 7d: ${digest.failedRuns7d ?? 'n/a'} | Completed 24h: ${digest.completedRuns24h ?? 'n/a'} | Open AI tasks: ${digest.openAiTasks ?? 'n/a'}`
  )
  lines.push(`Alerts: ${digest.alerts.join(' | ')}`)

  if (digest.oldestApprovalWaiting) {
    lines.push(
      `Oldest approval: ${digest.oldestApprovalWaiting.id} (${digest.oldestApprovalWaiting.created_at}) - ${digest.oldestApprovalWaiting.prompt_snippet}`
    )
  }

  if (digest.recentFailures.length > 0) {
    const compactFailures = digest.recentFailures
      .slice(0, 3)
      .map((f) => `${f.request_type ?? 'unknown'}:${f.id}:${(f.error_message ?? 'failed').slice(0, 80)}`)
      .join(' | ')
    lines.push(`Recent failures: ${compactFailures}`)
  }

  return lines.join('\n')
}

export async function postAdminAiDigestWebhook(message: string) {
  const webhookUrl = process.env.ADMIN_AI_DIGEST_WEBHOOK_URL
  if (!webhookUrl) {
    return { delivered: false, reason: 'ADMIN_AI_DIGEST_WEBHOOK_URL not configured' as const }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message,
      content: message,
      username: 'Admin AI Digest',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Webhook delivery failed (${response.status}): ${body.slice(0, 200)}`)
  }

  return { delivered: true as const }
}

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'
import { sendDepartmentEmail } from '../email/send-department'
import { createSupabaseServerClient } from '../supabase'
import {
  dueOwnerReleaseReminders,
  ownerReminderHtml,
  type OwnerReleaseReminder,
} from './owner-release-reminders'


const TABLE = 'owner_email_reminders'

type SentLog = Record<string, { sentAt: string; messageId: string | null }>

export type OwnerReminderDelivery = {
  id: string
  status: 'dry_run' | 'already_sent' | 'sent' | 'failed'
  messageId?: string
  error?: string
}

function statePath(): string {
  return process.env.OWNER_REMINDER_STATE_PATH?.trim() || path.join(process.cwd(), '.dev', 'owner-release-reminders.json')
}

async function readSentLog(): Promise<SentLog> {
  try {
    const raw = await readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as { sent?: SentLog }
    return parsed.sent && typeof parsed.sent === 'object' ? parsed.sent : {}
  } catch {
    return {}
  }
}

async function writeSentLog(sent: SentLog): Promise<void> {
  const file = statePath()
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify({ sent }, null, 2))
  await rename(tmp, file)
}

async function supabaseSent(id: string): Promise<boolean | null> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from(TABLE).select('status').eq('id', id).maybeSingle()
    if (error) return null
    return data?.status === 'sent'
  } catch {
    return null
  }
}

async function recordSupabase(reminder: OwnerReleaseReminder, messageId: string | null, errorMessage: string | null) {
  try {
    const supabase = createSupabaseServerClient()
    await supabase.from(TABLE).upsert(
      {
        id: reminder.id,
        subject: reminder.subject,
        to_email: reminder.to,
        status: errorMessage ? 'failed' : 'sent',
        message_id: messageId,
        error_message: errorMessage,
        sent_at: errorMessage ? null : new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
  } catch {
    // Local state file still prevents a second send from this machine.
  }
}

async function alreadySent(id: string): Promise<boolean> {
  const local = await readSentLog()
  if (local[id]) return true
  return (await supabaseSent(id)) === true
}

export async function deliverDueOwnerReleaseReminders(now = new Date()): Promise<OwnerReminderDelivery[]> {
  const due = dueOwnerReleaseReminders(now)
  const dryRun = process.env.OWNER_REMINDER_DRY_RUN === '1'
  const results: OwnerReminderDelivery[] = []

  for (const reminder of due) {
    if (dryRun) {
      results.push({ id: reminder.id, status: 'dry_run' })
      continue
    }
    if (await alreadySent(reminder.id)) {
      results.push({ id: reminder.id, status: 'already_sent' })
      continue
    }

    try {
      const sent = await sendDepartmentEmail({
        department: 'studio',
        to: reminder.to,
        subject: reminder.subject,
        html: ownerReminderHtml(reminder),
        tags: [{ name: 'reminder_id', value: reminder.id }],
      })
      const messageId = sent.messageId ?? null
      const log = await readSentLog()
      log[reminder.id] = { sentAt: new Date().toISOString(), messageId }
      await writeSentLog(log)
      await recordSupabase(reminder, messageId, null)
      results.push({ id: reminder.id, status: 'sent', ...(messageId ? { messageId } : {}) })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Send failed'
      await recordSupabase(reminder, null, message)
      results.push({ id: reminder.id, status: 'failed', error: message })
    }
  }

  return results
}

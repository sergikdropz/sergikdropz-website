/** Personal release reminders for the label owner. Phoenix time, year-round UTC−7. */

export const OWNER_REMINDER_TIME_ZONE = 'America/Phoenix'
export const OWNER_REMINDER_SEND_HOUR = 9
export const OWNER_REMINDER_EMAIL = 'sergikdrops@gmail.com'

const STAYING_A_VIBE_ALBUM_URL =
  'https://distrokid.com/dashboard/album/?albumuuid=D908E9D1-1514-4C04-988C051A39FFAE34'

export type OwnerReleaseReminder = {
  id: string
  /** First Phoenix calendar day the note may go out (YYYY-MM-DD). */
  sendOn: string
  /** Last Phoenix calendar day a missed send is still worth delivering. */
  lastDay: string
  to: string
  subject: string
  paragraphs: string[]
}

export const STAYING_A_VIBE_REMINDERS: OwnerReleaseReminder[] = [
  {
    id: 'staying-a-vibe-prelaunch-2026-10-07',
    sendOn: '2026-10-07',
    lastDay: '2026-10-07',
    to: OWNER_REMINDER_EMAIL,
    subject: 'Tomorrow is release day — Staying A Vibe drops Oct 8',
    paragraphs: [
      'Heads up — "Staying A Vibe" releases tomorrow, October 8, 2026.',
      'DistroKid has the album on deck. UPC 700563968501 is confirmed.',
      'After it goes live, open the DistroKid album page, copy the ISRC from each track, and paste the five codes into Admin AI with the phrase "pull the DistroKid ISRCs".',
      'Tracks: Pre Party, Tequila Power, Hydrate, Mind n Body, Last Night.',
      `Album page: ${STAYING_A_VIBE_ALBUM_URL}`,
    ],
  },
  {
    id: 'staying-a-vibe-isrc-pull-2026-10-08',
    sendOn: '2026-10-08',
    lastDay: '2026-10-09',
    to: OWNER_REMINDER_EMAIL,
    subject: 'Staying A Vibe is live — pull the DistroKid ISRCs now',
    paragraphs: [
      'Release day — "Staying A Vibe" (UPC 700563968501) should now be in stores.',
      'Open the DistroKid album page, copy the ISRC on each track, and paste all five codes into Admin AI with the phrase "pull the DistroKid ISRCs". Those codes get written into Release Studio and queued to SoundExchange Direct.',
      'Tracks: Pre Party, Tequila Power, Hydrate, Mind n Body, Last Night.',
      `Album page: ${STAYING_A_VIBE_ALBUM_URL}`,
    ],
  },
]

export type PhoenixClock = { date: string; hour: number }

export function phoenixClock(now: Date): PhoenixClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OWNER_REMINDER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const hour = Number(read('hour'))
  return {
    date: `${read('year')}-${read('month')}-${read('day')}`,
    hour: hour === 24 ? 0 : hour,
  }
}

export function isOwnerReminderDue(
  reminder: OwnerReleaseReminder,
  now: Date,
  sendHour = OWNER_REMINDER_SEND_HOUR,
): boolean {
  const clock = phoenixClock(now)
  if (clock.date < reminder.sendOn || clock.date > reminder.lastDay) return false
  if (clock.date === reminder.sendOn && clock.hour < sendHour) return false
  return true
}

export function dueOwnerReleaseReminders(
  now = new Date(),
  reminders: OwnerReleaseReminder[] = STAYING_A_VIBE_REMINDERS,
): OwnerReleaseReminder[] {
  return reminders.filter((reminder) => isOwnerReminderDue(reminder, now))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function linkify(escaped: string): string {
  return escaped.replace(
    /https:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" style="color:#6d28d9">${url}</a>`,
  )
}

export function ownerReminderHtml(reminder: OwnerReleaseReminder): string {
  const body = reminder.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${linkify(escapeHtml(paragraph))}</p>`)
    .join('')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6d28d9">SERGIK Release Studio</p>
    ${body}
  </div>
</body></html>`
}

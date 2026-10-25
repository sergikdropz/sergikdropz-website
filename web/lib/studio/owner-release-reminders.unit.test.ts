import { describe, expect, it } from 'vitest'
import {
  dueOwnerReleaseReminders,
  ownerReminderHtml,
  phoenixClock,
  STAYING_A_VIBE_REMINDERS,
} from '@/lib/studio/owner-release-reminders'

describe('owner release reminders', () => {
  it('reads Phoenix calendar time', () => {
    expect(phoenixClock(new Date('2026-10-07T15:30:00.000Z'))).toEqual({
      date: '2026-10-07',
      hour: 8,
    })
    expect(phoenixClock(new Date('2026-10-07T16:00:00.000Z'))).toEqual({
      date: '2026-10-07',
      hour: 9,
    })
  })

  it('waits until 9:00 Phoenix on the send day', () => {
    expect(dueOwnerReleaseReminders(new Date('2026-10-07T15:59:00.000Z')).map((item) => item.id)).toEqual([])
    expect(dueOwnerReleaseReminders(new Date('2026-10-07T16:00:00.000Z')).map((item) => item.id)).toEqual([
      'staying-a-vibe-prelaunch-2026-10-07',
    ])
  })

  it('does not send the day-before note after October 7', () => {
    expect(dueOwnerReleaseReminders(new Date('2026-10-08T16:00:00.000Z')).map((item) => item.id)).toEqual([
      'staying-a-vibe-isrc-pull-2026-10-08',
    ])
  })

  it('still sends a missed ISRC pull the next morning', () => {
    expect(dueOwnerReleaseReminders(new Date('2026-10-09T15:00:00.000Z')).map((item) => item.id)).toEqual([
      'staying-a-vibe-isrc-pull-2026-10-08',
    ])
    expect(dueOwnerReleaseReminders(new Date('2026-10-10T16:00:00.000Z'))).toEqual([])
  })

  it('keeps both notes addressed to the label inbox', () => {
    expect(STAYING_A_VIBE_REMINDERS.map((item) => item.to)).toEqual([
      'sergikdrops@gmail.com',
      'sergikdrops@gmail.com',
    ])
    const html = ownerReminderHtml(STAYING_A_VIBE_REMINDERS[1])
    expect(html).toContain('700563968501')
    expect(html).toContain('href="https://distrokid.com/dashboard/album/?albumuuid=D908E9D1-1514-4C04-988C051A39FFAE34"')
    expect(html).not.toContain('<script')
  })
})

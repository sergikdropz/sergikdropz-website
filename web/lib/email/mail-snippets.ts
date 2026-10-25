export type MailSnippet = {
  id: string
  label: string
  accounts: string[]
  subject: string
  body: string
}

export const MAIL_SNIPPETS: MailSnippet[] = [
  {
    id: 'booking-hold',
    label: 'Booking hold',
    accounts: ['bookings'],
    subject: 'Date hold',
    body: 'Thanks for the show inquiry. I can hold the date once I have the city, venue, set length, and fee. Reply with those and I will confirm the hold.',
  },
  {
    id: 'press-note',
    label: 'Press note',
    accounts: ['press'],
    subject: 'For your desk',
    body: 'Sharing a SERGIK release for your consideration. I can send audio, artwork, and a short bio. Tell me the outlet and the date you need them by.',
  },
  {
    id: 'release-day',
    label: 'Release-day reminder',
    accounts: ['studio'],
    subject: 'Release day',
    body: 'This release is out today. The store link, UPC, and ISRCs live in Release Studio. Reply if you need the codes or artwork sent again.',
  },
]

export function snippetsForAccount(accountId: string): MailSnippet[] {
  return MAIL_SNIPPETS.filter((snippet) => snippet.accounts.includes(accountId))
}

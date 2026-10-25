import { describe, expect, it } from 'vitest'
import { contractDraftHref, contractMailMatches, contractMailboxHref } from '@/lib/studio/contract-mail-link'

const releaseId = 'release-1790754809917-mv0itq40'

describe('contract mail link', () => {
  it('keeps a collab send and its reply on the collab card', () => {
    const sent = {
      accountId: 'studio',
      subject: 'Collaboration agreement for signing — Walk That Walk',
      body: `Open in Studio https://sergikdropz.com/studio/releases/${releaseId}?step=rights`,
    }
    const reply = {
      accountId: 'studio',
      subject: 'Re: Collaboration agreement for signing — Walk That Walk',
      body: `Reply filed for ${releaseId}`,
    }
    expect(contractMailMatches(sent, { releaseId, kind: 'collab_agreement', releaseTitle: 'Walk That Walk' })).toBe(true)
    expect(contractMailMatches(reply, { releaseId, kind: 'collab_agreement' })).toBe(true)
    expect(contractMailMatches(sent, { releaseId, kind: 'split_sheet', releaseTitle: 'Walk That Walk' })).toBe(false)
  })

  it('ignores other mailboxes and other releases', () => {
    expect(
      contractMailMatches(
        { accountId: 'shop', subject: 'Collaboration agreement for signing — Walk That Walk', body: releaseId },
        { releaseId, kind: 'collab_agreement' },
      ),
    ).toBe(false)
    expect(
      contractMailMatches(
        { accountId: 'studio', subject: 'Collaboration agreement for signing — Other', body: 'no id' },
        { releaseId, kind: 'collab_agreement', releaseTitle: 'Walk That Walk' },
      ),
    ).toBe(false)
  })

  it('opens the Release Studio mailbox filtered to this release', () => {
    expect(contractMailboxHref({ releaseTitle: 'Walk That Walk' })).toBe(
      '/admin/email?mailbox=studio&folder=sent&q=Walk+That+Walk',
    )
    expect(contractDraftHref('11111111-1111-4111-8111-111111111111')).toBe(
      '/admin/email?mailbox=studio&folder=drafts&compose=11111111-1111-4111-8111-111111111111',
    )
  })
})

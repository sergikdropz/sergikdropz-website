import { describe, expect, it } from 'vitest'
import crypto from 'crypto'
import {
  buildEnvelopeDefinition,
  docuSignRecipients,
  latestEnvelope,
  parseConnectPayload,
  parseDocuSignEnvelopes,
  signatureAnchor,
  statusPatchForEnvelope,
  upsertEnvelopeRecord,
} from '@/lib/studio/docusign-records'
import {
  normalizePrivateKey,
  readDocuSignConfig,
  signDocuSignJwt,
  verifyDocuSignHmac,
} from '@/lib/studio/docusign'
import type { ContractSignatory } from '@/lib/studio/rights-contract-send'

const PACKET = [
  'Signatures / acknowledgment',
  'SERGIK (Jordan Caboga): ______________________  Date: __________',
  'Breauxx (Damion Ross): ______________________  Date: __________',
].join('\n')

const SIGNATORIES: ContractSignatory[] = [
  { stage: 'SERGIK', email: null, skip: true, reason: 'SERGIK / self — approve in Studio' },
  { stage: 'Breauxx', email: 'breauxxinaz@gmail.com', skip: false },
]

describe('docusign records', () => {
  it('anchors a signature line to the party stage', () => {
    expect(signatureAnchor(PACKET, 'Breauxx')).toBe('Breauxx (Damion Ross)')
    expect(signatureAnchor(PACKET, 'SERGIK')).toBe('SERGIK (Jordan Caboga)')
    expect(signatureAnchor(PACKET, 'Nobody')).toBeNull()
  })

  it('sends collaborators and the configured SERGIK signer', () => {
    const rows = docuSignRecipients({
      signatories: SIGNATORIES,
      packetText: PACKET,
      sergikEmail: 'studio@sergikdropz.com',
      sergikName: 'SERGIK',
    })
    expect(rows.map((row) => row.email)).toEqual([
      'breauxxinaz@gmail.com',
      'studio@sergikdropz.com',
    ])
    expect(rows[0]?.anchor).toBe('Breauxx (Damion Ross)')
    expect(rows[1]?.anchor).toBe('SERGIK (Jordan Caboga)')
  })

  it('skips SERGIK when no signer email is configured', () => {
    const rows = docuSignRecipients({ signatories: SIGNATORIES, packetText: PACKET })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stage).toBe('Breauxx')
  })

  it('places a sign-here tab on the signature line and tags the release', () => {
    const recipients = docuSignRecipients({ signatories: SIGNATORIES, packetText: PACKET })
    const definition = buildEnvelopeDefinition({
      pdfBase64: Buffer.from('%PDF').toString('base64'),
      filename: 'split-sheet-walk-that-walk.pdf',
      subject: 'Split sheet for signing — Walk That Walk',
      blurb: 'Sign the split sheet.',
      releaseId: 'release-1790754809917-mv0itq40',
      kind: 'split_sheet',
      recipients,
      webhookUrl: 'https://sergikdropz.com/api/webhooks/docusign',
    })
    const signers = (definition.recipients as { signers: Array<{ tabs: { signHereTabs: Array<{ anchorString?: string }> } }> }).signers
    expect(signers[0]?.tabs.signHereTabs[0]?.anchorString).toBe('Breauxx (Damion Ross):')
    expect(definition.status).toBe('sent')
    expect(definition.eventNotification).toMatchObject({
      url: 'https://sergikdropz.com/api/webhooks/docusign',
    })
    const fields = (definition.customFields as { textCustomFields: Array<{ name: string; value: string }> }).textCustomFields
    expect(fields.find((field) => field.name === 'releaseId')?.value).toBe('release-1790754809917-mv0itq40')
  })

  it('keeps the newest envelope for a kind and ignores junk', () => {
    const first = upsertEnvelopeRecord([], {
      envelopeId: 'env-1',
      kind: 'split_sheet',
      status: 'sent',
      recipients: [{ stage: 'Breauxx', email: 'breauxxinaz@gmail.com' }],
      sentAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    })
    const next = upsertEnvelopeRecord(first, {
      envelopeId: 'env-1',
      kind: 'split_sheet',
      status: 'completed',
      recipients: [{ stage: 'Breauxx', email: 'breauxxinaz@gmail.com' }],
      sentAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T01:00:00.000Z',
    })
    expect(next).toHaveLength(1)
    expect(latestEnvelope(next, 'split_sheet')?.status).toBe('completed')
    expect(parseDocuSignEnvelopes([{ envelopeId: '', kind: 'nope' }])).toEqual([])
    expect(statusPatchForEnvelope('split_sheet', 'completed')).toEqual({ split_sheet_status: 'approved' })
    expect(statusPatchForEnvelope('split_sheet', 'declined')).toBeNull()
  })

  it('reads a Connect JSON payload', () => {
    expect(
      parseConnectPayload({
        event: 'envelope-completed',
        data: {
          envelopeId: 'env-9',
          envelopeSummary: {
            status: 'completed',
            customFields: {
              textCustomFields: [
                { name: 'releaseId', value: 'release-1' },
                { name: 'kind', value: 'split_sheet' },
              ],
            },
          },
        },
      }),
    ).toEqual({
      envelopeId: 'env-9',
      event: 'envelope-completed',
      releaseId: 'release-1',
      kind: 'split_sheet',
      status: 'completed',
    })
  })
})

describe('docusign auth helpers', () => {
  it('stays unconfigured until the four credentials exist', () => {
    expect(readDocuSignConfig({} as NodeJS.ProcessEnv)).toBeNull()
    const config = readDocuSignConfig({
      DOCUSIGN_INTEGRATION_KEY: 'ik',
      DOCUSIGN_USER_ID: 'user',
      DOCUSIGN_ACCOUNT_ID: 'account',
      DOCUSIGN_RSA_PRIVATE_KEY: 'line1\\nline2',
      DOCUSIGN_OAUTH_HOST: 'https://account-d.docusign.com/',
    } as unknown as NodeJS.ProcessEnv)
    expect(config?.oauthHost).toBe('account-d.docusign.com')
    expect(config?.privateKey).toContain('BEGIN PRIVATE KEY')
    expect(normalizePrivateKey('-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----')).toContain(
      'BEGIN RSA PRIVATE KEY',
    )
  })

  it('signs a JWT and checks the Connect HMAC', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const config = readDocuSignConfig({
      DOCUSIGN_INTEGRATION_KEY: 'ik',
      DOCUSIGN_USER_ID: 'user',
      DOCUSIGN_ACCOUNT_ID: 'account',
      DOCUSIGN_RSA_PRIVATE_KEY: pem,
    } as unknown as NodeJS.ProcessEnv)
    expect(config).not.toBeNull()
    const jwt = signDocuSignJwt(config!, 1_700_000_000)
    expect(jwt.split('.')).toHaveLength(3)
    const body = '{"event":"envelope-completed"}'
    const signature = crypto.createHmac('sha256', 'connect-secret').update(body).digest('base64')
    expect(verifyDocuSignHmac(body, signature, 'connect-secret')).toBe(true)
    expect(verifyDocuSignHmac(body, signature, 'other-secret')).toBe(false)
  })
})

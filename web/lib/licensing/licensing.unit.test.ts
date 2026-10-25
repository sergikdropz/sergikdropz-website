import { describe, expect, it } from 'vitest'
import { attorneyActionBlock, stripeNameMatchesLicensor } from '@/lib/licensing/operator-gate'
import { quoteAmountError } from '@/lib/licensing/quote-sheet'
import { classifyLicensingMx } from '@/lib/licensing/inbound-mx'
import { licensingQuoteMail } from '@/lib/licensing/mail'
import { listMailDepartments } from '@/lib/email/departments'
import { matchDepartmentRecipient } from '@/lib/email/department-mailbox'
import { assessRightsGate } from '@/lib/licensing/eligibility'
import { licensingPublicId } from '@/lib/licensing/ids'
import { licensingPaymentDecision } from '@/lib/licensing/payment-decision'
import { assessLicensingRisk } from '@/lib/licensing/risk'
import { assertInquiryTransition, canTransitionInquiry } from '@/lib/licensing/states'
import { renderLicenseDraft, AGREEMENT_NOT_FOR_SIGNATURE } from '@/lib/licensing/agreement'
import { reviewMusicBooks } from '@/lib/licensing/books'
import { licensorSignatureBlock } from '@/lib/licensing/identity'
import { buildAuthorizedUse } from '@/lib/licensing/authorized-use'
import { parseLicensingInquiry } from '@/lib/licensing/inquiry-input'

describe('licensing domain', () => {
  it('records paid reach and stems without treating a listen as a grant', () => {
    const parsed = parseLicensingInquiry({
      kind: 'catalog',
      fullName: 'Ada Buyer',
      companyName: 'Northwind',
      email: 'ada@northwind.example',
      projectName: 'Spring film',
      projectDescription: 'A thirty second spot for a warehouse film.',
      usageType: 'Advertising',
      reach: 'paid',
      needsStems: true,
      mediaBudget: '15000',
      trackTitle: 'Neon Drift',
      authorized: true,
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const use = buildAuthorizedUse({
      licenseId: 'SERGIK-USE-2026-00001',
      rights: parsed.value,
      activatedAt: '2026-10-11T00:00:00.000Z',
      note: 'Signed agreement is on file.',
    })
    expect(use.paidAdvertising).toBe(true)
    expect(use.needsStems).toBe(true)
    expect(use.permitted).toBe(true)
  })

  it('names one licensor and the credit names', () => {
    const block = licensorSignatureBlock()
    expect(block).toContain('Nexus Studios AZ LLC')
    expect(block).toContain('SERGIKdropz')
    expect(block).toContain('Jordan Caboga')
    expect(block).toContain('SERGIK Music')
    expect(block).toContain('Maricopa County')
  })

  it('formats a public inquiry id', () => {
    expect(licensingPublicId(2026, 1)).toBe('SERGIK-LIC-2026-00001')
  })

  it('rejects a skip from email verification to active', () => {
    expect(canTransitionInquiry('EMAIL_VERIFICATION_PENDING', 'ACTIVE')).toBe(false)
    expect(() => assertInquiryTransition('QUOTE_SENT', 'ACTIVE')).toThrow(/cannot move/)
  })

  it('flags check overpayment language as high or blocked', () => {
    const risk = assessLicensingRisk({
      email: 'buyer@brand.com',
      companyName: 'Northwind Films',
      narrative: 'We will send a cashier’s check for $2000. Please forward the difference after mobile deposit.',
      kind: 'catalog',
      rightsCleared: true,
    })
    expect(risk.level === 'high' || risk.level === 'blocked').toBe(true)
    expect(risk.reasons.join(' ')).toMatch(/Check|forward/i)
  })

  it('blocks a disposable email', () => {
    const risk = assessLicensingRisk({
      email: 'x@mailinator.com',
      companyName: 'Studio',
      kind: 'catalog',
      rightsCleared: true,
    })
    expect(risk.level).toBe('blocked')
  })

  it('holds a track whose shares are incomplete', () => {
    const gate = assessRightsGate({
      track: { title: 'Demo', splits: [], contains_samples: false },
      sampleClearanceStatus: 'approved',
      splitSheetStatus: 'approved',
      legalLocked: true,
    })
    expect(gate.cleared).toBe(false)
    expect(gate.reasons.join(' ')).toMatch(/100%/)
  })

  it('holds uncleared samples', () => {
    const gate = assessRightsGate({
      track: {
        title: 'Demo',
        contains_samples: true,
        splits: [
          { name: 'Jordan Caboga', percentage: 100, copyright: 'master' },
          { name: 'Jordan Caboga', percentage: 100, copyright: 'composition' },
        ],
      },
      sampleClearanceStatus: 'missing',
      splitSheetStatus: 'approved',
      legalLocked: true,
    })
    expect(gate.cleared).toBe(false)
    expect(gate.reasons.join(' ')).toMatch(/sample/i)
  })

  it('refuses a payment that is only a browser success or the wrong amount', () => {
    expect(
      licensingPaymentDecision({
        paymentStatus: 'unpaid',
        amountTotal: 50000,
        currency: 'usd',
        quoteCents: 50000,
        quoteCurrency: 'usd',
        quoteAccepted: true,
      }).ok,
    ).toBe(false)
    expect(
      licensingPaymentDecision({
        paymentStatus: 'paid',
        amountTotal: 200000,
        currency: 'usd',
        quoteCents: 50000,
        quoteCurrency: 'usd',
        quoteAccepted: true,
      }).ok,
    ).toBe(false)
    expect(
      licensingPaymentDecision({
        paymentStatus: 'paid',
        amountTotal: 50000,
        currency: 'usd',
        quoteCents: 50000,
        quoteCurrency: 'usd',
        quoteAccepted: true,
      }).ok,
    ).toBe(true)
  })

  it('keeps the draft agreement off the signature path', () => {
    const text = renderLicenseDraft({
      publicId: 'SERGIK-LIC-2026-00001',
      licenseeName: 'Ada Films',
      contractingEntity: 'Ada Films LLC',
      trackTitle: 'Night Drive',
      usage: 'One web ad',
      territory: 'United States',
      term: '1 year',
      feeLabel: 'Quoted on the invoice',
      exclusivity: 'non-exclusive',
    })
    expect(text.startsWith(AGREEMENT_NOT_FOR_SIGNATURE)).toBe(true)
    expect(text).toContain('does not transfer copyright')
    expect(text).toMatch(/Content ID/)
  })

  it('asks a CPA about tax and flags a forwarded check', () => {
    const report = reviewMusicBooks({
      text: 'Please mobile deposit the cashier’s check and forward the difference.',
      quotedCents: 50000,
      paidCents: 200000,
      currency: 'usd',
      paidCurrency: 'usd',
    })
    expect(report.disclaimer).toMatch(/not an accountant/)
    expect(report.findings.some((row) => row.id === 'off-platform-payment')).toBe(true)
    expect(report.findings.some((row) => row.id === 'amount-mismatch')).toBe(true)
    expect(report.findings.some((row) => row.id === 'cpa-questions')).toBe(true)
  })

  it('keeps exclusive and uncleared requests off the private quote sheet', () => {
    expect(
      quoteAmountError({
        kind: 'catalog',
        usageType: 'Creator / Social',
        exclusivity: 'exclusive',
        rightsCleared: true,
        cents: 25000,
      }),
    ).toMatch(/Exclusive/)
    expect(
      quoteAmountError({
        kind: 'catalog',
        usageType: 'Film',
        exclusivity: 'non-exclusive',
        rightsCleared: false,
        cents: 150000,
      }),
    ).toMatch(/not cleared/)
    expect(
      quoteAmountError({
        kind: 'catalog',
        usageType: 'Creator / Social',
        exclusivity: 'non-exclusive',
        rightsCleared: true,
        cents: 10000,
      }),
    ).toMatch(/250\.00/)
    expect(
      quoteAmountError({
        kind: 'catalog',
        usageType: 'Creator / Social',
        exclusivity: 'non-exclusive',
        rightsCleared: true,
        cents: 25000,
      }),
    ).toBeNull()
  })

  it('locks attorney review until the licensor, Stripe, and a lawyer line up', () => {
    expect(
      attorneyActionBlock({
        reviewEnabled: false,
        copyrightOwner: 'unconfirmed',
        stripeChecked: false,
        stripeNameMatchesLlc: false,
      }),
    ).toMatch(/copyright/)
    expect(
      attorneyActionBlock({
        reviewEnabled: true,
        copyrightOwner: 'personal',
        stripeChecked: true,
        stripeNameMatchesLlc: true,
      }),
    ).toMatch(/Nexus Studios AZ LLC/)
    expect(
      attorneyActionBlock({
        reviewEnabled: false,
        copyrightOwner: 'llc',
        stripeChecked: true,
        stripeNameMatchesLlc: true,
      }),
    ).toMatch(/LICENSING_ATTORNEY_REVIEW_ENABLED/)
    expect(
      attorneyActionBlock({
        reviewEnabled: true,
        copyrightOwner: 'llc',
        stripeChecked: true,
        stripeNameMatchesLlc: true,
      }),
    ).toBeNull()
    expect(stripeNameMatchesLicensor('Nexus Studios AZ LLC')).toBe(true)
    expect(stripeNameMatchesLicensor('SERGIK')).toBe(false)
  })

  it('routes licensing replies only when Resend receives the domain', () => {
    expect(classifyLicensingMx([]).ready).toBe(false)
    expect(classifyLicensingMx(['aspmx.l.google.com']).detail).toMatch(/owner inbox/)
    expect(classifyLicensingMx(['inbound-smtp.resend.com']).ready).toBe(true)
    const licensing = listMailDepartments().find((account) => account.id === 'licensing')
    expect(
      matchDepartmentRecipient('SERGIK Licensing <licensing@sergikdropz.com>', licensing ? [licensing] : [])?.id,
    ).toBe('licensing')
  })

  it('labels a custom production quote as an estimate', () => {
    expect(licensingQuoteMail({ publicId: 'SERGIK-LIC-2026-00002', deskUrl: 'desk', feeLabel: 'USD 500.00', estimate: true }).text).toMatch(
      /not a license/,
    )
  })
})

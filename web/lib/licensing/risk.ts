export type RiskLevel = 'low' | 'review' | 'high' | 'blocked'

export type RiskAssessment = {
  level: RiskLevel
  score: number
  reasons: string[]
}

const DISPOSABLE_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamailblock.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'sharklasers.com',
]

const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com']

const BRAND_NAMES = ['nike', 'apple', 'coca-cola', 'coca cola', 'disney', 'netflix', 'amazon', 'google', 'microsoft', 'meta', 'adidas']

const FRAUD_PATTERNS: Array<{ id: string; pattern: RegExp; reason: string }> = [
  { id: 'overpay', pattern: /over\s?pay|pay extra|extra (?:money|funds|amount)|keep the (?:change|difference)/i, reason: 'Overpayment language' },
  { id: 'forward', pattern: /forward (?:the )?(?:balance|difference|rest|funds)|send (?:the )?(?:rest|difference) back/i, reason: 'Request to forward a payment balance' },
  { id: 'check', pattern: /cashier'?s check|certified check|mobile deposit|check image|photo of (?:a |the )?check|e-?check/i, reason: 'Check or mobile-deposit payment' },
  { id: 'bank', pattern: /routing number|bank account|wire instructions|send (?:me |us )?your (?:bank|routing|account)/i, reason: 'Request for banking credentials or wire instructions' },
  { id: 'third', pattern: /pay (?:my |our )?(?:contractor|vendor|editor)|third[- ]party (?:payment|transfer)|western union|moneygram/i, reason: 'Third-party payment or transfer' },
]

function domainOf(email: string): string {
  return email.split('@')[1]?.trim().toLowerCase() || ''
}

function hostOf(website: string): string {
  const raw = website.trim()
  if (!raw) return ''
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function assessLicensingRisk(input: {
  email: string
  companyName: string
  website?: string | null
  narrative?: string | null
  exclusivity?: string | null
  kind?: 'catalog' | 'custom_production' | null
  rightsCleared?: boolean | null
}): RiskAssessment {
  const reasons: string[] = []
  let score = 0
  const emailDomain = domainOf(input.email)
  const narrative = `${input.companyName}\n${input.narrative || ''}`
  const websiteHost = hostOf(input.website || '')

  if (DISPOSABLE_DOMAINS.includes(emailDomain)) {
    score += 80
    reasons.push('Disposable email domain')
  }

  for (const rule of FRAUD_PATTERNS) {
    if (rule.pattern.test(narrative)) {
      score += 40
      reasons.push(rule.reason)
    }
  }

  const company = input.companyName.toLowerCase()
  if (BRAND_NAMES.some((brand) => company.includes(brand)) && FREE_EMAIL_DOMAINS.includes(emailDomain)) {
    score += 35
    reasons.push('Known brand name with a free email domain')
  }

  if (websiteHost && emailDomain && websiteHost !== emailDomain && !websiteHost.endsWith(`.${emailDomain}`) && !emailDomain.endsWith(`.${websiteHost}`)) {
    score += 15
    reasons.push('Email domain does not match the company website')
  }

  if (input.exclusivity === 'exclusive') {
    score += 25
    reasons.push('Exclusive use requires manual approval')
  }

  if (input.kind === 'custom_production') {
    score += 10
    reasons.push('Custom production is quoted by hand')
  }

  if (input.rightsCleared === false) {
    score += 30
    reasons.push('Track rights are not cleared for automated licensing')
  }

  let level: RiskLevel = 'low'
  if (score >= 80 || reasons.includes('Disposable email domain')) level = 'blocked'
  else if (score >= 40) level = 'high'
  else if (score >= 10) level = 'review'

  if (!reasons.length) reasons.push('No fraud indicators in the submitted text')

  return { level, score, reasons }
}

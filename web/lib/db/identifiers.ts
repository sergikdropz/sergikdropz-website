const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function sanitizeIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '')
}

export function ensureIdentifierOrThrow(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`)
  }
  const sanitized = sanitizeIdentifier(value)
  if (!sanitized || !IDENTIFIER_RE.test(sanitized)) {
    throw new Error(`Invalid ${label}`)
  }
  return sanitized
}


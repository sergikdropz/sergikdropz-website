import { createHash, randomBytes } from 'crypto'

export function licensingPublicId(year: number, serial: number): string {
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : new Date().getUTCFullYear()
  const safeSerial = Math.max(1, Math.trunc(serial))
  return `SERGIK-LIC-${safeYear}-${String(safeSerial).padStart(5, '0')}`
}

export function licenseVerifyId(year: number, serial: number): string {
  return `SERGIK-LIC-VER-${year}-${String(Math.max(1, Math.trunc(serial))).padStart(5, '0')}`
}

export function newLicensingToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashLicensingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

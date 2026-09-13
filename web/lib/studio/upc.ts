/** Generate an internal UPC-style identifier (not GS1-certified). */
export function generateInternalUpc(prefix = '019999'): string {
  const body = String(Date.now()).slice(-8)
  const base = `${prefix}${body}`.padEnd(12, '0').slice(0, 12)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base[i]!, 10)
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  const check = (10 - (sum % 10)) % 10
  return base + check
}

import { createHash } from 'node:crypto'

/** Short deterministic id for correlating support / logs (no prompt body). */
export function computeAdminChatRunFingerprint(input: Record<string, string | number | boolean | null>): string {
  const keys = Object.keys(input).sort()
  const stable: Record<string, string | number | boolean | null> = {}
  for (const k of keys) {
    stable[k] = input[k]!
  }
  const h = createHash('sha256')
  h.update(JSON.stringify(stable))
  return `fp_${h.digest('hex').slice(0, 20)}`
}

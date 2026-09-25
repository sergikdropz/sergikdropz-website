import { promises as fs } from 'fs'
import path from 'path'
import { emptyRoyaltyStore } from '@/lib/studio/royalties/ledger'
import type { RoyaltyStoreSnapshot } from '@/lib/studio/royalties/types'

const STORE_RELATIVE = path.join('data', 'royalties', 'store.json')

function storePath(): string {
  return path.join(process.cwd(), STORE_RELATIVE)
}

function isSnapshot(value: unknown): value is RoyaltyStoreSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as RoyaltyStoreSnapshot
  return (
    v.version === 1 &&
    Array.isArray(v.payees) &&
    Array.isArray(v.statements) &&
    Array.isArray(v.lines) &&
    Array.isArray(v.ledger) &&
    Array.isArray(v.payouts)
  )
}

export async function readRoyaltyStore(): Promise<RoyaltyStoreSnapshot> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (isSnapshot(parsed)) return parsed
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : null
    if (code !== 'ENOENT') {
      console.warn('[royalties] store read failed, using empty snapshot', err)
    }
  }
  return emptyRoyaltyStore()
}

export async function writeRoyaltyStore(store: RoyaltyStoreSnapshot): Promise<void> {
  const file = storePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const payload: RoyaltyStoreSnapshot = {
    ...store,
    updatedAt: new Date().toISOString(),
  }
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, file)
}

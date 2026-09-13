import { createHash } from 'node:crypto'
import { createSupabaseServerClient } from '@/lib/supabase'

export type IdempotencyRecord = {
  key: string
  operation: string
  adminId: string
  status: 'pending' | 'completed' | 'failed'
  response?: Record<string, unknown> | null
  createdAt: string
  completedAt?: string | null
}

/**
 * In-memory + optional DB-backed idempotency for mutation retries.
 * DB table `admin_idempotency_keys` is best-effort; memory covers single-instance deploys.
 */
const memoryStore = new Map<string, IdempotencyRecord>()

function memoryKey(adminId: string, operation: string, key: string) {
  return `${adminId}::${operation}::${key}`
}

export function normalizeIdempotencyKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 128) return null
  if (!/^[a-zA-Z0-9._:-]+$/.test(trimmed)) return null
  return trimmed
}

export function hashPayloadForIdempotency(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex').slice(0, 32)
}

export async function beginIdempotentOperation(params: {
  adminId: string
  operation: string
  key: string
}): Promise<{ existing: IdempotencyRecord | null }> {
  const storeKey = memoryKey(params.adminId, params.operation, params.key)
  const existing = memoryStore.get(storeKey)
  if (existing && (existing.status === 'completed' || existing.status === 'pending')) {
    return { existing }
  }

  try {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('admin_idempotency_keys')
      .select('key, operation, admin_id, status, response, created_at, completed_at')
      .eq('admin_id', params.adminId)
      .eq('operation', params.operation)
      .eq('key', params.key)
      .maybeSingle()

    if (data) {
      const record: IdempotencyRecord = {
        key: data.key,
        operation: data.operation,
        adminId: data.admin_id,
        status: data.status,
        response: data.response,
        createdAt: data.created_at,
        completedAt: data.completed_at,
      }
      memoryStore.set(storeKey, record)
      return { existing: record }
    }

    await supabase.from('admin_idempotency_keys').insert({
      key: params.key,
      operation: params.operation,
      admin_id: params.adminId,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
  } catch {
    // Table may not exist yet; memory fallback still prevents same-process duplicates.
  }

  const pending: IdempotencyRecord = {
    key: params.key,
    operation: params.operation,
    adminId: params.adminId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  memoryStore.set(storeKey, pending)
  return { existing: null }
}

export async function completeIdempotentOperation(params: {
  adminId: string
  operation: string
  key: string
  status: 'completed' | 'failed'
  response?: Record<string, unknown> | null
}) {
  const storeKey = memoryKey(params.adminId, params.operation, params.key)
  const completedAt = new Date().toISOString()
  const record: IdempotencyRecord = {
    key: params.key,
    operation: params.operation,
    adminId: params.adminId,
    status: params.status,
    response: params.response ?? null,
    createdAt: memoryStore.get(storeKey)?.createdAt ?? completedAt,
    completedAt,
  }
  memoryStore.set(storeKey, record)

  try {
    const supabase = createSupabaseServerClient()
    await supabase
      .from('admin_idempotency_keys')
      .upsert({
        key: params.key,
        operation: params.operation,
        admin_id: params.adminId,
        status: params.status,
        response: params.response ?? null,
        created_at: record.createdAt,
        completed_at: completedAt,
      })
  } catch {
    // Best-effort persistence.
  }
}

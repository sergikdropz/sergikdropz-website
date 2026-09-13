import { createHash, randomUUID } from 'node:crypto'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { BackgroundJob, JobStatus } from './types'

const memoryJobs = new Map<string, BackgroundJob>()

function nowIso() {
  return new Date().toISOString()
}

export function createJobId(type: string, seed?: string): string {
  if (seed) {
    return createHash('sha256').update(`${type}:${seed}`).digest('hex').slice(0, 24)
  }
  return randomUUID()
}

export async function createJob(params: {
  type: string
  adminId: string
  payload: Record<string, unknown>
  total?: number
  maxAttempts?: number
  idempotencySeed?: string
}): Promise<BackgroundJob> {
  const id = createJobId(params.type, params.idempotencySeed)
  const existing = memoryJobs.get(id)
  if (existing && (existing.status === 'queued' || existing.status === 'running' || existing.status === 'completed')) {
    return existing
  }

  const job: BackgroundJob = {
    id,
    type: params.type,
    status: 'queued',
    adminId: params.adminId,
    payload: params.payload,
    progress: {
      total: params.total ?? 0,
      completed: 0,
      failed: 0,
    },
    attempts: 0,
    maxAttempts: params.maxAttempts ?? 3,
    lastError: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
    costMeta: { providerCalls: 0, promptChars: 0, completionChars: 0, durationMs: 0 },
  }
  memoryJobs.set(id, job)

  try {
    const supabase = createSupabaseServerClient()
    await supabase.from('admin_background_jobs').upsert({
      id: job.id,
      type: job.type,
      status: job.status,
      admin_id: job.adminId,
      payload: job.payload,
      progress: job.progress,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    })
  } catch {
    // Best-effort persistence until migration is applied.
  }

  return job
}

export async function getJob(id: string): Promise<BackgroundJob | null> {
  const local = memoryJobs.get(id)
  if (local) return local
  try {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase.from('admin_background_jobs').select('*').eq('id', id).maybeSingle()
    if (!data) return null
    const job: BackgroundJob = {
      id: data.id,
      type: data.type,
      status: data.status,
      adminId: data.admin_id,
      payload: data.payload ?? {},
      progress: data.progress ?? { total: 0, completed: 0, failed: 0 },
      attempts: data.attempts ?? 0,
      maxAttempts: data.max_attempts ?? 3,
      lastError: data.last_error,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      completedAt: data.completed_at,
      costMeta: data.cost_meta ?? undefined,
    }
    memoryJobs.set(id, job)
    return job
  } catch {
    return null
  }
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<BackgroundJob, 'status' | 'progress' | 'attempts' | 'lastError' | 'costMeta' | 'completedAt'>>
): Promise<BackgroundJob | null> {
  const current = (await getJob(id)) ?? memoryJobs.get(id)
  if (!current) return null

  const next: BackgroundJob = {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  }
  if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled') {
    next.completedAt = patch.completedAt ?? nowIso()
  }
  memoryJobs.set(id, next)

  try {
    const supabase = createSupabaseServerClient()
    await supabase
      .from('admin_background_jobs')
      .update({
        status: next.status,
        progress: next.progress,
        attempts: next.attempts,
        last_error: next.lastError ?? null,
        cost_meta: next.costMeta ?? null,
        updated_at: next.updatedAt,
        completed_at: next.completedAt ?? null,
      })
      .eq('id', id)
  } catch {
    // Best-effort.
  }

  return next
}

export function isTerminalStatus(status: JobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

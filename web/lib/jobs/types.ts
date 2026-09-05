export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type BackgroundJob = {
  id: string
  type: string
  status: JobStatus
  adminId: string
  payload: Record<string, unknown>
  progress: {
    total: number
    completed: number
    failed: number
    /** v2 staged progress (0–100) — independent of DSP gate %. */
    percent?: number
    stage?: string
    label?: string
    message?: string
    recipeId?: string
    dspPercent?: number
    dspStatus?: string
  }
  attempts: number
  maxAttempts: number
  lastError?: string | null
  createdAt: string
  updatedAt: string
  completedAt?: string | null
  costMeta?: {
    promptChars?: number
    completionChars?: number
    durationMs?: number
    providerCalls?: number
  }
}

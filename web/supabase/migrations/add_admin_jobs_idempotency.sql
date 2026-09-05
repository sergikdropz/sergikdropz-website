-- Background jobs + idempotency keys for Admin AI / audio pipelines.
-- Best-effort tables; application code falls back to in-memory stores if missing.

CREATE TABLE IF NOT EXISTS public.admin_idempotency_keys (
  admin_id uuid NOT NULL,
  operation text NOT NULL,
  key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  PRIMARY KEY (admin_id, operation, key)
);

CREATE INDEX IF NOT EXISTS admin_idempotency_keys_status_idx
  ON public.admin_idempotency_keys (status);

CREATE TABLE IF NOT EXISTS public.admin_background_jobs (
  id text PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  admin_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress jsonb NOT NULL DEFAULT '{"total":0,"completed":0,"failed":0}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text NULL,
  cost_meta jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS admin_background_jobs_admin_status_idx
  ON public.admin_background_jobs (admin_id, status);

CREATE INDEX IF NOT EXISTS admin_background_jobs_type_idx
  ON public.admin_background_jobs (type);

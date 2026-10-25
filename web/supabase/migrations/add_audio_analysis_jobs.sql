-- Analysis jobs: one pending row per file hash + analyzer version.
-- The Vercel upload route inserts the row. The Mac worker claims it.

ALTER TABLE public.audio_files ADD COLUMN IF NOT EXISTS file_hash text;
ALTER TABLE public.audio_files ADD COLUMN IF NOT EXISTS analyzer_version text;

CREATE INDEX IF NOT EXISTS audio_files_hash_version_idx
  ON public.audio_files (file_hash, analyzer_version);

CREATE TABLE IF NOT EXISTS public.audio_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash text,
  analyzer_version text NOT NULL,
  audio_file_id text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audio_analysis_jobs_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS audio_analysis_jobs_hash_version_uidx
  ON public.audio_analysis_jobs (file_hash, analyzer_version)
  WHERE file_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS audio_analysis_jobs_audio_file_version_uidx
  ON public.audio_analysis_jobs (audio_file_id, analyzer_version)
  WHERE audio_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audio_analysis_jobs_pending_idx
  ON public.audio_analysis_jobs (created_at)
  WHERE status = 'pending';

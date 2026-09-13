-- Admin AI run/action/approval audit tables

CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('chat', 'execute')),
  prompt TEXT NOT NULL,
  response JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approval_required', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_admin_id ON ai_runs(admin_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status);
CREATE INDEX IF NOT EXISTS idx_ai_runs_created_at ON ai_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  status TEXT NOT NULL CHECK (status IN ('previewed', 'executed', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_run_id ON ai_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_created_at ON ai_actions(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES ai_actions(id) ON DELETE CASCADE,
  approved_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved BOOLEAN NOT NULL DEFAULT false,
  approval_note TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_approvals_run_id ON ai_approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_action_id ON ai_approvals(action_id);

ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_approvals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_runs' AND policyname = 'Admins can select ai_runs'
  ) THEN
    CREATE POLICY "Admins can select ai_runs"
      ON ai_runs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM admins
          WHERE admins.user_id = auth.uid()
            AND admins.active = true
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_runs' AND policyname = 'Service role full access to ai_runs'
  ) THEN
    CREATE POLICY "Service role full access to ai_runs"
      ON ai_runs
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_actions' AND policyname = 'Admins can select ai_actions'
  ) THEN
    CREATE POLICY "Admins can select ai_actions"
      ON ai_actions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM admins
          WHERE admins.user_id = auth.uid()
            AND admins.active = true
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_actions' AND policyname = 'Service role full access to ai_actions'
  ) THEN
    CREATE POLICY "Service role full access to ai_actions"
      ON ai_actions
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_approvals' AND policyname = 'Admins can select ai_approvals'
  ) THEN
    CREATE POLICY "Admins can select ai_approvals"
      ON ai_approvals
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM admins
          WHERE admins.user_id = auth.uid()
            AND admins.active = true
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_approvals' AND policyname = 'Service role full access to ai_approvals'
  ) THEN
    CREATE POLICY "Service role full access to ai_approvals"
      ON ai_approvals
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

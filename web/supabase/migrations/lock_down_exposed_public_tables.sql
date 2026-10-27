-- Close tables that were created in public without Row-Level Security.
-- Supabase grants anon/authenticated full access by default. With RLS off,
-- the publishable API key could read, edit, and delete every row.
-- Server routes use the service role, which bypasses RLS.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'admin_background_jobs',
    'admin_idempotency_keys',
    'audio_analysis_jobs',
    'email_subscribers',
    'instagram_media',
    'isrc_counters',
    'licenses',
    'memberships',
    'merch_designs',
    'merch_orders',
    'release_collab_email_sends',
    'release_collab_invites',
    'release_collab_messages',
    'release_collab_reviews',
    'release_collaborators',
    'stripe_webhook_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_api_deny', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t || '_api_deny',
      t
    );
  END LOOP;
END
$$;

-- assign_isrc writes isrc_counters as the caller. Keep it off the Data API.
DO $$
BEGIN
  IF to_regprocedure('public.assign_isrc(text, integer, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.assign_isrc(text, integer, text) FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

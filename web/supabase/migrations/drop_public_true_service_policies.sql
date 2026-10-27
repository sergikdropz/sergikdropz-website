-- "Service role full access" policies were created FOR ALL TO public USING (true).
-- The service role already bypasses RLS, so those policies only opened the
-- tables to the publishable API key. Drop them. Intentional public reads
-- (catalog, gallery, analytics inserts) stay in place.

DROP POLICY IF EXISTS "Service role full access to activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role full access to admin_ai_digest_sends" ON public.admin_ai_digest_sends;
DROP POLICY IF EXISTS "Service role full access to admin_tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Service role full access" ON public.admins;
DROP POLICY IF EXISTS "Service role full access to ai_actions" ON public.ai_actions;
DROP POLICY IF EXISTS "Service role full access to ai_approvals" ON public.ai_approvals;
DROP POLICY IF EXISTS "Service role full access to ai_runs" ON public.ai_runs;
DROP POLICY IF EXISTS "Service role full access to analytics" ON public.analytics_events;
DROP POLICY IF EXISTS "Service role full access to campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admin full access on revenue_splits" ON public.revenue_splits;
DROP POLICY IF EXISTS "Service role full access to settings" ON public.settings;
DROP POLICY IF EXISTS "Service role full access to smart_playlists" ON public.smart_playlists;
DROP POLICY IF EXISTS "Service role full access to smartlinks" ON public.smartlinks;
DROP POLICY IF EXISTS "Service role full access to track_plays" ON public.track_plays;

-- Gallery writes were USING (true), so the publishable key could change images.
DROP POLICY IF EXISTS "Admins can insert gallery images" ON public.gallery_images;
DROP POLICY IF EXISTS "Admins can update gallery images" ON public.gallery_images;
DROP POLICY IF EXISTS "Admins can delete gallery images" ON public.gallery_images;

CREATE POLICY "Admins can insert gallery images"
  ON public.gallery_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.user_id = auth.uid()
        AND admins.active = true
    )
  );

CREATE POLICY "Admins can update gallery images"
  ON public.gallery_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.user_id = auth.uid()
        AND admins.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.user_id = auth.uid()
        AND admins.active = true
    )
  );

CREATE POLICY "Admins can delete gallery images"
  ON public.gallery_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.user_id = auth.uid()
        AND admins.active = true
    )
  );

NOTIFY pgrst, 'reload schema';

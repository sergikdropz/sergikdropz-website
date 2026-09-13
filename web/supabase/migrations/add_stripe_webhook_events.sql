-- Idempotent Stripe webhook processing (dedupe by Stripe event id).
-- Apply in Supabase SQL editor or via your migration workflow.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
  ON public.stripe_webhook_events (received_at DESC);

COMMENT ON TABLE public.stripe_webhook_events IS 'Records processed Stripe webhook event ids for idempotency (service role only).';

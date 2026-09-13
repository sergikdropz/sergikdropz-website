-- Phase 2 Fixes: Align campaign_sends with worker usage
-- Adds campaign_id + scheduled_for fields and indexes

ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Backfill campaign_id from sequences
UPDATE campaign_sends cs
SET campaign_id = seq.campaign_id
FROM campaign_sequences seq
WHERE cs.campaign_id IS NULL
  AND cs.sequence_id = seq.id;

-- Indexes for scheduler and sender
CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign_id ON campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_scheduled_for ON campaign_sends(scheduled_for);

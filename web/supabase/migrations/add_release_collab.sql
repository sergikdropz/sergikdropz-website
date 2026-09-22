-- Release Collab: collaborators, in-app thread, magic-link review invites, email send log.
-- From-address for outbound mail: release.studio@sergikdropz.com (app config, not DB).

CREATE TABLE IF NOT EXISTS release_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id TEXT NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'collaborator'
    CHECK (role IN ('writer', 'producer', 'featured', 'label', 'manager', 'collaborator', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (release_id, email)
);

CREATE INDEX IF NOT EXISTS idx_release_collaborators_release_id
  ON release_collaborators(release_id);
CREATE INDEX IF NOT EXISTS idx_release_collaborators_email
  ON release_collaborators(lower(email));

CREATE TABLE IF NOT EXISTS release_collab_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id TEXT NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  collaborator_id UUID REFERENCES release_collaborators(id) ON DELETE SET NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('studio', 'collaborator')),
  author_name TEXT NOT NULL,
  author_email TEXT,
  body TEXT NOT NULL,
  notify_email BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_collab_messages_release_id
  ON release_collab_messages(release_id, created_at);

CREATE TABLE IF NOT EXISTS release_collab_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id TEXT NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES release_collaborators(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_collab_invites_release_id
  ON release_collab_invites(release_id);
CREATE INDEX IF NOT EXISTS idx_release_collab_invites_token
  ON release_collab_invites(token);

CREATE TABLE IF NOT EXISTS release_collab_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id TEXT NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES release_collaborators(id) ON DELETE CASCADE,
  invite_id UUID REFERENCES release_collab_invites(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'changes_requested')),
  note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (release_id, collaborator_id)
);

CREATE INDEX IF NOT EXISTS idx_release_collab_reviews_release_id
  ON release_collab_reviews(release_id);

CREATE TABLE IF NOT EXISTS release_collab_email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id TEXT NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  collaborator_id UUID REFERENCES release_collaborators(id) ON DELETE SET NULL,
  message_id UUID REFERENCES release_collab_messages(id) ON DELETE SET NULL,
  invite_id UUID REFERENCES release_collab_invites(id) ON DELETE SET NULL,
  resend_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'thread_notify'
    CHECK (kind IN ('thread_notify', 'review_invite', 'other')),
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'bounced', 'complained', 'failed')),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  error_message TEXT,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_collab_email_sends_release_id
  ON release_collab_email_sends(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_collab_email_sends_resend_id
  ON release_collab_email_sends(resend_id)
  WHERE resend_id IS NOT NULL;

COMMENT ON TABLE release_collaborators IS 'Per-release collab contacts for Release Collab thread + review portal';
COMMENT ON TABLE release_collab_messages IS 'In-app thread; email is notify channel via release_collab_email_sends';
COMMENT ON TABLE release_collab_invites IS 'Magic-link tokens for listen + approve portal (/collab/[token])';
COMMENT ON TABLE release_collab_email_sends IS 'Outbound Resend log; webhooks update delivery/open/bounce status';

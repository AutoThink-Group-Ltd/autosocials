-- Envelope encryption uses an Edge-only AES-256-GCM key, never a database-held key.
-- Legacy tokens are preserved for controlled backfill through meta-import-pages secure_existing.
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS token_encrypted_at timestamptz;
COMMENT ON COLUMN public.social_accounts.access_token IS 'Server-only provider credential. Meta v1 values use context-bound AES-256-GCM envelopes; legacy plaintext requires backfill.';
COMMENT ON COLUMN public.social_accounts.token_encrypted_at IS 'Timestamp when the current Meta credential was sealed with PUBLISH_META_TOKEN_KEY.';

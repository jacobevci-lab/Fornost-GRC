CREATE INDEX IF NOT EXISTS local_sessions_expiry_idx ON local_sessions(expires_at, id_hash);
CREATE INDEX IF NOT EXISTS local_sessions_user_idx ON local_sessions(user_id);

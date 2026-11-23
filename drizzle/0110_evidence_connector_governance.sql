CREATE TABLE IF NOT EXISTS evidence_source_signals (
  source_id TEXT NOT NULL, asset_id TEXT NOT NULL, signal TEXT NOT NULL,
  PRIMARY KEY(source_id,signal));

CREATE INDEX IF NOT EXISTS evidence_source_signals_asset ON evidence_source_signals(asset_id,signal);

CREATE TABLE IF NOT EXISTS evidence_rule_review_policy (rule_id TEXT PRIMARY KEY, reviewer TEXT NOT NULL);

CREATE TRIGGER IF NOT EXISTS evidence_source_signals_reset AFTER UPDATE ON evidence_automation_sources
  WHEN NEW.enabled<>OLD.enabled OR NEW.driver<>OLD.driver OR NEW.config_json<>OLD.config_json
    OR NEW.secret_ciphertext IS NOT OLD.secret_ciphertext OR NEW.last_test_status IS NOT 'success'
  BEGIN DELETE FROM evidence_source_signals WHERE source_id=OLD.id; END;

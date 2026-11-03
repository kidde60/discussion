CREATE TABLE group_transfer_logs (
  id             BIGSERIAL PRIMARY KEY,
  participant_id BIGINT      NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  class_id       BIGINT      NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  from_group_id  BIGINT      REFERENCES groups(id) ON DELETE RESTRICT,
  to_group_id    BIGINT      REFERENCES groups(id) ON DELETE RESTRICT,
  changed_by     BIGINT      REFERENCES users(id) ON DELETE RESTRICT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX group_transfer_logs_participant_idx ON group_transfer_logs (participant_id, changed_at DESC);
CREATE INDEX group_transfer_logs_class_idx ON group_transfer_logs (class_id, changed_at DESC);

CREATE TABLE activity_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      REFERENCES users(id) ON DELETE RESTRICT,
  action      TEXT        NOT NULL,
  entity_type TEXT        NOT NULL CHECK (entity_type IN ('USER', 'CLASS', 'GROUP', 'PARTICIPANT')),
  entity_id   BIGINT,
  description TEXT        NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_logs_created_idx ON activity_logs (created_at DESC);
CREATE INDEX activity_logs_entity_idx ON activity_logs (entity_type, entity_id);

CREATE OR REPLACE FUNCTION forbid_audit_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit records cannot be modified or deleted' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_logs_immutable
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_changes();

CREATE TRIGGER group_transfer_logs_immutable
  BEFORE UPDATE OR DELETE ON group_transfer_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_changes();

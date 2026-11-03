DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM participants) OR EXISTS (SELECT 1 FROM group_transfer_logs) THEN
    RAISE EXCEPTION 'Refusing to restructure participants: data already exists';
  END IF;
END $$;

ALTER TABLE groups DROP CONSTRAINT groups_leader_same_class;
DROP TABLE group_transfer_logs;
DROP TABLE participants CASCADE;

CREATE TABLE participants (
  id                  BIGSERIAL PRIMARY KEY,
  full_name           TEXT        NOT NULL,
  phone_number        TEXT        NOT NULL,
  registration_number TEXT        NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX participants_phone_idx ON participants (phone_number);

CREATE TABLE class_enrollments (
  id              BIGSERIAL PRIMARY KEY,
  participant_id  BIGINT      NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  class_id        BIGINT      NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  attendance_mode TEXT        NOT NULL CHECK (attendance_mode IN ('ONLINE', 'PHYSICAL')),
  group_id        BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT class_enrollments_participant_class_unique UNIQUE (participant_id, class_id),
  CONSTRAINT class_enrollments_id_class_unique UNIQUE (id, class_id),
  CONSTRAINT class_enrollments_group_same_class FOREIGN KEY (group_id, class_id) REFERENCES groups (id, class_id) ON DELETE RESTRICT
);

CREATE INDEX class_enrollments_group_idx ON class_enrollments (group_id);

ALTER TABLE groups
  ADD CONSTRAINT groups_leader_same_class FOREIGN KEY (group_leader_id, class_id) REFERENCES class_enrollments (id, class_id) ON DELETE RESTRICT;

CREATE TABLE group_transfer_logs (
  id            BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT      NOT NULL REFERENCES class_enrollments(id) ON DELETE RESTRICT,
  class_id      BIGINT      NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  from_group_id BIGINT      REFERENCES groups(id) ON DELETE RESTRICT,
  to_group_id   BIGINT      REFERENCES groups(id) ON DELETE RESTRICT,
  changed_by    BIGINT      REFERENCES users(id) ON DELETE RESTRICT,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX group_transfer_logs_enrollment_idx ON group_transfer_logs (enrollment_id, changed_at DESC);
CREATE INDEX group_transfer_logs_class_idx ON group_transfer_logs (class_id, changed_at DESC);

CREATE TRIGGER group_transfer_logs_immutable
  BEFORE UPDATE OR DELETE ON group_transfer_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_changes();

CREATE OR REPLACE FUNCTION enforce_group_capacity() RETURNS trigger AS $$
DECLARE
  g RECORD;
  used INTEGER;
BEGIN
  IF NEW.group_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NEW.attendance_mode IS NOT DISTINCT FROM OLD.attendance_mode THEN
    RETURN NEW;
  END IF;

  SELECT capacity, status, attendance_mode INTO g FROM groups WHERE id = NEW.group_id FOR UPDATE;
  IF g.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Group % is not active', NEW.group_id USING ERRCODE = 'check_violation';
  END IF;
  IF g.attendance_mode <> NEW.attendance_mode THEN
    RAISE EXCEPTION 'Group % is for % participants, not %', NEW.group_id, g.attendance_mode, NEW.attendance_mode USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO used FROM class_enrollments WHERE group_id = NEW.group_id AND id <> NEW.id;
  IF used >= g.capacity THEN
    RAISE EXCEPTION 'Group % is full (% of % places used)', NEW.group_id, used, g.capacity USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER class_enrollments_group_capacity
  BEFORE INSERT OR UPDATE OF group_id, attendance_mode ON class_enrollments
  FOR EACH ROW EXECUTE FUNCTION enforce_group_capacity();

CREATE OR REPLACE FUNCTION enforce_group_integrity() RETURNS trigger AS $$
DECLARE
  used INTEGER;
  mismatched INTEGER;
BEGIN
  SELECT count(*) INTO used FROM class_enrollments WHERE group_id = NEW.id;
  IF NEW.capacity < used THEN
    RAISE EXCEPTION 'Capacity % is below the % members already in group %', NEW.capacity, used, NEW.id USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO mismatched FROM class_enrollments WHERE group_id = NEW.id AND attendance_mode <> NEW.attendance_mode;
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'Group % has % participants whose attendance mode differs from the group''s %', NEW.id, mismatched, NEW.attendance_mode USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE groups
  ADD COLUMN attendance_mode TEXT NOT NULL CHECK (attendance_mode IN ('ONLINE', 'PHYSICAL'));

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

  SELECT count(*) INTO used FROM participants WHERE group_id = NEW.group_id AND id <> NEW.id;
  IF used >= g.capacity THEN
    RAISE EXCEPTION 'Group % is full (% of % places used)', NEW.group_id, used, g.capacity USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER groups_capacity_not_below_members ON groups;
DROP FUNCTION enforce_capacity_not_below_members();

CREATE OR REPLACE FUNCTION enforce_group_integrity() RETURNS trigger AS $$
DECLARE
  used INTEGER;
  mismatched INTEGER;
BEGIN
  SELECT count(*) INTO used FROM participants WHERE group_id = NEW.id;
  IF NEW.capacity < used THEN
    RAISE EXCEPTION 'Capacity % is below the % members already in group %', NEW.capacity, used, NEW.id USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO mismatched FROM participants WHERE group_id = NEW.id AND attendance_mode <> NEW.attendance_mode;
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'Group % has % participants whose attendance mode differs from the group''s %', NEW.id, mismatched, NEW.attendance_mode USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER groups_integrity
  BEFORE UPDATE OF capacity, attendance_mode ON groups
  FOR EACH ROW EXECUTE FUNCTION enforce_group_integrity();

DROP TRIGGER participants_group_capacity ON participants;

CREATE TRIGGER participants_group_capacity
  BEFORE INSERT OR UPDATE OF group_id, attendance_mode ON participants
  FOR EACH ROW EXECUTE FUNCTION enforce_group_capacity();

CREATE TABLE classes (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT        NOT NULL,
  class_code     TEXT        NOT NULL UNIQUE,
  description    TEXT,
  group_capacity INTEGER     NOT NULL DEFAULT 10 CHECK (group_capacity > 0),
  start_date     DATE        NOT NULL,
  end_date       DATE        CHECK (end_date IS NULL OR end_date >= start_date),
  status         TEXT        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by     BIGINT      REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id              BIGSERIAL PRIMARY KEY,
  class_id        BIGINT      NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  group_number    INTEGER     NOT NULL CHECK (group_number > 0),
  capacity        INTEGER     NOT NULL CHECK (capacity > 0),
  group_leader_id BIGINT,
  status          TEXT        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT groups_class_number_unique UNIQUE (class_id, group_number),
  CONSTRAINT groups_id_class_unique UNIQUE (id, class_id)
);

CREATE TABLE participants (
  id                  BIGSERIAL PRIMARY KEY,
  full_name           TEXT        NOT NULL,
  phone_number        TEXT        NOT NULL,
  registration_number TEXT        NOT NULL,
  attendance_mode     TEXT        NOT NULL CHECK (attendance_mode IN ('ONLINE', 'PHYSICAL')),
  class_id            BIGINT      NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  group_id            BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participants_class_registration_unique UNIQUE (class_id, registration_number),
  CONSTRAINT participants_id_class_unique UNIQUE (id, class_id),
  CONSTRAINT participants_group_same_class FOREIGN KEY (group_id, class_id) REFERENCES groups (id, class_id) ON DELETE RESTRICT
);

CREATE INDEX participants_phone_idx ON participants (phone_number);
CREATE INDEX participants_group_idx ON participants (group_id);

ALTER TABLE groups
  ADD CONSTRAINT groups_leader_same_class FOREIGN KEY (group_leader_id, class_id) REFERENCES participants (id, class_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION enforce_group_capacity() RETURNS trigger AS $$
DECLARE
  g RECORD;
  used INTEGER;
BEGIN
  IF NEW.group_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id THEN RETURN NEW; END IF;

  SELECT capacity, status INTO g FROM groups WHERE id = NEW.group_id FOR UPDATE;
  IF g.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Group % is not active', NEW.group_id USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO used FROM participants WHERE group_id = NEW.group_id AND id <> NEW.id;
  IF used >= g.capacity THEN
    RAISE EXCEPTION 'Group % is full (% of % places used)', NEW.group_id, used, g.capacity USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER participants_group_capacity
  BEFORE INSERT OR UPDATE OF group_id ON participants
  FOR EACH ROW EXECUTE FUNCTION enforce_group_capacity();

CREATE OR REPLACE FUNCTION enforce_capacity_not_below_members() RETURNS trigger AS $$
DECLARE
  used INTEGER;
BEGIN
  SELECT count(*) INTO used FROM participants WHERE group_id = NEW.id;
  IF NEW.capacity < used THEN
    RAISE EXCEPTION 'Capacity % is below the % members already in group %', NEW.capacity, used, NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER groups_capacity_not_below_members
  BEFORE UPDATE OF capacity ON groups
  FOR EACH ROW EXECUTE FUNCTION enforce_capacity_not_below_members();

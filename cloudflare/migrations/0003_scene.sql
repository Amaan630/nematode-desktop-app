-- Shared mode payloads are opaque JSON; future scenes need no new database column.
ALTER TABLE actions ADD COLUMN state TEXT;
CREATE TABLE IF NOT EXISTS releases (id INTEGER PRIMARY KEY CHECK (id = 1), version TEXT NOT NULL);

DROP INDEX IF EXISTS relationship;
CREATE INDEX relationship ON actions(pair, sequence DESC) WHERE action IN ('together','separate','scene');

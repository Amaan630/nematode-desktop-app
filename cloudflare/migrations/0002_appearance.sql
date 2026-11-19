-- Additive upgrade for existing databases; old rows retain their character and default to no accessories.
ALTER TABLE clients ADD COLUMN appearance TEXT;
ALTER TABLE actions ADD COLUMN appearance TEXT;

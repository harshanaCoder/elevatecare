-- Run this once against your EXISTING database to add the service_types
-- table that db/init.sql now creates automatically on a fresh one:
--   mysql -u root -p elevatecare_db < db/add_service_types_table.sql
--
-- Safe to run more than once — CREATE TABLE IF NOT EXISTS and INSERT IGNORE
-- won't touch anything that's already there.
--
-- Seeded with the types that used to be hardcoded into the Services
-- dropdowns, so upgrading doesn't lose the list currently in use.

CREATE TABLE IF NOT EXISTS service_types (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

INSERT IGNORE INTO service_types (name) VALUES
    ('Routine Monthly Service'), ('Quarterly Checkup'), ('Annual Full Inspection'),
    ('Oil & Lubrication'), ('Rope & Governor Check');

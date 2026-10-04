-- Run this once against your EXISTING database to add the breakdown_types
-- table that db/init.sql now creates automatically on a fresh one:
--   mysql -u root -p elevatecare_db < db/add_breakdown_types_table.sql
--
-- Safe to run more than once — CREATE TABLE IF NOT EXISTS and INSERT IGNORE
-- won't touch anything that's already there.
--
-- Seeded with the categories that used to be hardcoded into the Breakdowns/
-- Pending/Reports dropdowns, so upgrading doesn't lose the list in use.

CREATE TABLE IF NOT EXISTS breakdown_types (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

INSERT IGNORE INTO breakdown_types (name) VALUES
    ('Door System Failure'), ('Minor Breakdown'), ('Electrical / Control Failure'),
    ('Mechanical Failure'), ('Power Failure'), ('Communication Failure'),
    ('Safety Error'), ('Major Breakdown'), ('Passenger Entrapment');

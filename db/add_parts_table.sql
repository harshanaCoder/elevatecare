-- Run this once against your EXISTING database to add the parts table that
-- db/init.sql now creates automatically on a fresh one:
--   mysql -u root -p elevatecare_db < db/add_parts_table.sql
--
-- Safe to run more than once — CREATE TABLE/INDEX use IF NOT EXISTS, and
-- MySQL will just error with "Duplicate key name" on the indexes if this is
-- re-run after they already exist, which is harmless.

CREATE TABLE IF NOT EXISTS parts (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    part_name            VARCHAR(255) NOT NULL,
    part_code            VARCHAR(50),
    equipment_type       VARCHAR(50) NOT NULL,
    sub_type             VARCHAR(50),
    discipline           VARCHAR(50) NOT NULL,
    location             VARCHAR(50),
    quantity             INT NOT NULL DEFAULT 0,
    low_stock_threshold  INT NOT NULL DEFAULT 5,
    notes                TEXT,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parts_equipment_type ON parts (equipment_type);
CREATE INDEX idx_parts_discipline     ON parts (discipline);

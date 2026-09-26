-- Run this once against your EXISTING local database to add the technicians
-- table that db/init.sql now creates automatically on a fresh one:
--   mysql -u root -p elevatecare_db < db/add_technicians_table.sql
--
-- Safe to run more than once — CREATE TABLE IF NOT EXISTS won't touch an
-- existing table, and MySQL will just error with "Duplicate key name" on the
-- index if it's already there.

CREATE TABLE IF NOT EXISTS technicians (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    tech_code            VARCHAR(50),
    name                 VARCHAR(255),
    skills               VARCHAR(255),
    status               VARCHAR(50) DEFAULT 'Available',
    current_assignment   VARCHAR(255)
);

CREATE INDEX idx_technicians_status ON technicians (status);

-- Run this once against your EXISTING database to add the technician_names
-- table that db/init.sql now creates automatically on a fresh one:
--   mysql -u root -p elevatecare_db < db/add_technician_names_table.sql
--
-- Safe to run more than once — CREATE TABLE IF NOT EXISTS and INSERT IGNORE
-- won't touch anything that's already there.
--
-- Seeded with the names that used to be hardcoded into the Breakdowns/Services
-- checkboxes, so upgrading doesn't lose the list currently in use.

CREATE TABLE IF NOT EXISTS technician_names (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

INSERT IGNORE INTO technician_names (name) VALUES
    ('Rifki'), ('Dias'), ('Tharusha'), ('Pathum'), ('Kamal'), ('Tharuka'),
    ('Sadeepa'), ('Adhikari'), ('Minhaj'), ('Shehan'), ('Amos'), ('Ashen'),
    ('Tharindu'), ('Wijerathne'), ('Sampath'), ('Somasiri'), ('Dc'),
    ('Botheju'), ('Deshan'), ('Sachintha'), ('Janith');

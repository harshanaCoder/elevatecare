-- Run this once against your EXISTING database to remove the technicians
-- table now that the Technician Management feature has been removed:
--   mysql -u root -p elevatecare_db < db/drop_technicians_table.sql
--
-- Safe to run more than once — DROP TABLE IF EXISTS is a no-op if it's
-- already gone. This permanently deletes any technician roster data.

DROP TABLE IF EXISTS technicians;

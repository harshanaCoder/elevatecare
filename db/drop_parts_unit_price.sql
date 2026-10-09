-- Run this once against your EXISTING database if you already applied
-- db/add_parts_table.sql before unit_price was removed from the parts
-- feature:
--   mysql -u root -p elevatecare_db < db/drop_parts_unit_price.sql
--
-- Safe to run only once — MySQL will error with "check that column/key
-- exists" if the column is already gone. Harmless; just means this was
-- already applied (e.g. on a fresh install via the current db/init.sql,
-- which never creates this column in the first place).

ALTER TABLE parts DROP COLUMN unit_price;

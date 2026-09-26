-- Run this once against your EXISTING local database to add the same
-- indexes that db/init.sql now creates automatically on a fresh one:
--   mysql -u root -p elevatecare_db < db/add_indexes.sql
--
-- Safe to run once. If you ever run it twice, MySQL will just error with
-- "Duplicate key name" on each index that already exists — harmless, no data
-- is touched either way.

CREATE INDEX idx_breakdowns_unit_no       ON breakdowns (unit_no);
CREATE INDEX idx_breakdowns_informed_date ON breakdowns (informed_date);
CREATE INDEX idx_breakdowns_job_status    ON breakdowns (job_status);

CREATE INDEX idx_services_unit_no      ON services (unit_no);
CREATE INDEX idx_services_service_date ON services (service_date);
CREATE INDEX idx_services_status       ON services (status);

CREATE INDEX idx_pending_created_at ON pending_breakdowns (created_at);

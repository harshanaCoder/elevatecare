-- Adds the actual completion date to services. Until now the history showed
-- service_date (the SCHEDULED date) under a "Completed Date" heading.
-- Existing completed rows are backfilled with their scheduled date, the best
-- information available for them.
ALTER TABLE services ADD COLUMN completed_date DATE NULL AFTER service_date;

UPDATE services SET completed_date = service_date WHERE status = 'Completed' AND completed_date IS NULL;

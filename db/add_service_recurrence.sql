-- Recurring services: when a service with recurrence_months set is completed,
-- the next one is scheduled automatically that many months after the
-- completion date. NULL = one-off.
ALTER TABLE services ADD COLUMN recurrence_months INT NULL AFTER notes;

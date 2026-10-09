-- Run this once against your EXISTING database to add stock-movement
-- tracking and the reorder workflow:
--   mysql -u root -p elevatecare_db < db/add_part_transactions_and_reorder.sql
--
-- Only safe to run ONCE — unlike this project's other add_*.sql files, the
-- two ALTER TABLE ADD COLUMN lines below will error with "Duplicate column
-- name" on a second run (this MySQL version doesn't support ADD COLUMN IF
-- NOT EXISTS). That error is harmless and just means this was already
-- applied; the CREATE TABLE/INDEX lines after it are still fine to re-run.
--
-- IMPORTANT: any part that already has a quantity > 0 (entered before this
-- migration, when quantity was directly editable) has no transaction history
-- backing that number. This migration seeds one "Opening balance" IN
-- transaction per existing part so the running total stays accurate and the
-- audit trail starts from a known point, instead of looking like stock that
-- came from nowhere.

ALTER TABLE parts ADD COLUMN reorder_status VARCHAR(20);
ALTER TABLE parts ADD COLUMN reorder_expected_date DATE;

CREATE TABLE IF NOT EXISTS part_transactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    part_id         INT NOT NULL,
    type            VARCHAR(10) NOT NULL,
    quantity        INT NOT NULL,
    reason          VARCHAR(255),
    reference_type  VARCHAR(50),
    reference_id    INT,
    created_by      VARCHAR(100),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_part_transactions_part_id ON part_transactions (part_id);
CREATE INDEX idx_part_transactions_ref     ON part_transactions (reference_type, reference_id);

INSERT INTO part_transactions (part_id, type, quantity, reason, created_at)
SELECT id, 'IN', quantity, 'Opening balance (migrated)', NOW()
FROM parts
WHERE quantity > 0
  AND id NOT IN (SELECT DISTINCT part_id FROM part_transactions);

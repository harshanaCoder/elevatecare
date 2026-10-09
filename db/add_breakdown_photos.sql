-- Photos sent with a mobile-app breakdown submission. A photo belongs to a
-- pending submission until it is approved (then it moves to the breakdown it
-- created) — same loose id-reference style as the rest of this app, no FKs.
-- Files themselves live in the uploads directory (UPLOAD_DIR), not the DB.
CREATE TABLE IF NOT EXISTS breakdown_photos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    pending_id    INT NULL,
    breakdown_id  INT NULL,
    filename      VARCHAR(100) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_breakdown_photos_pending   ON breakdown_photos (pending_id);
CREATE INDEX idx_breakdown_photos_breakdown ON breakdown_photos (breakdown_id);

-- The mobile app can pick a category up front; the reviewer can still change it.
ALTER TABLE pending_breakdowns ADD COLUMN category VARCHAR(100) NULL AFTER job_status;

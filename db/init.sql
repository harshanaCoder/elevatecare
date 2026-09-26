-- Runs automatically ONLY the first time the `db` Docker volume is created
-- (MySQL's docker-entrypoint-initdb.d mechanism). It never touches your
-- existing local MySQL install — this is purely for a fresh container.
--
-- ⚠️ Reconstructed from the columns src/routes/*.js actually queries — there
-- was no schema file anywhere in the repo. If your real local database has
-- different column types/lengths/indexes, replace this with a dump of the
-- real schema before relying on it:
--   mysqldump -u root -p --no-data elevatecare_db > db/init.sql

CREATE TABLE IF NOT EXISTS breakdowns (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    informed_date        DATE,
    informed_time        TIME,
    informed_by          VARCHAR(255),
    unit_no              VARCHAR(50),
    category             VARCHAR(100),
    nature_of_breakdown  TEXT,
    attended_date        DATE,
    attended_time        TIME,
    attended_by          VARCHAR(255),
    job_status           VARCHAR(50) DEFAULT 'Pending',
    actions_taken        TEXT
);

CREATE TABLE IF NOT EXISTS services (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    unit_no        VARCHAR(50),
    service_date   DATE,
    service_type   VARCHAR(100),
    technicians    VARCHAR(255),
    notes          TEXT,
    status         VARCHAR(50) DEFAULT 'Scheduled'
);

CREATE TABLE IF NOT EXISTS unit_specifications (
    unit_no          VARCHAR(50) PRIMARY KEY,
    motor_details    VARCHAR(255),
    controller_type  VARCHAR(255),
    eld_type         VARCHAR(255),
    eld_battery      VARCHAR(255),
    u_angle_sin      VARCHAR(50),
    u_angle_cos      VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS technicians (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    tech_code            VARCHAR(50),
    name                 VARCHAR(255),
    skills               VARCHAR(255),
    status               VARCHAR(50) DEFAULT 'Available',
    current_assignment   VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS pending_breakdowns (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    unit_no              VARCHAR(50),
    job_status           VARCHAR(50),
    informed_by          VARCHAR(255),
    informed_date        DATE,
    informed_time        TIME,
    attended_by          VARCHAR(255),
    attended_date        DATE,
    attended_time        TIME,
    nature_of_breakdown  TEXT,
    actions_taken        TEXT,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Every one of these columns is filtered or sorted on by src/routes/*.js on
-- every page load (unit lookups, date-range reports, status filters) — at
-- this app's current size a table scan wouldn't be noticeable yet, but there's
-- no reason to skip indexes that cost nothing and prevent it becoming an issue.
CREATE INDEX idx_breakdowns_unit_no       ON breakdowns (unit_no);
CREATE INDEX idx_breakdowns_informed_date ON breakdowns (informed_date);
CREATE INDEX idx_breakdowns_job_status    ON breakdowns (job_status);

CREATE INDEX idx_services_unit_no      ON services (unit_no);
CREATE INDEX idx_services_service_date ON services (service_date);
CREATE INDEX idx_services_status       ON services (status);

CREATE INDEX idx_pending_created_at ON pending_breakdowns (created_at);

CREATE INDEX idx_technicians_status ON technicians (status);

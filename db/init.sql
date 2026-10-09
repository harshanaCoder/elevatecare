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
    completed_date DATE NULL,
    service_type   VARCHAR(100),
    technicians    VARCHAR(255),
    notes          TEXT,
    recurrence_months INT NULL,
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

-- Simple shared name list (managed from Settings) used to populate the
-- "attended by" / "assign technician(s)" checkboxes on Breakdowns and
-- Services. Not a full technician roster — just names.
CREATE TABLE IF NOT EXISTS technician_names (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

-- Seeded with the names that used to be hardcoded into the Breakdowns/Services
-- checkboxes, so a fresh install starts with the same list already in use.
INSERT IGNORE INTO technician_names (name) VALUES
    ('Rifki'), ('Dias'), ('Tharusha'), ('Pathum'), ('Kamal'), ('Tharuka'),
    ('Sadeepa'), ('Adhikari'), ('Minhaj'), ('Shehan'), ('Amos'), ('Ashen'),
    ('Tharindu'), ('Wijerathne'), ('Sampath'), ('Somasiri'), ('Dc'),
    ('Botheju'), ('Deshan'), ('Sachintha'), ('Janith');

-- Shared name list (managed from Settings) for the "Breakdown Category"
-- dropdown on Breakdowns, Pending and Reports.
CREATE TABLE IF NOT EXISTS breakdown_types (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

INSERT IGNORE INTO breakdown_types (name) VALUES
    ('Door System Failure'), ('Minor Breakdown'), ('Electrical / Control Failure'),
    ('Mechanical Failure'), ('Power Failure'), ('Communication Failure'),
    ('Safety Error'), ('Major Breakdown'), ('Passenger Entrapment');

-- Shared name list (managed from Settings) for the "Service Type" dropdown
-- on Services.
CREATE TABLE IF NOT EXISTS service_types (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

INSERT IGNORE INTO service_types (name) VALUES
    ('Routine Monthly Service'), ('Quarterly Checkup'), ('Annual Full Inspection'),
    ('Oil & Lubrication'), ('Rope & Governor Check');

-- Spare parts inventory. equipment_type/sub_type/discipline/location follow
-- a fixed taxonomy (Elevator > WB|SUVF > Electrical|Mechanical > Machine
-- Room|Car|Shaft, or Escalator > Electrical|Mechanical with no sub_type/
-- location) — enforced client-side via cascading selects in parts.html, not
-- as DB foreign keys, consistent with how unit_no/category work elsewhere
-- in this app. Stock status (In Stock/Low Stock/Out of Stock) is derived
-- from quantity vs low_stock_threshold, not stored, so it can't drift out
-- of sync with the quantity. `quantity` itself is a running total kept in
-- sync with part_transactions below — it is never written directly by an
-- edit form, only by a stock-in/stock-out transaction, so there's always an
-- audit trail for why it changed. reorder_status/reorder_expected_date back
-- a lightweight "mark as ordered" workflow off the Low Stock alert.
CREATE TABLE IF NOT EXISTS parts (
    id                     INT AUTO_INCREMENT PRIMARY KEY,
    part_name              VARCHAR(255) NOT NULL,
    part_code              VARCHAR(50),
    equipment_type         VARCHAR(50) NOT NULL,
    sub_type               VARCHAR(50),
    discipline             VARCHAR(50) NOT NULL,
    location               VARCHAR(50),
    quantity               INT NOT NULL DEFAULT 0,
    low_stock_threshold    INT NOT NULL DEFAULT 5,
    reorder_status         VARCHAR(20),
    reorder_expected_date  DATE,
    notes                  TEXT,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Append-only stock movement log — the only thing allowed to change
-- parts.quantity (see comment above). reference_type/reference_id loosely
-- point at the breakdown a part was used on, same no-FK string/id style as
-- unit_no elsewhere in this app rather than a real foreign key.
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

-- Master list of lifts/escalators (see db/add_units_table.sql).
CREATE TABLE IF NOT EXISTS units (
    unit_no    VARCHAR(50) PRIMARY KEY,
    building   VARCHAR(20) NOT NULL,
    lift_type  VARCHAR(10) NOT NULL
);

INSERT IGNORE INTO units (unit_no, building, lift_type) VALUES
    ('PL 1.01', 'BD_01', 'PL'),
    ('PL 1.02', 'BD_01', 'PL'),
    ('PL 1.03', 'BD_01', 'PL'),
    ('PL 1.04', 'BD_01', 'PL'),
    ('PL 1.05', 'BD_01', 'PL'),
    ('PL 1.06', 'BD_01', 'PL'),
    ('PL 1.07', 'BD_01', 'PL'),
    ('PL 1.08', 'BD_01', 'PL'),
    ('SL 1.01', 'BD_01', 'SL'),
    ('SL 1.02', 'BD_01', 'SL'),
    ('ES 1.03a', 'BD_01', 'ES'),
    ('ES 1.03b', 'BD_01', 'ES'),
    ('ES 1.04a', 'BD_01', 'ES'),
    ('ES 1.04b', 'BD_01', 'ES'),
    ('PL 2.03', 'BD_02', 'PL'),
    ('PL 2.04', 'BD_02', 'PL'),
    ('PL 2.06', 'BD_02', 'PL'),
    ('PL 2.07', 'BD_02', 'PL'),
    ('PL 2.08', 'BD_02', 'PL'),
    ('PL 2.09', 'BD_02', 'PL'),
    ('PL 2.10', 'BD_02', 'PL'),
    ('PL 2.11', 'BD_02', 'PL'),
    ('PL 2.12', 'BD_02', 'PL'),
    ('PL 2.13', 'BD_02', 'PL'),
    ('PL 2.14', 'BD_02', 'PL'),
    ('PL 2.15', 'BD_02', 'PL'),
    ('PL 2.16', 'BD_02', 'PL'),
    ('PL 2.17', 'BD_02', 'PL'),
    ('PL 2.18', 'BD_02', 'PL'),
    ('PL 2.19', 'BD_02', 'PL'),
    ('PL 2.20', 'BD_02', 'PL'),
    ('PL 2.21', 'BD_02', 'PL'),
    ('PL 2.24', 'BD_02', 'PL'),
    ('PL 2.25', 'BD_02', 'PL'),
    ('PL 2.28', 'BD_02', 'PL'),
    ('PL 2.32', 'BD_02', 'PL'),
    ('PL 2.33', 'BD_02', 'PL'),
    ('PL 2.34', 'BD_02', 'PL'),
    ('PL 2.35', 'BD_02', 'PL'),
    ('PL 2.36', 'BD_02', 'PL'),
    ('SL 2.01', 'BD_02', 'SL'),
    ('SL 2.02', 'BD_02', 'SL'),
    ('SL 2.03', 'BD_02', 'SL'),
    ('SL 2.07', 'BD_02', 'SL'),
    ('SL 2.08', 'BD_02', 'SL'),
    ('SL 2.09', 'BD_02', 'SL'),
    ('FSL 2.01', 'BD_02', 'FSL'),
    ('FSL 2.02', 'BD_02', 'FSL'),
    ('FSL 2.03', 'BD_02', 'FSL'),
    ('FSL 2.04', 'BD_02', 'FSL'),
    ('FSL 2.05', 'BD_02', 'FSL'),
    ('FSL 2.06', 'BD_02', 'FSL'),
    ('FSL 2.07', 'BD_02', 'FSL'),
    ('FSL 2.08', 'BD_02', 'FSL'),
    ('ES 2.01a', 'BD_02', 'ES'),
    ('ES 2.01b', 'BD_02', 'ES'),
    ('ES 2.02', 'BD_02', 'ES'),
    ('ES 2.03a', 'BD_02', 'ES'),
    ('ES 2.03b', 'BD_02', 'ES'),
    ('ES 2.04a', 'BD_02', 'ES'),
    ('ES 2.04b', 'BD_02', 'ES'),
    ('ES 2.06a', 'BD_02', 'ES'),
    ('ES 2.06b', 'BD_02', 'ES'),
    ('ES 2.07a', 'BD_02', 'ES'),
    ('ES 2.07b', 'BD_02', 'ES'),
    ('ES 01', 'BD_02', 'ES'),
    ('ES 02', 'BD_02', 'ES'),
    ('PL 3.01', 'BD_03', 'PL'),
    ('PL 3.02', 'BD_03', 'PL'),
    ('PL 3.03', 'BD_03', 'PL'),
    ('PL 3.04', 'BD_03', 'PL'),
    ('FSL 3.01', 'BD_03', 'FSL'),
    ('FSL 3.02', 'BD_03', 'FSL'),
    ('FSL 3.03', 'BD_03', 'FSL'),
    ('FSL 3.04', 'BD_03', 'FSL'),
    ('FSL 3.05', 'BD_03', 'FSL'),
    ('FSL 3.06', 'BD_03', 'FSL'),
    ('ES 3.01a', 'BD_03', 'ES'),
    ('ES 3.01b', 'BD_03', 'ES'),
    ('ES 3.02a', 'BD_03', 'ES'),
    ('ES 3.02b', 'BD_03', 'ES'),
    ('ES 3.03a', 'BD_03', 'ES'),
    ('ES 3.03b', 'BD_03', 'ES');

CREATE TABLE IF NOT EXISTS pending_breakdowns (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    unit_no              VARCHAR(50),
    job_status           VARCHAR(50),
    category             VARCHAR(100) NULL,
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

-- Photos sent with a mobile-app breakdown submission (see db/add_breakdown_photos.sql).
CREATE TABLE IF NOT EXISTS breakdown_photos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    pending_id    INT NULL,
    breakdown_id  INT NULL,
    filename      VARCHAR(100) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_breakdown_photos_pending   ON breakdown_photos (pending_id);
CREATE INDEX idx_breakdown_photos_breakdown ON breakdown_photos (breakdown_id);

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

CREATE INDEX idx_parts_equipment_type ON parts (equipment_type);
CREATE INDEX idx_parts_discipline     ON parts (discipline);

CREATE INDEX idx_part_transactions_part_id ON part_transactions (part_id);
CREATE INDEX idx_part_transactions_ref     ON part_transactions (reference_type, reference_id);

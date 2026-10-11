const express = require('express');
const db = require('../config/db');
const { applyStockTransaction } = require('../config/partStock');

const router = express.Router();

// 0 is a legitimate threshold ("only warn me when it's gone"), so only fall
// back to the default when the value is blank/invalid — not when it's 0.
function thresholdFrom(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 ? n : 5;
}

// Part codes are meant to be unique-ish but the column has no UNIQUE constraint
// (existing data may already repeat), so duplicates are rejected here instead.
function partCodeTaken(connection, code, excludeId, callback) {
    if (!code) return callback(null, false);
    connection.query('SELECT id FROM parts WHERE part_code = ? AND id <> ? LIMIT 1', [code, excludeId || 0], (err, rows) => {
        callback(err, !err && rows.length > 0);
    });
}

// ==========================================
// 🔧 SPARE PARTS INVENTORY API ROUTES
// Stock status (In Stock/Low Stock/Out of Stock) is derived client-side from
// quantity vs low_stock_threshold — not stored, so it can't drift out of sync.
// `quantity` itself only ever changes via a part_transactions row (see
// src/config/partStock.js) — add/edit never write it directly, so there's
// always an audit trail for why stock moved.
// ==========================================

router.get('/parts', (req, res) => {
    db.query('SELECT * FROM parts ORDER BY part_name ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.get('/parts/:id/transactions', (req, res) => {
    db.query('SELECT * FROM part_transactions WHERE part_id = ? ORDER BY created_at DESC', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Creates a part; if initial_quantity > 0, records the matching opening
// stock-in transaction in the same DB transaction so quantity and its
// audit trail are never out of step, even on the very first write.
router.post('/parts', (req, res) => {
    const {
        part_name, part_code, equipment_type, sub_type, discipline, location,
        initial_quantity, low_stock_threshold, notes
    } = req.body;

    if (!part_name || !equipment_type || !discipline) {
        return res.status(400).json({ error: 'Part Name, Equipment Type and Discipline are required.' });
    }

    const startQty = parseInt(initial_quantity, 10) || 0;
    if (startQty < 0) return res.status(400).json({ error: 'Initial Quantity cannot be negative.' });
    const username = (req.session && req.session.username) || null;

    partCodeTaken(db, part_code, null, (dupErr, taken) => {
      if (dupErr) return res.status(500).json({ error: dupErr.message });
      if (taken) return res.status(409).json({ error: `Part code "${part_code}" already exists.` });

    db.getConnection((connErr, connection) => {
        if (connErr) return res.status(500).json({ error: connErr.message });

        connection.beginTransaction((txErr) => {
            if (txErr) { connection.release(); return res.status(500).json({ error: txErr.message }); }

            const sql = `INSERT INTO parts
                (part_name, part_code, equipment_type, sub_type, discipline, location, quantity, low_stock_threshold, notes)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`;
            connection.query(sql, [
                part_name, part_code || null, equipment_type, sub_type || null, discipline, location || null,
                thresholdFrom(low_stock_threshold), notes || null
            ], (insErr, result) => {
                if (insErr) return connection.rollback(() => { connection.release(); res.status(500).json({ error: insErr.message }); });

                if (startQty <= 0) {
                    return connection.commit((commitErr) => {
                        connection.release();
                        if (commitErr) return res.status(500).json({ error: commitErr.message });
                        res.status(201).json({ message: '✅ Part added successfully!' });
                    });
                }

                applyStockTransaction(connection, {
                    part_id: result.insertId, type: 'IN', quantity: startQty,
                    reason: 'Initial stock', reference_type: 'manual', created_by: username
                }, (stockErr) => {
                    if (stockErr) return connection.rollback(() => { connection.release(); res.status(500).json({ error: stockErr.message }); });

                    connection.commit((commitErr) => {
                        connection.release();
                        if (commitErr) return res.status(500).json({ error: commitErr.message });
                        res.status(201).json({ message: '✅ Part added successfully!' });
                    });
                });
            });
        });
    });
    });
});

// Bulk CSV import — same create-plus-opening-stock logic as POST /parts,
// just looped. Each row succeeds or fails independently so one bad row
// doesn't block the rest of the file.
router.post('/parts/import', (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No rows to import.' });
    if (rows.length > 1000) return res.status(400).json({ error: 'Too many rows — import at most 1000 parts per file.' });

    const username = (req.session && req.session.username) || null;
    const results = { imported: 0, failed: [] };

    function importNext(i) {
        if (i >= rows.length) return res.json({ message: `✅ Imported ${results.imported} of ${rows.length} rows.`, ...results });

        const row = rows[i];
        if (!row.part_name || !row.equipment_type || !row.discipline) {
            results.failed.push({ row: i + 1, error: 'Missing Part Name, Equipment Type or Discipline.' });
            return importNext(i + 1);
        }

        const startQty = parseInt(row.initial_quantity, 10) || 0;
        if (startQty < 0) {
            results.failed.push({ row: i + 1, error: 'Initial Quantity cannot be negative.' });
            return importNext(i + 1);
        }

        partCodeTaken(db, row.part_code, null, (dupErr, taken) => {
        if (dupErr || taken) {
            results.failed.push({ row: i + 1, error: dupErr ? dupErr.message : `Part code "${row.part_code}" already exists.` });
            return importNext(i + 1);
        }

        db.getConnection((connErr, connection) => {
            if (connErr) { results.failed.push({ row: i + 1, error: connErr.message }); return importNext(i + 1); }

            connection.beginTransaction((txErr) => {
                if (txErr) { connection.release(); results.failed.push({ row: i + 1, error: txErr.message }); return importNext(i + 1); }

                const sql = `INSERT INTO parts
                    (part_name, part_code, equipment_type, sub_type, discipline, location, quantity, low_stock_threshold, notes)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`;
                connection.query(sql, [
                    row.part_name, row.part_code || null, row.equipment_type, row.sub_type || null, row.discipline,
                    row.location || null, thresholdFrom(row.low_stock_threshold), row.notes || null
                ], (insErr, result) => {
                    if (insErr) {
                        return connection.rollback(() => {
                            connection.release();
                            results.failed.push({ row: i + 1, error: insErr.message });
                            importNext(i + 1);
                        });
                    }

                    const finish = () => connection.commit((commitErr) => {
                        connection.release();
                        if (commitErr) { results.failed.push({ row: i + 1, error: commitErr.message }); return importNext(i + 1); }
                        results.imported++;
                        importNext(i + 1);
                    });

                    if (startQty <= 0) return finish();

                    applyStockTransaction(connection, {
                        part_id: result.insertId, type: 'IN', quantity: startQty,
                        reason: 'Initial stock (CSV import)', reference_type: 'manual', created_by: username
                    }, (stockErr) => {
                        if (stockErr) {
                            return connection.rollback(() => {
                                connection.release();
                                results.failed.push({ row: i + 1, error: stockErr.message });
                                importNext(i + 1);
                            });
                        }
                        finish();
                    });
                });
            });
        });
        });
    }

    importNext(0);
});

// Core-field edit only — quantity is deliberately not accepted here, it only
// moves via POST /parts/:id/transactions (Stock In/Out) or the import path.
router.patch('/parts/:id', (req, res) => {
    const {
        part_name, part_code, equipment_type, sub_type, discipline, location,
        low_stock_threshold, notes
    } = req.body;

    if (!part_name || !equipment_type || !discipline) {
        return res.status(400).json({ error: 'Part Name, Equipment Type and Discipline are required.' });
    }

    const sql = `UPDATE parts SET
        part_name = ?, part_code = ?, equipment_type = ?, sub_type = ?, discipline = ?, location = ?,
        low_stock_threshold = ?, notes = ?
        WHERE id = ?`;
    partCodeTaken(db, part_code, req.params.id, (dupErr, taken) => {
    if (dupErr) return res.status(500).json({ error: dupErr.message });
    if (taken) return res.status(409).json({ error: `Part code "${part_code}" already exists.` });
    db.query(sql, [
        part_name, part_code || null, equipment_type, sub_type || null, discipline, location || null,
        thresholdFrom(low_stock_threshold), notes || null, req.params.id
    ], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Part updated successfully!' });
    });
    });
});

// Manual Stock In / Stock Out — the only other way (besides creation and
// import) that quantity is allowed to change.
router.post('/parts/:id/transactions', (req, res) => {
    const { type, quantity, reason } = req.body;
    const username = (req.session && req.session.username) || null;

    db.getConnection((connErr, connection) => {
        if (connErr) return res.status(500).json({ error: connErr.message });

        connection.beginTransaction((txErr) => {
            if (txErr) { connection.release(); return res.status(500).json({ error: txErr.message }); }

            applyStockTransaction(connection, {
                part_id: req.params.id, type, quantity: parseInt(quantity, 10),
                reason, reference_type: 'manual', created_by: username
            }, (stockErr, result) => {
                if (stockErr) return connection.rollback(() => { connection.release(); res.status(400).json({ error: stockErr.message }); });

                connection.commit((commitErr) => {
                    connection.release();
                    if (commitErr) return res.status(500).json({ error: commitErr.message });
                    res.json({ message: type === 'IN' ? '✅ Stock received!' : '✅ Stock removed!', quantity: result.quantity });
                });
            });
        });
    });
});

// Mark as Ordered / clear a reorder — the Low Stock "reorder" workflow.
// Receiving the order itself happens via the normal Stock In action, which
// already clears these fields automatically (see partStock.js).
router.patch('/parts/:id/reorder', (req, res) => {
    const { reorder_status, reorder_expected_date } = req.body;
    db.query(
        'UPDATE parts SET reorder_status = ?, reorder_expected_date = ? WHERE id = ?',
        [reorder_status || null, reorder_expected_date || null, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: reorder_status ? '✅ Marked as ordered!' : '✅ Order cleared.' });
        }
    );
});

// Parts consumption report: how much of each part was used on breakdowns and
// services in a date range (net of returns — a deleted/edited record that gave
// parts back counts as not used). Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD.
router.get('/parts-usage', (req, res) => {
    const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if ((req.query.from && !isDate(req.query.from)) || (req.query.to && !isDate(req.query.to))) {
        return res.status(400).json({ error: 'from and to must be dates (YYYY-MM-DD).' });
    }
    const from = req.query.from || '1970-01-01';
    const to = req.query.to || '9999-12-31';
    const sql = `SELECT p.id AS part_id, p.part_name, p.part_code, p.quantity AS in_stock,
            CAST(SUM(CASE WHEN pt.reference_type = 'breakdown' THEN IF(pt.type = 'OUT', pt.quantity, -pt.quantity) ELSE 0 END) AS SIGNED) AS used_breakdowns,
            CAST(SUM(CASE WHEN pt.reference_type = 'service' THEN IF(pt.type = 'OUT', pt.quantity, -pt.quantity) ELSE 0 END) AS SIGNED) AS used_services
        FROM part_transactions pt
        JOIN parts p ON p.id = pt.part_id
        WHERE pt.reference_type IN ('breakdown', 'service') AND DATE(pt.created_at) BETWEEN ? AND ?
        GROUP BY p.id, p.part_name, p.part_code, p.quantity
        HAVING used_breakdowns + used_services > 0
        ORDER BY used_breakdowns + used_services DESC, p.part_name ASC`;
    db.query(sql, [from, to], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// A part that has been used or removed from stock can't be deleted: its history
// (and the "parts used" lists on old breakdowns/services) would silently lose
// entries. A part that only ever had opening/received stock can still go.
router.delete('/parts/:id', (req, res) => {
    db.query(
        "SELECT COUNT(*) AS n FROM part_transactions WHERE part_id = ? AND (type = 'OUT' OR reference_type IN ('breakdown', 'service'))",
        [req.params.id],
        (cntErr, rows) => {
            if (cntErr) return res.status(500).json({ error: cntErr.message });
            if (rows[0].n > 0) {
                return res.status(409).json({ error: "This part has been used or removed from stock, so it can't be deleted." });
            }
            db.query('DELETE FROM part_transactions WHERE part_id = ?', [req.params.id], (txErr) => {
                if (txErr) return res.status(500).json({ error: txErr.message });
                db.query('DELETE FROM parts WHERE id = ?', [req.params.id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: '✅ Part deleted successfully!' });
                });
            });
        }
    );
});

module.exports = router;

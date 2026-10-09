const express = require('express');
const db = require('../config/db');
const { syncReferenceParts } = require('../config/partStock');
const { withTransaction, statusFor } = require('../config/withTransaction');

const { requireKnownUnit } = require('./units.routes');
const { deletePhotoFiles } = require('../config/photos');

const router = express.Router();

// ==========================================
// 🚨 BREAKDOWNS API ROUTES
// ==========================================
// NOTE: don't `return db.query(...)` from a route handler — in Express 5,
// returning mysql2's Query object (which exposes a `.then` for unrelated
// internal reasons, but isn't a real Promise) makes Express try to await it,
// which throws and crashes the process after the real response has been sent.
//
// parts_used: [{part_id, quantity}] is the FULL list of parts that should be
// on record for the breakdown. POST/PATCH reconcile stock against what's
// already recorded (src/config/partStock.js syncReferenceParts), so re-saving
// an edit never deducts twice, and DELETE returns everything to stock — all in
// the same DB transaction as the breakdown write itself.
function usedPartsFrom(body) {
    return Array.isArray(body.parts_used) ? body.parts_used.filter(p => p && p.part_id && p.quantity > 0) : null;
}

router.post('/breakdowns', requireKnownUnit, (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;
    const usedParts = usedPartsFrom(req.body);
    const username = (req.session && req.session.username) || null;

    const sql = `INSERT INTO breakdowns (informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const sqlParams = [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken];

    if (!usedParts || usedParts.length === 0) {
        db.query(sql, sqlParams, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: '✅ Breakdown saved successfully!' });
        });
        return;
    }

    withTransaction((connection, done) => {
        connection.query(sql, sqlParams, (insErr, result) => {
            if (insErr) return done(insErr);
            syncReferenceParts(connection, {
                reference_type: 'breakdown', reference_id: result.insertId, desired: usedParts,
                label: `breakdown #${result.insertId} (${unit_no})`, created_by: username
            }, done);
        });
    }, (err) => {
        if (err) return res.status(statusFor(err)).json({ error: err.message });
        res.json({ message: '✅ Breakdown saved successfully!' });
    });
});

// Parts currently on record for this breakdown — net of any returns, joined
// with parts for the display name, since part_transactions only stores part_id.
router.get('/breakdowns/:id/parts-used', (req, res) => {
    const sql = `SELECT pt.part_id, p.part_name, p.part_code,
            SUM(CASE WHEN pt.type = 'OUT' THEN pt.quantity ELSE -pt.quantity END) AS quantity
        FROM part_transactions pt
        JOIN parts p ON p.id = pt.part_id
        WHERE pt.reference_type = 'breakdown' AND pt.reference_id = ?
        GROUP BY pt.part_id, p.part_name, p.part_code
        HAVING quantity > 0
        ORDER BY p.part_name ASC`;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Photos that came with this breakdown (from an approved mobile submission).
router.get('/breakdowns/:id/photos', (req, res) => {
    db.query('SELECT filename FROM breakdown_photos WHERE breakdown_id = ? ORDER BY id ASC', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.map(r => r.filename));
    });
});

router.get('/breakdowns/:unit_no', (req, res) => {
    db.query(`SELECT b.*, (SELECT COUNT(*) FROM breakdown_photos p WHERE p.breakdown_id = b.id) AS photo_count
        FROM breakdowns b WHERE b.unit_no = ? ORDER BY b.informed_date DESC`, [req.params.unit_no], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.get('/all-breakdowns', (req, res) => {
    db.query('SELECT * FROM breakdowns ORDER BY informed_date DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.get('/breakdowns-filter', (req, res) => {
    db.query('SELECT * FROM breakdowns WHERE informed_date BETWEEN ? AND ? ORDER BY informed_date DESC', [req.query.from, req.query.to], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// The dashboard's one-click "mark as done" — separate from the full-edit PATCH
// below, and keeps hardcoding job_status = 'Job Done' for that flow.
// attended_by is optional; when omitted the existing value is left alone.
router.put('/breakdowns/:id', (req, res) => {
    const { actions_taken, attended_date, attended_time, attended_by } = req.body;
    db.query(
        `UPDATE breakdowns SET job_status = 'Job Done', actions_taken = ?, attended_date = ?, attended_time = ?, attended_by = COALESCE(?, attended_by) WHERE id = ?`,
        [actions_taken, attended_date, attended_time, attended_by || null, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: '✅ Job status updated!' });
        }
    );
});

// Full edit of a breakdown record (History tab's Edit action).
router.patch('/breakdowns/:id', requireKnownUnit, (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;

    if (!unit_no || !category || !nature_of_breakdown) {
        return res.status(400).json({ error: 'Unit No, Category and Nature of Breakdown are required.' });
    }
    if (job_status !== 'Pending' && job_status !== 'Job Done') {
        return res.status(400).json({ error: "Job Status must be 'Pending' or 'Job Done'." });
    }

    const usedParts = usedPartsFrom(req.body);
    const username = (req.session && req.session.username) || null;
    const sql = `UPDATE breakdowns SET informed_date = ?, informed_time = ?, informed_by = ?, unit_no = ?, category = ?, nature_of_breakdown = ?, attended_date = ?, attended_time = ?, attended_by = ?, job_status = ?, actions_taken = ? WHERE id = ?`;
    const sqlParams = [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date || null, attended_time || null, attended_by || null, job_status, actions_taken, req.params.id];

    // No parts_used field at all = caller isn't touching parts; leave stock alone.
    if (!usedParts) {
        db.query(sql, sqlParams, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: '✅ Breakdown updated successfully!' });
        });
        return;
    }

    withTransaction((connection, done) => {
        connection.query(sql, sqlParams, (updErr) => {
            if (updErr) return done(updErr);
            syncReferenceParts(connection, {
                reference_type: 'breakdown', reference_id: Number(req.params.id), desired: usedParts,
                label: `breakdown #${req.params.id} (${unit_no})`, created_by: username
            }, done);
        });
    }, (err) => {
        if (err) return res.status(statusFor(err)).json({ error: err.message });
        res.json({ message: '✅ Breakdown updated successfully!' });
    });
});

// Deleting a breakdown gives its parts back to stock (as Stock In entries, so
// the part's history still shows what happened).
router.delete('/breakdowns/:id', (req, res) => {
    const username = (req.session && req.session.username) || null;
    let filenames = [];

    withTransaction((connection, done) => {
        syncReferenceParts(connection, {
            reference_type: 'breakdown', reference_id: Number(req.params.id), desired: [],
            label: `deleted breakdown #${req.params.id}`, created_by: username
        }, (syncErr) => {
            if (syncErr) return done(syncErr);
            connection.query('SELECT filename FROM breakdown_photos WHERE breakdown_id = ?', [req.params.id], (selErr, rows) => {
                if (selErr) return done(selErr);
                filenames = rows.map(r => r.filename);
                connection.query('DELETE FROM breakdown_photos WHERE breakdown_id = ?', [req.params.id], (photoErr) => {
                    if (photoErr) return done(photoErr);
                    connection.query('DELETE FROM breakdowns WHERE id = ?', [req.params.id], done);
                });
            });
        });
    }, (err) => {
        if (err) return res.status(statusFor(err)).json({ error: err.message });
        deletePhotoFiles(filenames);
        res.json({ message: '✅ Breakdown deleted successfully!' });
    });
});

module.exports = router;

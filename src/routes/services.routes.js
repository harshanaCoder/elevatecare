const express = require('express');
const db = require('../config/db');
const { syncReferenceParts } = require('../config/partStock');
const { withTransaction, statusFor } = require('../config/withTransaction');
const { requireKnownUnit } = require('./units.routes');

const router = express.Router();

// ==========================================
// 🛠️ SERVICES & MAINTENANCE API ROUTES
// ==========================================
// NOTE: don't `return db.query(...)` from a route handler here — in Express 5,
// returning mysql2's Query object (which exposes a `.then` for unrelated
// internal reasons, but isn't a real Promise) makes Express try to await it,
// which throws and crashes the process after the real response has been sent.
//
// Parts are recorded when a service is COMPLETED (PUT, or PATCH with status
// 'Completed'), not when it's scheduled — scheduling doesn't use any parts, so
// stock only moves once the work has actually happened. parts_used is the FULL
// list that should be on record; syncReferenceParts applies only the
// difference, so re-saving never deducts twice.
function usedPartsFrom(body) {
    return Array.isArray(body.parts_used) ? body.parts_used.filter(p => p && p.part_id && p.quantity > 0) : null;
}

// recurrence_months: whole months between repeats (1-60), or null for a one-off.
function recurrenceFrom(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null;
}

// When a recurring service becomes Completed, schedule the next one
// recurrence_months after its completion date — same unit, type, technicians
// and notes. Runs inside the caller's transaction, after the completion write.
// callback(err, nextServiceDate|null)
function scheduleNextIfRecurring(connection, serviceId, callback) {
    connection.query(
        `INSERT INTO services (unit_no, service_date, service_type, technicians, notes, recurrence_months, status)
         SELECT unit_no, DATE_ADD(COALESCE(completed_date, CURDATE()), INTERVAL recurrence_months MONTH),
                service_type, technicians, notes, recurrence_months, 'Scheduled'
         FROM services WHERE id = ? AND recurrence_months IS NOT NULL`,
        [serviceId],
        (err, result) => {
            if (err) return callback(err);
            if (!result.insertId) return callback(null, null);
            connection.query('SELECT service_date FROM services WHERE id = ?', [result.insertId], (selErr, rows) => {
                callback(selErr, selErr ? null : rows[0].service_date);
            });
        }
    );
}

router.post('/services', requireKnownUnit, (req, res) => {
    const { unit_no, service_date, service_type, technicians, notes } = req.body;
    const finalNotes = notes || "-";

    const sql = `INSERT INTO services (unit_no, service_date, service_type, technicians, notes, recurrence_months, status) VALUES (?, ?, ?, ?, ?, ?, 'Scheduled')`;
    db.query(sql, [unit_no, service_date, service_type, technicians, finalNotes, recurrenceFrom(req.body.recurrence_months)], (err) => {
        if (err) {
            console.error("❌ SQL Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.status(200).json({ message: '✅ Service scheduled successfully!' });
    });
});

router.get('/services', (req, res) => {
    db.query('SELECT * FROM services ORDER BY service_date ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Parts currently on record for this service — net of any returns, joined with
// parts for the display name, since part_transactions only stores part_id.
router.get('/services/:id/parts-used', (req, res) => {
    const sql = `SELECT pt.part_id, p.part_name, p.part_code,
            SUM(CASE WHEN pt.type = 'OUT' THEN pt.quantity ELSE -pt.quantity END) AS quantity
        FROM part_transactions pt
        JOIN parts p ON p.id = pt.part_id
        WHERE pt.reference_type = 'service' AND pt.reference_id = ?
        GROUP BY pt.part_id, p.part_name, p.part_code
        HAVING quantity > 0
        ORDER BY p.part_name ASC`;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// "Mark Done": completes the service, stamps the actual completion date,
// records any parts used, and (for a recurring service) schedules the next one
// — one transaction.
router.put('/services/:id', (req, res) => {
    const completedDate = req.body.completed_date || null;
    const usedParts = usedPartsFrom(req.body) || [];
    const username = (req.session && req.session.username) || null;

    withTransaction((connection, done) => {
        connection.query('SELECT status FROM services WHERE id = ? FOR UPDATE', [req.params.id], (selErr, rows) => {
            if (selErr) return done(selErr);
            if (!rows.length) return done(new Error('Service not found.'));
            const wasCompleted = rows[0].status === 'Completed';

            connection.query(
                `UPDATE services SET status = 'Completed', completed_date = COALESCE(?, CURDATE()) WHERE id = ?`,
                [completedDate, req.params.id],
                (err) => {
                    if (err) return done(err);
                    syncReferenceParts(connection, {
                        reference_type: 'service', reference_id: Number(req.params.id), desired: usedParts,
                        label: `service #${req.params.id}`, created_by: username
                    }, (syncErr) => {
                        if (syncErr) return done(syncErr);
                        if (wasCompleted) return done(null, null); // already completed: never spawn a second follow-up
                        scheduleNextIfRecurring(connection, req.params.id, done);
                    });
                }
            );
        });
    }, (err, nextDate) => {
        if (err) return res.status(statusFor(err)).json({ error: err.message });
        res.json({ message: '✅ Service Completed!', next_service_date: nextDate || null });
    });
});

// Full edit of a service record (Service History's Edit action) — separate
// from the PUT above, which is the "Mark Done" one-click action.
router.patch('/services/:id', requireKnownUnit, (req, res) => {
    const { unit_no, service_date, service_type, technicians, notes, status, completed_date } = req.body;

    if (!unit_no || !service_date || !service_type) {
        return res.status(400).json({ error: 'Unit No, Service Date and Service Type are required.' });
    }

    const finalStatus = status === 'Completed' ? 'Completed' : 'Scheduled';
    // A service that isn't Completed has no parts on record; switching one back
    // to Scheduled therefore returns its parts to stock.
    let usedParts = usedPartsFrom(req.body);
    if (finalStatus === 'Scheduled') usedParts = [];

    const username = (req.session && req.session.username) || null;
    const sql = `UPDATE services SET unit_no = ?, service_date = ?, service_type = ?, technicians = ?, notes = ?, recurrence_months = ?, status = ?,
        completed_date = ${finalStatus === 'Completed' ? 'COALESCE(?, completed_date, service_date)' : 'NULL'} WHERE id = ?`;
    const sqlParams = [unit_no, service_date, service_type, technicians || '', notes || '-', recurrenceFrom(req.body.recurrence_months), finalStatus];
    if (finalStatus === 'Completed') sqlParams.push(completed_date || null);
    sqlParams.push(req.params.id);

    withTransaction((connection, done) => {
        connection.query('SELECT status FROM services WHERE id = ? FOR UPDATE', [req.params.id], (selErr, rows) => {
            if (selErr) return done(selErr);
            if (!rows.length) return done(new Error('Service not found.'));
            const justCompleted = rows[0].status !== 'Completed' && finalStatus === 'Completed';

            connection.query(sql, sqlParams, (updErr) => {
                if (updErr) return done(updErr);

                const afterParts = (syncErr) => {
                    if (syncErr) return done(syncErr);
                    if (!justCompleted) return done(null, null);
                    scheduleNextIfRecurring(connection, req.params.id, done);
                };

                if (!usedParts) return afterParts(null); // no parts_used field: leave stock alone
                syncReferenceParts(connection, {
                    reference_type: 'service', reference_id: Number(req.params.id), desired: usedParts,
                    label: `service #${req.params.id} (${unit_no})`, created_by: username
                }, afterParts);
            });
        });
    }, (err, nextDate) => {
        if (err) return res.status(statusFor(err)).json({ error: err.message });
        res.json({ message: '✅ Service updated successfully!', next_service_date: nextDate || null });
    });
});

// Deleting a service gives its parts back to stock.
router.delete('/services/:id', (req, res) => {
    const username = (req.session && req.session.username) || null;

    withTransaction((connection, done) => {
        syncReferenceParts(connection, {
            reference_type: 'service', reference_id: Number(req.params.id), desired: [],
            label: `deleted service #${req.params.id}`, created_by: username
        }, (syncErr) => {
            if (syncErr) return done(syncErr);
            connection.query('DELETE FROM services WHERE id = ?', [req.params.id], done);
        });
    }, (err) => {
        if (err) return res.status(statusFor(err)).json({ error: err.message });
        res.json({ message: '✅ Service deleted successfully!' });
    });
});

module.exports = router;

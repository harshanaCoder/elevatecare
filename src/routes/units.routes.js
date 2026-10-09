const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 🏢 UNITS API ROUTES
// Master list of lifts/escalators — the single source for the Building → Type →
// Unit dropdowns on Lifts, Breakdowns, Services and Reports (previously a
// copy-pasted array in each page). Managed from Settings.
// ==========================================

const LIFT_TYPES = ['PL', 'SL', 'FSL', 'ES'];

router.get('/units', (req, res) => {
    db.query('SELECT unit_no, building, lift_type FROM units ORDER BY building, lift_type, unit_no', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/units', (req, res) => {
    const unitNo = (req.body.unit_no || '').trim();
    const building = (req.body.building || '').trim();
    const liftType = (req.body.lift_type || '').trim();

    if (!unitNo || !building) return res.status(400).json({ error: 'Unit No and Building are required.' });
    if (!LIFT_TYPES.includes(liftType)) return res.status(400).json({ error: `Lift Type must be one of ${LIFT_TYPES.join(', ')}.` });

    db.query('INSERT INTO units (unit_no, building, lift_type) VALUES (?, ?, ?)', [unitNo, building, liftType], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That unit already exists.' });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ unit_no: unitNo, building, lift_type: liftType });
    });
});

// A unit with breakdown/service records can't be removed — its history would
// no longer be attributable to a known unit in Reports.
router.delete('/units/:unit_no', (req, res) => {
    const sql = `SELECT
        (SELECT COUNT(*) FROM breakdowns WHERE unit_no = ?) +
        (SELECT COUNT(*) FROM services WHERE unit_no = ?) AS n`;
    db.query(sql, [req.params.unit_no, req.params.unit_no], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rows[0].n > 0) return res.status(409).json({ error: 'This unit has breakdown or service records, so it can\'t be removed.' });
        db.query('DELETE FROM units WHERE unit_no = ?', [req.params.unit_no], (delErr) => {
            if (delErr) return res.status(500).json({ error: delErr.message });
            res.json({ success: true });
        });
    });
});

// Express middleware: rejects a breakdown/service write whose unit_no isn't in
// the master list (free-text typos were possible before). Skipped when the body
// has no unit_no so partial updates still work.
function requireKnownUnit(req, res, next) {
    const unitNo = req.body && req.body.unit_no;
    if (!unitNo) return next();
    db.query('SELECT 1 FROM units WHERE unit_no = ?', [unitNo], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!rows.length) return res.status(400).json({ error: `Unknown unit "${unitNo}". Pick a unit from the list (admins can add units in Settings).` });
        next();
    });
}

module.exports = router;
module.exports.requireKnownUnit = requireKnownUnit;

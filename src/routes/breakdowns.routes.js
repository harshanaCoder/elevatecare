const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 🚨 BREAKDOWNS API ROUTES
// ==========================================
router.post('/breakdowns', (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;
    const sql = `INSERT INTO breakdowns (informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Breakdown saved successfully!' });
    });
});

router.get('/breakdowns/:unit_no', (req, res) => {
    db.query('SELECT * FROM breakdowns WHERE unit_no = ? ORDER BY informed_date DESC', [req.params.unit_no], (err, results) => {
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

router.put('/breakdowns/:id', (req, res) => {
    const { actions_taken, attended_date, attended_time } = req.body;
    db.query(`UPDATE breakdowns SET job_status = 'Job Done', actions_taken = ?, attended_date = ?, attended_time = ? WHERE id = ?`, [actions_taken, attended_date, attended_time, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Job status updated!' });
    });
});

// Full edit of a breakdown record (History tab's Edit action) — separate from
// the PUT above, which is the dashboard's one-click "mark as done" and must
// keep hardcoding job_status = 'Job Done' for that flow.
router.patch('/breakdowns/:id', (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;

    if (!unit_no || !category || !nature_of_breakdown) {
        return res.status(400).json({ error: 'Unit No, Category and Nature of Breakdown are required.' });
    }

    const sql = `UPDATE breakdowns SET informed_date = ?, informed_time = ?, informed_by = ?, unit_no = ?, category = ?, nature_of_breakdown = ?, attended_date = ?, attended_time = ?, attended_by = ?, job_status = ?, actions_taken = ? WHERE id = ?`;
    db.query(sql, [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date || null, attended_time || null, attended_by || null, job_status, actions_taken, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Breakdown updated successfully!' });
    });
});

router.delete('/breakdowns/:id', (req, res) => {
    db.query('DELETE FROM breakdowns WHERE id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Breakdown deleted successfully!' });
    });
});

module.exports = router;

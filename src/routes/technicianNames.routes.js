const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 🧑‍🔧 TECHNICIAN NAMES API ROUTES
// A simple shared name list (managed from Settings) used to populate the
// "attended by" / "assign technician(s)" checkboxes on Breakdowns and
// Services — not a full technician roster (no skills/status/assignment).
// ==========================================

router.get('/technician-names', (req, res) => {
    db.query('SELECT id, name FROM technician_names ORDER BY name ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/technician-names', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    db.query('INSERT INTO technician_names (name) VALUES (?)', [name], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That technician already exists.' });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: result.insertId, name });
    });
});

router.delete('/technician-names/:id', (req, res) => {
    db.query('DELETE FROM technician_names WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;

const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 🏷️ BREAKDOWN TYPES API ROUTES
// A shared name list (managed from Settings) used to populate the
// "Breakdown Category" dropdown on Breakdowns, Pending and Reports.
// ==========================================

router.get('/breakdown-types', (req, res) => {
    db.query('SELECT id, name FROM breakdown_types ORDER BY name ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/breakdown-types', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    db.query('INSERT INTO breakdown_types (name) VALUES (?)', [name], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That breakdown type already exists.' });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: result.insertId, name });
    });
});

router.delete('/breakdown-types/:id', (req, res) => {
    db.query('DELETE FROM breakdown_types WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;

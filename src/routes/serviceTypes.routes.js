const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 🏷️ SERVICE TYPES API ROUTES
// A shared name list (managed from Settings) used to populate the
// "Service Type" dropdown on Services.
// ==========================================

router.get('/service-types', (req, res) => {
    db.query('SELECT id, name FROM service_types ORDER BY name ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/service-types', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    db.query('INSERT INTO service_types (name) VALUES (?)', [name], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That service type already exists.' });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: result.insertId, name });
    });
});

router.delete('/service-types/:id', (req, res) => {
    db.query('DELETE FROM service_types WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;

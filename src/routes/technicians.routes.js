const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 👷 TECHNICIANS API ROUTES
// ==========================================
router.get('/technicians', (req, res) => {
    db.query('SELECT * FROM technicians ORDER BY name ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/technicians', (req, res) => {
    const { tech_code, name, skills, status } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name is required.' });
    }

    const sql = `INSERT INTO technicians (tech_code, name, skills, status) VALUES (?, ?, ?, ?)`;
    db.query(sql, [tech_code || null, name, skills || null, status || 'Available'], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ message: '✅ Technician added successfully!' });
    });
});

router.put('/technicians/:id', (req, res) => {
    const { tech_code, name, skills, status, current_assignment } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name is required.' });
    }

    const sql = `UPDATE technicians SET tech_code = ?, name = ?, skills = ?, status = ?, current_assignment = ? WHERE id = ?`;
    db.query(sql, [tech_code || null, name, skills || null, status || 'Available', current_assignment || null, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ message: '✅ Technician updated successfully!' });
    });
});

router.delete('/technicians/:id', (req, res) => {
    db.query('DELETE FROM technicians WHERE id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ message: '✅ Technician deleted successfully!' });
    });
});

module.exports = router;

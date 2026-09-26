const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 🛠️ SERVICES & MAINTENANCE API ROUTES
// ==========================================
router.post('/services', (req, res) => {
    const { unit_no, service_date, service_type, technicians, notes } = req.body;
    const finalNotes = notes || "-";

    const sql = `INSERT INTO services (unit_no, service_date, service_type, technicians, notes, status) VALUES (?, ?, ?, ?, ?, 'Scheduled')`;
    db.query(sql, [unit_no, service_date, service_type, technicians, finalNotes], (err, result) => {
        if (err) {
            console.error("❌ SQL Error:", err.message); // Terminal eke error eka pennanawa
            return res.status(500).json({ error: err.message }); // UI ekata error eka yawanawa
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

router.put('/services/:id', (req, res) => {
    db.query(`UPDATE services SET status = 'Completed' WHERE id = ?`, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Service Completed!' });
    });
});

// Full edit of a service record (Service History's Edit action) — separate
// from the PUT above, which is the "Mark Done" one-click action and must
// keep hardcoding status = 'Completed' for that flow.
router.patch('/services/:id', (req, res) => {
    const { unit_no, service_date, service_type, technicians, notes, status } = req.body;

    if (!unit_no || !service_date || !service_type) {
        return res.status(400).json({ error: 'Unit No, Service Date and Service Type are required.' });
    }

    const sql = `UPDATE services SET unit_no = ?, service_date = ?, service_type = ?, technicians = ?, notes = ?, status = ? WHERE id = ?`;
    db.query(sql, [unit_no, service_date, service_type, technicians || '', notes || '-', status || 'Scheduled', req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Service updated successfully!' });
    });
});

router.delete('/services/:id', (req, res) => {
    db.query('DELETE FROM services WHERE id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Service deleted successfully!' });
    });
});

module.exports = router;

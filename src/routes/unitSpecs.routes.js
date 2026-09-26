const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 🏢 UNIT SPECIFICATIONS & HISTORY API ROUTES
// ==========================================

// 1. අදාළ Unit එකේ Service History එක ගැනීම
router.get('/services/:unit_no', (req, res) => {
    // 'Completed' වුණු services විතරක් පෙන්නන්න
    db.query('SELECT * FROM services WHERE unit_no = ? AND status = "Completed" ORDER BY service_date DESC', [req.params.unit_no], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Unit එකේ Technical Specs ටික Database එකෙන් ගැනීම
router.get('/unit-specs/:unit_no', (req, res) => {
    db.query('SELECT * FROM unit_specifications WHERE unit_no = ?', [req.params.unit_no], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0] || {}); // Data නැත්තම් හිස් object එකක් යවනවා
    });
});

// 3. Technical Specs සේව් කිරීම හෝ අප්ඩේට් කිරීම (UPSERT)
router.post('/unit-specs', (req, res) => {
    const { unit_no, motor_details, controller_type, eld_type, eld_battery, u_angle_sin, u_angle_cos } = req.body;

    const sql = `
        INSERT INTO unit_specifications (unit_no, motor_details, controller_type, eld_type, eld_battery, u_angle_sin, u_angle_cos)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        motor_details=VALUES(motor_details), controller_type=VALUES(controller_type),
        eld_type=VALUES(eld_type), eld_battery=VALUES(eld_battery),
        u_angle_sin=VALUES(u_angle_sin), u_angle_cos=VALUES(u_angle_cos)
    `;

    db.query(sql, [unit_no, motor_details, controller_type, eld_type, eld_battery, u_angle_sin, u_angle_cos], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database update failed!' });
        }
        res.json({ message: '✅ Technical Specifications Updated Successfully!' });
    });
});

module.exports = router;

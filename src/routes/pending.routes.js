const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ==========================================
// 📱 APP SYNC / PENDING BREAKDOWNS API
// ==========================================

// 1. Pending ලිස්ට් එක ගැනීම
router.get('/pending', (req, res) => {
    db.query('SELECT * FROM pending_breakdowns ORDER BY created_at ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Approve කරලා Main DB එකට (breakdowns table එකට) දැමීම
//
// Insert into breakdowns + delete from pending_breakdowns have to succeed or
// fail together — otherwise a delete failing after a successful insert would
// leave the record permanently duplicated (still pending AND approved), or a
// mid-request crash would lose which state it was in. Wrapped in a real
// transaction so it's all-or-nothing.
router.post('/pending/approve/:id', (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;

    // ප්‍රධාන Table එකට දානවා
    const sqlInsert = `INSERT INTO breakdowns (informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.getConnection((connErr, connection) => {
        if (connErr) return res.status(500).json({ error: connErr.message });

        connection.beginTransaction((txErr) => {
            if (txErr) {
                connection.release();
                return res.status(500).json({ error: txErr.message });
            }

            connection.query(sqlInsert, [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken], (insertErr) => {
                if (insertErr) {
                    return connection.rollback(() => {
                        connection.release();
                        res.status(500).json({ error: insertErr.message });
                    });
                }

                // දාලා ඉවර වුණාම Pending ලිස්ට් එකෙන් මකනවා
                connection.query('DELETE FROM pending_breakdowns WHERE id = ?', [req.params.id], (delErr) => {
                    if (delErr) {
                        return connection.rollback(() => {
                            connection.release();
                            res.status(500).json({ error: delErr.message });
                        });
                    }

                    connection.commit((commitErr) => {
                        connection.release();
                        if (commitErr) return res.status(500).json({ error: commitErr.message });
                        res.json({ message: '✅ Approved and saved to main database!' });
                    });
                });
            });
        });
    });
});

// 3. Discard කිරීම (මකා දැමීම)
router.delete('/pending/:id', (req, res) => {
    db.query('DELETE FROM pending_breakdowns WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Discarded successfully' });
    });
});

// 4. Test කරන්න බොරු Data එකක් Pending එකට දාන API එකක්
router.post('/pending/test', (req, res) => {
    const sql = `INSERT INTO pending_breakdowns (unit_no, job_status, informed_by, informed_date, informed_time, attended_by, attended_date, attended_time, nature_of_breakdown, actions_taken)
                 VALUES ('FSL 3.06', 'Job Done', 'Mr. Dilshan (SOC)', '2026-07-04', '09:15', 'Tharusha / Pathum', '2026-07-04', '10:30', 'Micro switch clean kera', 'Cleaned car door micro switch and tested.')`;
    db.query(sql, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Test data added!' });
    });
});

module.exports = router;

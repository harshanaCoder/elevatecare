const express = require('express');
const db = require('../config/db');

const { requireKnownUnit } = require('./units.routes');
const { withTransaction } = require('../config/withTransaction');
const { deletePhotoFiles } = require('../config/photos');

const router = express.Router();

// ==========================================
// 📱 APP SYNC / PENDING BREAKDOWNS API
// ==========================================

// 1. Pending ලිස්ට් එක ගැනීම (each row carries the filenames of its photos)
router.get('/pending', (req, res) => {
    db.query('SELECT * FROM pending_breakdowns ORDER BY created_at ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('SELECT pending_id, filename FROM breakdown_photos WHERE pending_id IS NOT NULL ORDER BY id ASC', (photoErr, photos) => {
            if (photoErr) return res.status(500).json({ error: photoErr.message });
            results.forEach(row => { row.photos = photos.filter(p => p.pending_id === row.id).map(p => p.filename); });
            res.json(results);
        });
    });
});

// 2. Approve කරලා Main DB එකට (breakdowns table එකට) දැමීම
//
// Insert into breakdowns + delete from pending_breakdowns have to succeed or
// fail together — otherwise a delete failing after a successful insert would
// leave the record permanently duplicated (still pending AND approved), or a
// mid-request crash would lose which state it was in. Wrapped in a real
// transaction so it's all-or-nothing. The submission's photos move over to the
// new breakdown in the same transaction.
router.post('/pending/approve/:id', requireKnownUnit, (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;

    // ප්‍රධාන Table එකට දානවා
    const sqlInsert = `INSERT INTO breakdowns (informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    withTransaction((connection, done) => {
        connection.query(sqlInsert, [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken], (insertErr, result) => {
            if (insertErr) return done(insertErr);

            connection.query('UPDATE breakdown_photos SET breakdown_id = ?, pending_id = NULL WHERE pending_id = ?', [result.insertId, req.params.id], (photoErr) => {
                if (photoErr) return done(photoErr);

                // දාලා ඉවර වුණාම Pending ලිස්ට් එකෙන් මකනවා
                connection.query('DELETE FROM pending_breakdowns WHERE id = ?', [req.params.id], done);
            });
        });
    }, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Approved and saved to main database!' });
    });
});

// 3. Discard කිරීම (මකා දැමීම)
router.delete('/pending/:id', (req, res) => {
    let filenames = [];
    withTransaction((connection, done) => {
        connection.query('SELECT filename FROM breakdown_photos WHERE pending_id = ?', [req.params.id], (selErr, rows) => {
            if (selErr) return done(selErr);
            filenames = rows.map(r => r.filename);
            connection.query('DELETE FROM breakdown_photos WHERE pending_id = ?', [req.params.id], (photoErr) => {
                if (photoErr) return done(photoErr);
                connection.query('DELETE FROM pending_breakdowns WHERE id = ?', [req.params.id], done);
            });
        });
    }, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        deletePhotoFiles(filenames);
        res.json({ message: '✅ Discarded successfully' });
    });
});

// 4. Test කරන්න බොරු Data එකක් Pending එකට දාන API එකක්
//    Production ඉදිරියේදී මේක 404 වෙනවා — real app එක නැතිව demo data දාන්න බැහැ.
router.post('/pending/test', (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found.' });
    const sql = `INSERT INTO pending_breakdowns (unit_no, job_status, informed_by, informed_date, informed_time, attended_by, attended_date, attended_time, nature_of_breakdown, actions_taken)
                 VALUES ('FSL 3.06', 'Job Done', 'Mr. Dilshan (SOC)', '2026-07-04', '09:15', 'Tharusha / Pathum', '2026-07-04', '10:30', 'Micro switch clean kera', 'Cleaned car door micro switch and tested.')`;
    db.query(sql, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Test data added!' });
    });
});

module.exports = router;

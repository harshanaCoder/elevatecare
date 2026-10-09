const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const { decodePhotos, writePhotos, deletePhotoFiles } = require('../config/photos');
const { withTransaction } = require('../config/withTransaction');

const router = express.Router();

// ==========================================
// 📱 MOBILE APP INGEST
// The technicians' mobile app has no login session, so it authenticates with a
// shared secret in the `x-api-key` header (MOBILE_API_KEY in .env). This is the
// ONLY /api route reachable without a session — see server.js. What it creates
// is a pending submission, never a real breakdown: an admin still reviews and
// approves it on the App Reviews page.
// ==========================================

function keyMatches(provided) {
    const expected = process.env.MOBILE_API_KEY || '';
    if (!expected || typeof provided !== 'string') return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/mobile/breakdowns', (req, res) => {
    if (!process.env.MOBILE_API_KEY) return res.status(503).json({ error: 'Mobile submissions are not enabled on this server.' });
    if (!keyMatches(req.get('x-api-key'))) return res.status(401).json({ error: 'Invalid API key.' });

    const b = req.body || {};
    if (!b.unit_no || !b.nature_of_breakdown) {
        return res.status(400).json({ error: 'unit_no and nature_of_breakdown are required.' });
    }

    let decoded;
    try { decoded = decodePhotos(b.photos); }
    catch (err) { return res.status(400).json({ error: err.message }); }

    db.query('SELECT 1 FROM units WHERE unit_no = ?', [b.unit_no], (unitErr, unitRows) => {
        if (unitErr) return res.status(500).json({ error: unitErr.message });
        if (!unitRows.length) return res.status(400).json({ error: `Unknown unit "${b.unit_no}".` });

        // Files are written first so a DB failure can clean them up below; the
        // rows then go in with the submission in one transaction.
        const filenames = writePhotos(decoded);

        withTransaction((connection, done) => {
            connection.query(
                `INSERT INTO pending_breakdowns (unit_no, job_status, category, informed_by, informed_date, informed_time, attended_by, attended_date, attended_time, nature_of_breakdown, actions_taken)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [b.unit_no, b.job_status === 'Job Done' ? 'Job Done' : 'Pending', b.category || null, b.informed_by || null,
                 b.informed_date || null, b.informed_time || null, b.attended_by || null, b.attended_date || null,
                 b.attended_time || null, b.nature_of_breakdown, b.actions_taken || null],
                (insErr, result) => {
                    if (insErr) return done(insErr);
                    if (!filenames.length) return done(null, result.insertId);
                    connection.query(
                        'INSERT INTO breakdown_photos (pending_id, filename) VALUES ?',
                        [filenames.map(f => [result.insertId, f])],
                        (photoErr) => done(photoErr, result.insertId)
                    );
                }
            );
        }, (err, id) => {
            if (err) {
                deletePhotoFiles(filenames);
                return res.status(err.code ? 500 : 400).json({ error: err.message });
            }
            res.status(201).json({ message: '✅ Submitted for review.', id, photos: filenames.length });
        });
    });
});

module.exports = router;

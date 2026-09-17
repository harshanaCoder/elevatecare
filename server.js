const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); 

// 🗄️ Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      
    password: '',      
    database: 'elevatecare_db' 
});

db.connect((err) => {
    if (err) console.error('❌ DB Connection Failed!', err);
    else console.log('✅ Connected to ElevateCare DB!');
});

// ==========================================
// 🚨 BREAKDOWNS API ROUTES
// ==========================================
app.post('/api/breakdowns', (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;
    const sql = `INSERT INTO breakdowns (informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Breakdown saved successfully!' });
    });
});

app.get('/api/breakdowns/:unit_no', (req, res) => {
    db.query('SELECT * FROM breakdowns WHERE unit_no = ? ORDER BY informed_date DESC', [req.params.unit_no], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/all-breakdowns', (req, res) => {
    db.query('SELECT * FROM breakdowns ORDER BY informed_date DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/breakdowns-filter', (req, res) => {
    db.query('SELECT * FROM breakdowns WHERE informed_date BETWEEN ? AND ? ORDER BY informed_date DESC', [req.query.from, req.query.to], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.put('/api/breakdowns/:id', (req, res) => {
    const { actions_taken, attended_date, attended_time } = req.body;
    db.query(`UPDATE breakdowns SET job_status = 'Job Done', actions_taken = ?, attended_date = ?, attended_time = ? WHERE id = ?`, [actions_taken, attended_date, attended_time, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Job status updated!' });
    });
});

// ==========================================
// 🛠️ SERVICES & MAINTENANCE API ROUTES
// ==========================================
app.post('/api/services', (req, res) => {
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

app.get('/api/services', (req, res) => {
    db.query('SELECT * FROM services ORDER BY service_date ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.put('/api/services/:id', (req, res) => {
    db.query(`UPDATE services SET status = 'Completed' WHERE id = ?`, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Service Completed!' });
    });
});

// ==========================================
// 🏢 UNIT SPECIFICATIONS & HISTORY API ROUTES
// ==========================================

// 1. අදාළ Unit එකේ Service History එක ගැනීම
app.get('/api/services/:unit_no', (req, res) => {
    // 'Completed' වුණු services විතරක් පෙන්නන්න
    db.query('SELECT * FROM services WHERE unit_no = ? AND status = "Completed" ORDER BY service_date DESC', [req.params.unit_no], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Unit එකේ Technical Specs ටික Database එකෙන් ගැනීම
app.get('/api/unit-specs/:unit_no', (req, res) => {
    db.query('SELECT * FROM unit_specifications WHERE unit_no = ?', [req.params.unit_no], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0] || {}); // Data නැත්තම් හිස් object එකක් යවනවා
    });
});

// 3. Technical Specs සේව් කිරීම හෝ අප්ඩේට් කිරීම (UPSERT)
app.post('/api/unit-specs', (req, res) => {
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

// ==========================================
// ⭐ APP REVIEWS API ROUTES
// ==========================================

// ==========================================
// 📱 APP SYNC / PENDING BREAKDOWNS API
// ==========================================

// 1. Pending ලිස්ට් එක ගැනීම
app.get('/api/pending', (req, res) => {
    db.query('SELECT * FROM pending_breakdowns ORDER BY created_at ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Approve කරලා Main DB එකට (breakdowns table එකට) දැමීම
app.post('/api/pending/approve/:id', (req, res) => {
    const { informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken } = req.body;

    // ප්‍රධාන Table එකට දානවා
    const sqlInsert = `INSERT INTO breakdowns (informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sqlInsert, [informed_date, informed_time, informed_by, unit_no, category, nature_of_breakdown, attended_date, attended_time, attended_by, job_status, actions_taken], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        // දාලා ඉවර වුණාම Pending ලිස්ට් එකෙන් මකනවා
        db.query('DELETE FROM pending_breakdowns WHERE id = ?', [req.params.id], (delErr) => {
            if (delErr) return res.status(500).json({ error: delErr.message });
            res.json({ message: '✅ Approved and saved to main database!' });
        });
    });
});

// 3. Discard කිරීම (මකා දැමීම)
app.delete('/api/pending/:id', (req, res) => {
    db.query('DELETE FROM pending_breakdowns WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '✅ Discarded successfully' });
    });
});

// 4. Test කරන්න බොරු Data එකක් Pending එකට දාන API එකක්
app.post('/api/pending/test', (req, res) => {
    const sql = `INSERT INTO pending_breakdowns (unit_no, job_status, informed_by, informed_date, informed_time, attended_by, attended_date, attended_time, nature_of_breakdown, actions_taken) 
                 VALUES ('FSL 3.06', 'Job Done', 'Mr. Dilshan (SOC)', '2026-07-04', '09:15', 'Tharusha / Pathum', '2026-07-04', '10:30', 'Micro switch clean kera', 'Cleaned car door micro switch and tested.')`;
    db.query(sql, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Test data added!' });
    });
});

// Server Start
app.listen(5000, () => {
    console.log(`🚀 Server running on http://localhost:5000`);
});
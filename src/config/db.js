const mysql = require('mysql2');

// 🗄️ Database connection pool — configured from environment variables
// (see .env.example). A pool instead of a single connection matters for two
// reasons: (1) it survives MySQL restarting or dropping an idle connection —
// each query just gets a fresh connection instead of the whole app being
// stuck with one dead one — and (2) concurrent requests aren't serialized
// through a single connection.
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'elevatecare_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Sanity-check connectivity once at startup (queries themselves still go
// through the pool, which handles reconnecting on its own after this).
pool.getConnection((err, connection) => {
    if (err) console.error('❌ DB Connection Failed!', err);
    else {
        console.log('✅ Connected to ElevateCare DB!');
        connection.release();
    }
});

module.exports = pool;

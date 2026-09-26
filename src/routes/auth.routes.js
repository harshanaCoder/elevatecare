const express = require('express');
const bcrypt = require('bcryptjs');

const router = express.Router();

// ==========================================
// 🔐 AUTH ROUTES (env-configured accounts, no users table)
// ==========================================
// Two roles right now: "admin" (full access) and "reports" (reports.html
// only — see the ROLE_ACCESS allowlist in server.js for what that actually
// restricts). Each is one username/password pair from .env, not a table —
// adding more roles later means adding another block below, same pattern.
//
// Password hashes are generated with scripts/hash-password.js and stored
// base64-encoded in .env — Docker Compose mangles raw bcrypt hashes (the
// "$...$" sequences get misread as variable references), so base64 is what
// makes the same .env work under both `node`/`nodemon` and `docker compose`.
function loadAccounts() {
    const accounts = [
        { role: 'admin', username: process.env.ADMIN_USERNAME, hashB64: process.env.ADMIN_PASSWORD_HASH },
        { role: 'reports', username: process.env.REPORTS_USERNAME, hashB64: process.env.REPORTS_PASSWORD_HASH }
    ];
    return accounts.filter(a => a.username && a.hashB64);
}

router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const accounts = loadAccounts();
    if (accounts.length === 0) {
        console.error('❌ No login accounts configured in .env (ADMIN_USERNAME/ADMIN_PASSWORD_HASH missing)');
        return res.status(500).json({ error: 'Login is not configured on the server.' });
    }

    const account = accounts.find(a => a.username === username);
    if (!account) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const expectedHash = Buffer.from(account.hashB64, 'base64').toString('utf8');
    const passwordMatches = await bcrypt.compare(password, expectedHash);
    if (!passwordMatches) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.role = account.role;
    req.session.username = username;
    res.json({ message: '✅ Logged in!', role: account.role });
});

router.post('/auth/logout', (req, res) => {
    // cookie-session has no .destroy() — the session lives entirely in the
    // cookie, so clearing it is just nulling it out (sends an expired cookie).
    req.session = null;
    res.json({ message: '✅ Logged out.' });
});

// Lets a page ask "am I logged in, and as what role?" without triggering the
// redirect the page-level auth gate would otherwise do.
router.get('/auth/me', (req, res) => {
    const role = (req.session && req.session.role) || null;
    res.json({
        loggedIn: !!role,
        role,
        username: (req.session && req.session.username) || null
    });
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const { createLimiter } = require('../config/rateLimit');

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

// Brute-force guards (in memory — one app process; a restart just resets them):
//  - per IP:       8 wrong attempts / 15 min -> that IP is locked out
//  - per username: 20 wrong attempts / 15 min -> that account refuses logins for
//                  the rest of the window, which stops a botnet spreading guesses
//                  over many IPs. (Trade-off: someone hammering the username can
//                  also keep the real owner out until the window passes — with only
//                  two fixed accounts and long random passwords, that is the safer side.)
const WINDOW_MS = 15 * 60 * 1000;
const ipFailures = createLimiter({ windowMs: WINDOW_MS, max: 8 });
const userFailures = createLimiter({ windowMs: WINDOW_MS, max: 20 });

// Compared against when the username doesn't exist, so a wrong username takes as
// long as a wrong password and response time can't be used to discover usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body || {};

    // Only plain strings, and sane lengths (bcrypt ignores everything past 72 bytes
    // anyway; a megabyte "password" is just a CPU-burning attack).
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (username.length > 100 || password.length > 200) {
        return res.status(400).json({ error: 'Invalid username or password.' });
    }

    const userKey = username.toLowerCase();
    if (ipFailures.isBlocked(req.ip) || userFailures.isBlocked(userKey)) {
        res.set('Retry-After', String(ipFailures.retryAfterSeconds(req.ip)));
        return res.status(429).json({ error: 'Too many failed attempts. Please try again in a few minutes.' });
    }

    const accounts = loadAccounts();
    if (accounts.length === 0) {
        console.error('❌ No login accounts configured in .env (ADMIN_USERNAME/ADMIN_PASSWORD_HASH missing)');
        return res.status(500).json({ error: 'Login is not configured on the server.' });
    }

    const account = accounts.find(a => a.username === username);
    const expectedHash = account ? Buffer.from(account.hashB64, 'base64').toString('utf8') : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, expectedHash);

    if (!account || !passwordMatches) {
        ipFailures.hit(req.ip);
        userFailures.hit(userKey);
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    ipFailures.reset(req.ip);
    userFailures.reset(userKey);
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
        username: (req.session && req.session.username) || null,
        // Lets pages hide demo-only tools (e.g. Pending's "Simulate Mobile Input")
        // outside development.
        devMode: process.env.NODE_ENV !== 'production'
    });
});

module.exports = router;

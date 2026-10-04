require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieSession = require('cookie-session');

const authRoutes = require('./routes/auth.routes');
const breakdownsRoutes = require('./routes/breakdowns.routes');
const servicesRoutes = require('./routes/services.routes');
const unitSpecsRoutes = require('./routes/unitSpecs.routes');
const pendingRoutes = require('./routes/pending.routes');
const technicianNamesRoutes = require('./routes/technicianNames.routes');
const breakdownTypesRoutes = require('./routes/breakdownTypes.routes');
const serviceTypesRoutes = require('./routes/serviceTypes.routes');

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET is not set in .env — using an insecure default. Fine for a quick local test, set a real one before deploying anywhere.');
}

// The session itself (role, username) is stored entirely inside the cookie,
// cryptographically signed so it can't be tampered with — there's no
// server-side store, so nothing to lose on a restart (nodemon reload, Docker
// rebuild, crash). Fine for this app: only two fixed accounts, nothing
// sensitive in the session, and no need to revoke one specific session
// early — rotating SESSION_SECRET logs everyone out at once if that's ever
// needed. `req.session = null` (see auth.routes.js logout) clears it.
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me'],
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
}));

// 🔒 Auth gate — runs before static files and before every API route.
// Anything not explicitly public requires a session; "admin" gets full
// access, every other role is restricted to exactly what's listed below —
// add a new role by adding another entry here, same pattern.
const PUBLIC_PATHS = ['/login.html', '/healthz', '/favicon.ico'];

function isPublicPath(requestPath) {
    if (PUBLIC_PATHS.includes(requestPath)) return true;
    if (requestPath.startsWith('/js/')) return true;   // config.js / sidebar.js — no sensitive data
    if (requestPath.startsWith('/css/')) return true;  // tailwind.css — needed by login.html too
    if (requestPath.startsWith('/api/auth/')) return true; // login/logout/me themselves
    return false;
}

const ROLE_ACCESS = {
    reports: {
        // settings.html is just a per-browser light/dark preference
        // (localStorage, no server data) — harmless for any logged-in role.
        pages: ['/reports.html', '/settings.html'],
        api: ['/api/all-breakdowns', '/api/breakdowns-filter']
    }
};

function roleCanAccess(role, requestPath) {
    if (role === 'admin') return true;
    const allowed = ROLE_ACCESS[role];
    if (!allowed) return false;
    return allowed.pages.includes(requestPath) || allowed.api.includes(requestPath);
}

// Where a role lands after login / when it hits a page it can't access.
function landingPageFor(role) {
    return role === 'reports' ? '/reports.html' : '/dashboard.html';
}

app.use((req, res, next) => {
    if (isPublicPath(req.path)) return next();

    const role = req.session && req.session.role;

    if (!role) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Not authenticated. Please log in.' });
        }
        return res.redirect('/login.html');
    }

    if (roleCanAccess(role, req.path)) return next();

    if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Not authorized for this resource.' });
    }
    return res.redirect(landingPageFor(role));
});

// 🌐 Serve the frontend (public/) as static files
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
    const role = req.session && req.session.role;
    res.redirect(role ? landingPageFor(role) : '/login.html');
});

// Health check — used by Docker's healthcheck and, later, any cloud load
// balancer to know the app process is up (doesn't touch the DB on purpose,
// so it still reports healthy while only the DB is down).
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));

// ==========================================
// 🔌 API ROUTES
// ==========================================
app.use('/api', authRoutes);
app.use('/api', breakdownsRoutes);
app.use('/api', servicesRoutes);
app.use('/api', unitSpecsRoutes);
app.use('/api', pendingRoutes);
app.use('/api', technicianNamesRoutes);
app.use('/api', breakdownTypesRoutes);
app.use('/api', serviceTypesRoutes);

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

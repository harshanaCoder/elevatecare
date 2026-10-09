require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const authRoutes = require('./routes/auth.routes');
const breakdownsRoutes = require('./routes/breakdowns.routes');
const servicesRoutes = require('./routes/services.routes');
const unitSpecsRoutes = require('./routes/unitSpecs.routes');
const pendingRoutes = require('./routes/pending.routes');
const technicianNamesRoutes = require('./routes/technicianNames.routes');
const breakdownTypesRoutes = require('./routes/breakdownTypes.routes');
const serviceTypesRoutes = require('./routes/serviceTypes.routes');
const partsRoutes = require('./routes/parts.routes');
const unitsRoutes = require('./routes/units.routes');
const mobileRoutes = require('./routes/mobile.routes');
const { UPLOAD_DIR } = require('./config/photos');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
// No cors(): the pages and the API are served from the same origin, so
// cross-origin access is never needed — leaving it off means other websites
// can't script against this API from a visitor's browser.
// The mobile endpoint carries base64 photos, so it gets a bigger body limit;
// it must be mounted before the global parser (which would reject >1mb).
app.use('/api/mobile', express.json({ limit: '30mb' }));
app.use(express.json({ limit: '1mb' }));

// Caddy (or any reverse proxy) terminates HTTPS in front of this app; trusting
// one proxy hop lets Express see the real client IP (for login rate-limiting)
// and the original protocol (for secure cookies).
app.set('trust proxy', 1);

// Baseline security headers (a hand-rolled subset of what helmet sets, without
// the extra dependency). No CSP on purpose: pages load Tailwind/Chart.js/Font
// Awesome from CDNs and use inline scripts, so a strict policy would break them.
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'same-origin'
    });
    next();
});

if (!process.env.SESSION_SECRET) {
    if (IS_PRODUCTION) {
        console.error('❌ SESSION_SECRET is not set — refusing to start in production with the insecure default.');
        process.exit(1);
    }
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
    // Set COOKIE_SECURE=true in .env once the site is served over HTTPS (e.g.
    // after switching the Caddyfile to a real domain). Off by default because a
    // secure cookie is never sent over plain HTTP, which would break login on
    // the current http://:80 setup.
    secure: process.env.COOKIE_SECURE === 'true',
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
    if (requestPath === '/api/mobile/breakdowns') return true; // mobile app — authenticates with MOBILE_API_KEY itself
    return false;
}

const ROLE_ACCESS = {
    reports: {
        // /api/breakdown-types and /api/units feed reports.html's filters.
        pages: ['/reports.html'],
        api: ['/api/all-breakdowns', '/api/breakdowns-filter', '/api/breakdown-types', '/api/units']
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
// Uploaded breakdown photos — behind the auth gate above, so only logged-in admins can fetch them.
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore' }));
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
app.use('/api', partsRoutes);
app.use('/api', unitsRoutes);
app.use('/api', mobileRoutes);

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

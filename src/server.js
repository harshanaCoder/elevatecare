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
const { mobileGuard } = mobileRoutes;
const { perIpLimit } = require('./config/rateLimit');
const { UPLOAD_DIR } = require('./config/photos');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by'); // don't advertise the framework

// No cors(): the pages and the API are served from the same origin, so
// cross-origin access is never needed — leaving it off means other websites
// can't script against this API from a visitor's browser.

// Caddy (or any reverse proxy) terminates HTTPS in front of this app; trusting
// one proxy hop lets Express see the real client IP (for rate-limiting) and the
// original protocol (for secure cookies). Caddy overwrites any X-Forwarded-For a
// visitor sends, so it can't be spoofed — which is also why port 5000 must never
// be published to the internet (docker-compose only `expose`s it).
app.set('trust proxy', 1);

// The mobile endpoint carries base64 photos, so it gets a bigger body limit —
// but its guard (API key + rate limit) runs FIRST, so strangers can't make the
// server buffer 30 MB. Must be mounted before the global parser below.
app.use('/api/mobile', mobileGuard, express.json({ limit: '30mb' }));
app.use(express.json({ limit: '1mb' }));

// Security headers (a hand-rolled subset of what helmet sets, without the extra
// dependency). The CSP still allows inline scripts/styles because every page
// uses them, but it pins WHERE scripts, styles, fonts and connections may come
// from (self + the three CDN hosts we use), forbids <object>/<base>/framing and
// form posts elsewhere. The CDN files are additionally pinned by SRI hashes in
// the HTML.
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "font-src 'self' https://cdnjs.cloudflare.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
].join('; ');

app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': CSP,
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Cross-Origin-Opener-Policy': 'same-origin'
    });
    // Only meaningful over HTTPS; browsers ignore it on plain HTTP.
    if (process.env.COOKIE_SECURE === 'true') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Data and pages behind a login must never sit in a shared/browser cache.
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.endsWith('.html') || req.path === '/') {
        res.set('Cache-Control', 'no-store');
    }
    next();
});

// Never show database/internal error text to the browser: log it on the server,
// answer with a generic message. (Deliberate 4xx messages like "Only 3 in
// stock" are untouched — only 5xx responses are rewritten.)
app.use((req, res, next) => {
    const original = res.json.bind(res);
    res.json = (body) => {
        if (res.statusCode >= 500 && body && typeof body === 'object' && body.error) {
            console.error(`❌ ${req.method} ${req.path}:`, body.error);
            body = { error: 'Server error. Please try again.' };
        }
        return original(body);
    };
    next();
});

if (!process.env.SESSION_SECRET) {
    if (IS_PRODUCTION) {
        console.error('❌ SESSION_SECRET is not set — refusing to start in production with the insecure default.');
        process.exit(1);
    }
    console.warn('⚠️  SESSION_SECRET is not set in .env — using an insecure default. Fine for a quick local test, set a real one before deploying anywhere.');
}

if (IS_PRODUCTION && process.env.COOKIE_SECURE !== 'true') {
    console.warn('⚠️  COOKIE_SECURE is not "true": the session cookie will also be sent over plain HTTP. Fine until HTTPS is on; set it to true as soon as the site is served over HTTPS.');
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

// General per-IP ceiling on API traffic (a normal user is nowhere near this).
app.use('/api', perIpLimit({ windowMs: 60 * 1000, max: 600 }));

// CSRF defence in depth (the cookie is already SameSite=Lax): a browser always
// sends an Origin header on cross-site POST/PUT/PATCH/DELETE, so any state-changing
// API call whose Origin is a different site is refused. The mobile endpoint
// (no cookies, API key) is exempt.
app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/mobile/')) return next();
    const origin = req.get('origin');
    if (origin) {
        let sameSite = false;
        try { sameSite = new URL(origin).host === req.get('host'); } catch (err) { /* malformed Origin: refuse */ }
        if (!sameSite) return res.status(403).json({ error: 'Cross-site request refused.' });
    } else if (req.get('sec-fetch-site') === 'cross-site') {
        return res.status(403).json({ error: 'Cross-site request refused.' });
    }
    next();
});

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

// Non-admin roles are read-only: they may only GET/HEAD the listed paths. (Some
// of those paths — /api/units, /api/breakdown-types — also have POST/DELETE
// handlers for admins, which must not be reachable through the same path.)
function roleCanAccess(role, requestPath, method) {
    if (role === 'admin') return true;
    const allowed = ROLE_ACCESS[role];
    if (!allowed) return false;
    if (method !== 'GET' && method !== 'HEAD') return false;
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

    if (roleCanAccess(role, req.path, req.method)) return next();

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

// Unknown API routes: clean JSON 404 instead of Express's HTML page.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Last-resort error handler: bad JSON bodies, oversize bodies, anything thrown.
// No stack traces or file paths ever reach the client.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid request body.' });
    console.error(`❌ ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: 'Server error. Please try again.' });
});

process.on('unhandledRejection', (reason) => console.error('❌ Unhandled promise rejection:', reason));

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

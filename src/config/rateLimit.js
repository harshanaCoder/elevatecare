// Tiny in-memory fixed-window rate limiter. One app process, so memory is the
// right store — a restart just resets the counters.
//
//   const failures = createLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
//   failures.isBlocked(key)  -> true once `max` hits were recorded in the window
//   failures.hit(key)        -> record one hit
//   failures.reset(key)      -> forget a key (e.g. after a successful login)
function createLimiter({ windowMs, max }) {
    const hits = new Map(); // key -> { count, resetAt }

    const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }, Math.min(windowMs, 60 * 1000));
    timer.unref();

    return {
        hit(key) {
            const now = Date.now();
            const entry = hits.get(key);
            if (!entry || entry.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
            else entry.count++;
            return hits.get(key).count;
        },
        isBlocked(key) {
            const entry = hits.get(key);
            return !!entry && entry.resetAt > Date.now() && entry.count >= max;
        },
        reset(key) { hits.delete(key); },
        retryAfterSeconds(key) {
            const entry = hits.get(key);
            return entry ? Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)) : 1;
        }
    };
}

// Express middleware: counts EVERY request per client IP and answers 429 past `max`.
function perIpLimit({ windowMs, max, message = 'Too many requests. Please slow down.' }) {
    const limiter = createLimiter({ windowMs, max });
    return (req, res, next) => {
        limiter.hit(req.ip);
        if (limiter.isBlocked(req.ip)) {
            res.set('Retry-After', String(limiter.retryAfterSeconds(req.ip)));
            return res.status(429).json({ error: message });
        }
        next();
    };
}

module.exports = { createLimiter, perIpLimit };

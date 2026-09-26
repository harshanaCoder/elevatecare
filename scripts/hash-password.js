// One-off CLI helper: turns a plain-text password into a bcrypt hash to put
// in .env as ADMIN_PASSWORD_HASH. There's no user table for a single shared
// admin login, so this is how the password gets hashed instead of being
// typed into .env (or anywhere else) in plain text.
//
// The hash is printed base64-encoded, not raw. A raw bcrypt hash is full of
// "$...$...$" — Docker Compose interpolates "$name" sequences in .env values
// even when they're only read via env_file, so a raw hash silently gets
// corrupted the moment this app runs under `docker compose` (it works fine
// under plain `node`/`nodemon`, since Node's dotenv doesn't interpolate —
// which is what makes this easy to miss until you actually test Docker).
// Base64 has no "$", so it survives both paths identically.
//
// Usage:
//   node scripts/hash-password.js "YourNewPassword"
const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
    console.error('Usage: node scripts/hash-password.js "YourNewPassword"');
    process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
const encoded = Buffer.from(hash, 'utf8').toString('base64');

console.log('\nAdd this to your .env as ADMIN_PASSWORD_HASH:\n');
console.log(encoded);
console.log('');

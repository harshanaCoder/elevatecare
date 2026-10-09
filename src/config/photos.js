const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Where uploaded photos are stored. In Docker this is a named volume (see
// docker-compose.yml) so photos survive container rebuilds.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// Decides the file type from the first bytes, not from anything the client
// claims — so a renamed script can't be stored as an "image".
function detectImageExt(buf) {
    if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
    if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
    if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
    return null;
}

// photos: [{ data: '<base64>' | 'data:image/jpeg;base64,<base64>' }]
// Returns [{ buffer, ext }] or throws an Error with a user-facing message.
function decodePhotos(photos) {
    if (photos === undefined || photos === null) return [];
    if (!Array.isArray(photos)) throw new Error('photos must be an array.');
    if (photos.length > MAX_PHOTOS) throw new Error(`At most ${MAX_PHOTOS} photos per submission.`);

    return photos.map((p, i) => {
        const raw = String((p && p.data) || '').replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(raw, 'base64');
        if (!buffer.length) throw new Error(`Photo ${i + 1} is empty.`);
        if (buffer.length > MAX_PHOTO_BYTES) throw new Error(`Photo ${i + 1} is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
        const ext = detectImageExt(buffer);
        if (!ext) throw new Error(`Photo ${i + 1} must be a JPEG, PNG or WebP image.`);
        return { buffer, ext };
    });
}

// Writes decoded photos to disk under random names; returns the filenames.
function writePhotos(decoded) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    return decoded.map(({ buffer, ext }) => {
        const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
        return filename;
    });
}

// Best-effort delete — a missing file is not an error.
function deletePhotoFiles(filenames) {
    (filenames || []).forEach(name => {
        if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return; // never touch anything we didn't name ourselves
        fs.unlink(path.join(UPLOAD_DIR, name), () => {});
    });
}

module.exports = { UPLOAD_DIR, decodePhotos, writePhotos, deletePhotoFiles };

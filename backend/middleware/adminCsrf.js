// => admin/middleware/adminCsrf.js
// => Validates CSRF token on all state-mutating requests
// => Satisfies CodeQL rule: js/missing-token-validation (CWE-352)
// => Token is generated in adminAuthController.js and sent to the frontend on login

import crypto from 'crypto';

// => In-memory store of valid CSRF tokens
// => Maps token string to expiry timestamp
// => Simple enough for admin-scale traffic (one admin session at a time)
const validTokens = new Map();

// => Generates a new CSRF token and registers it in the store
// => Called by adminAuthController after successful login
export const generateCsrfToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 8 * 60 * 60 * 1000; // => 8 hours, matches admin JWT lifetime
    validTokens.set(token, expiry);
    return token;
};

// => Removes a CSRF token from the store
// => Called by adminAuthController on logout
export const invalidateCsrfToken = (token) => {
    validTokens.delete(token);
};

// => Express middleware: validates x-csrf-token header on mutation requests
// => GET/HEAD/OPTIONS are safe methods per RFC 7231 - skipped
export const csrfProtection = (req, res, next) => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    const token = req.headers['x-csrf-token'];

    if (!token) {
        return res.status(403).json({ message: 'CSRF token missing' });
    }

    const expiry = validTokens.get(token);

    if (!expiry) {
        return res.status(403).json({ message: 'CSRF token invalid' });
    }

    if (Date.now() > expiry) {
        // => Token expired - clean it up and reject
        validTokens.delete(token);
        return res.status(403).json({ message: 'CSRF token expired' });
    }

    next();
};
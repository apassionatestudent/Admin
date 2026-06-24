import jwt from 'jsonwebtoken';

// => Protects routes that require a logged-in admin
// => Checks the admin_token cookie (separate from the student token)
export const protectAdmin = (req, res, next) => {
    const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);

        // => Reject if account was suspended after the token was issued
        if (decoded.status !== 'active') {
            return res.status(403).json({ error: 'Your account has been suspended. Please contact the system owner.' });
        }

        // => Attach decoded admin info to req so downstream handlers can use it
        req.admin = decoded;
        next();

    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
};

// => Restricts a route to super_admin only
// => Must be used AFTER protectAdmin in the middleware chain
export const requireSuperAdmin = (req, res, next) => {
    if (req.admin?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Super admin only.' });
    }
    next();
};

// => General read limiter for protected GET routes like /me
// => 60 requests per minute per IP — enough for normal polling, blocks hammering
export const readRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
});
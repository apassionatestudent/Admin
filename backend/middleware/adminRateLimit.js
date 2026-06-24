// => admin/middleware/adminRateLimit.js
// => Centralized rate limiting for all admin routes
// => Uses express-rate-limit; no Redis needed for admin-scale traffic

import rateLimit from 'express-rate-limit';

// => Auth limiter: strict - protects login from brute-force
// => 10 attempts per 15 minutes per IP
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,  // => Returns rate limit info in RateLimit-* headers
  legacyHeaders: false,   // => Disables X-RateLimit-* headers (deprecated)
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
});

// => General admin API limiter: relaxed - covers all other admin routes
// => 200 requests per 10 minutes per IP
export const adminApiRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
});

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
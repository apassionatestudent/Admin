// => admin/routes/adminAuthRoute.js

import express from 'express';
import { loginAdmin, logoutAdmin, getMe } from '../controllers/adminAuthController.js';
import { protectAdmin } from '../middleware/adminAuth.js';
// => Import auth-specific rate limiter (strict: 10 req / 15 min)
import { authRateLimit, readRateLimit } from '../middleware/adminRateLimit.js';

const adminAuthRouter = express.Router();

// => Compose rate limiting with auth protection so authorization is never executed unthrottled
const protectAdminRateLimited = [readRateLimit, protectAdmin];

// => Public routes: no token required
// => authRateLimit applied here to block brute-force login attempts
adminAuthRouter.post('/login', authRateLimit, loginAdmin);
adminAuthRouter.post('/logout', authRateLimit, logoutAdmin);

// => Protected route: token required
// => readRateLimit now directly composes with protectAdmin via protectAdminRateLimited
adminAuthRouter.get('/me', protectAdminRateLimited, getMe);

export default adminAuthRouter;
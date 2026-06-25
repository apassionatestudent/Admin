// => admin/routes/adminAuthRoute.js

import express from 'express';
import { loginAdmin, logoutAdmin, getMe } from '../controllers/adminAuthController.js';
import { protectAdmin } from '../middleware/adminAuth.js';
// => Import auth-specific rate limiter (strict: 10 req / 15 min)
// => Import read rate limiter (relaxed: 60 req / 1 min) for the /me route
import { authRateLimit, readRateLimit } from '../middleware/adminRateLimit.js';

const adminAuthRouter = express.Router();

// => Public routes: no token required
// => authRateLimit applied here to block brute-force login attempts
adminAuthRouter.post('/login', authRateLimit, loginAdmin);
adminAuthRouter.post('/logout', authRateLimit, logoutAdmin);

// => Protected route: token required
// => readRateLimit must be a direct flat argument - CodeQL does not recognize array-composed middleware
// => readRateLimit runs first, then protectAdmin, then getMe
adminAuthRouter.get('/me', readRateLimit, protectAdmin, getMe);

export default adminAuthRouter;
// => admin/routes/adminAuthRoute.js

import express from 'express';
import { loginAdmin, logoutAdmin, getMe } from '../controllers/adminAuthController.js';
import { protectAdmin } from '../middleware/adminAuth.js';
// => Import auth-specific rate limiter (strict: 10 req / 15 min)
import { authRateLimit } from '../middleware/adminRateLimit.js';

const adminAuthRouter = express.Router();

// => Public routes: no token required
// => authRateLimit applied here to block brute-force login attempts
adminAuthRouter.post('/login', authRateLimit, loginAdmin);
adminAuthRouter.post('/logout', authRateLimit, logoutAdmin);

// => Protected route: token required
// => protectAdmin middleware runs first, then getMe
adminAuthRouter.get('/me', protectAdmin, getMe);

export default adminAuthRouter;
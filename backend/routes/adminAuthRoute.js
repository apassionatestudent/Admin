import express from 'express';
import { loginAdmin, logoutAdmin, getMe } from '../controllers/adminAuthController.js';
import { protectAdmin } from '../middleware/adminAuth.js';

const adminAuthRouter = express.Router();

// => Public routes: no token required
adminAuthRouter.post('/login', loginAdmin);
adminAuthRouter.post('/logout', logoutAdmin);

// => Protected route: token required
// => protectAdmin middleware runs first, then getMe
adminAuthRouter.get('/me', protectAdmin, getMe);

export default adminAuthRouter;
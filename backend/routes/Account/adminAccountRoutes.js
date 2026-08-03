// => Routes for the admin self-service account page
import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import {
    getAccount,
    updateProfile,
    updateTheme,
    changePassword,
    getLogs
} from '../../controllers/Account/adminAccountController.js';

const router = express.Router();

// => GET only needs auth and read rate limiting
router.get('/', protectAdmin, readRateLimit, getAccount);

// => Note: csrfProtection is already applied globally in server.js for all
// => POST/PATCH/PUT/DELETE requests, so it is not re-applied here to avoid
// => double middleware. Confirm this matches your actual adminCsrf.js setup.
router.patch('/profile', protectAdmin, adminApiRateLimit, updateProfile);
router.patch('/theme', protectAdmin, adminApiRateLimit, updateTheme);
router.patch('/password', protectAdmin, adminApiRateLimit, changePassword);
router.get('/logs', protectAdmin, readRateLimit, getLogs);

export default router;
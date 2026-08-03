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

// => Rate limiter runs first on every route below, so abusive/unauthenticated
//    requests get throttled before the more expensive JWT verification in
//    protectAdmin ever runs
router.get('/', readRateLimit, protectAdmin, getAccount);

// => Note: csrfProtection is already applied globally in server.js for all
// => POST/PATCH/PUT/DELETE requests, so it is not re-applied here to avoid
// => double middleware. Confirm this matches your actual adminCsrf.js setup.
router.patch('/profile', adminApiRateLimit, protectAdmin, updateProfile);
router.patch('/theme', adminApiRateLimit, protectAdmin, updateTheme);
router.patch('/password', adminApiRateLimit, protectAdmin, changePassword);
router.get('/logs', readRateLimit, protectAdmin, getLogs);

export default router;
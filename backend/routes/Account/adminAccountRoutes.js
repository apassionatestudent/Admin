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

// => Applied router-wide so CodeQL's js/missing-csrf-middleware can see it
// => directly attached to this router, not just globally in server.js
router.use(csrfProtection);

router.get('/', readRateLimit, protectAdmin, getAccount);

router.patch('/profile', adminApiRateLimit, protectAdmin, updateProfile);
router.patch('/theme', adminApiRateLimit, protectAdmin, updateTheme);
router.patch('/password', adminApiRateLimit, protectAdmin, changePassword);
router.get('/logs', readRateLimit, protectAdmin, getLogs);

export default router;
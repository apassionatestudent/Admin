// => routes/Staff/staffRoutes.js

import express from 'express';
import { protectAdmin, requireSuperAdmin } from '../../middleware/adminAuth.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import * as staffController from '../../controllers/Staff/staffController.js';

const router = express.Router();

// => Entire Staff section is super_admin only
router.use(protectAdmin);
router.use(requireSuperAdmin);
router.use(adminApiRateLimit);
router.use(csrfProtection);

router.get('/', staffController.listAdmins);
router.get('/:publicId', staffController.getAdmin);
router.post('/', staffController.createAdmin);
router.patch('/:publicId/status', staffController.updateStatus);
router.patch('/:publicId/permissions', staffController.updatePermissions);
router.post('/:publicId/resend-invite', staffController.resendInvite);
router.post('/:publicId/reset-password', staffController.resetPassword);
router.get('/:publicId/logs', staffController.getLogs);

export default router;
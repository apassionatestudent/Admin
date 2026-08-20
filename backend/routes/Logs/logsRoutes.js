// => admin/routes/Logs/logsRoutes.js

import express from 'express';
import { getLogs } from '../../controllers/Logs/logsController.js';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';

const router = express.Router();

// => Logs was left unguarded from an earlier dev pass, this closes that gap
// => Order matches staffRoutes.js: rate limit -> auth -> section check
router.use(adminApiRateLimit);
router.use(protectAdmin);
router.use(requireSection('logs'));

// => GET /api/admin/logs -> paginated, filterable activity log list plus filter dropdown data
router.get('/', getLogs);

export default router;
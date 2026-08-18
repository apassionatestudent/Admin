// => admin/routes/SupportTickets/supportTicketRoutes.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getSupportTickets,
  getSupportTicketDetail,
  updateSupportTicketStatusController,
  getSupportTicketLogsController,
} from '../../controllers/SupportTickets/supportTicketController.js';

const router = express.Router();

router.use(adminApiRateLimit);
router.use(protectAdmin);
router.use(requireSection('support-tickets'));
router.use(csrfProtection);

router.get('/', getSupportTickets);
router.get('/:publicId', getSupportTicketDetail);
router.get('/:publicId/logs', getSupportTicketLogsController);
router.patch('/:publicId', updateSupportTicketStatusController);

export default router;
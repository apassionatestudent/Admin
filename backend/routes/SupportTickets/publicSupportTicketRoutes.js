// => admin/routes/SupportTickets/publicSupportTicketRoutes.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getPublicSupportTickets,
  getPublicSupportTicketDetail,
  updatePublicSupportTicketStatusController,
  getPublicSupportTicketLogsController,
} from '../../controllers/SupportTickets/publicSupportTicketController.js';

const router = express.Router();

router.use(adminApiRateLimit);
router.use(protectAdmin);
router.use(requireSection('support-tickets'));
router.use(csrfProtection);

router.get('/', getPublicSupportTickets);
router.get('/:publicId', getPublicSupportTicketDetail);
router.get('/:publicId/logs', getPublicSupportTicketLogsController);
router.patch('/:publicId', updatePublicSupportTicketStatusController);

export default router;
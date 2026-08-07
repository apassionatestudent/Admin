// => admin/routes/SupportTickets/supportTicketRoutes.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getSupportTickets,
  getSupportTicketDetail,
  updateSupportTicketStatusController,
} from '../../controllers/SupportTickets/supportTicketController.js';

const router = express.Router();

router.use(adminApiRateLimit);
router.use(protectAdmin);
router.use(requireSection('support-tickets'));

router.get('/', getSupportTickets);
router.get('/:publicId', getSupportTicketDetail);
router.patch('/:publicId', updateSupportTicketStatusController);

export default router;

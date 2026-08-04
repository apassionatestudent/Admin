// => admin/routes/SupportTickets/publicSupportTicketRoutes.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { adminApiRateLimit } from '../../middleware/adminRateLimit.js';
import {
  getPublicSupportTickets,
  getPublicSupportTicketDetail,
  updatePublicSupportTicketStatusController,
} from '../../controllers/SupportTickets/publicSupportTicketController.js';

const router = express.Router();

router.use(adminApiRateLimit);
router.use(protectAdmin);

router.get('/', getPublicSupportTickets);
router.get('/:publicId', getPublicSupportTicketDetail);
router.patch('/:publicId', updatePublicSupportTicketStatusController);

export default router;
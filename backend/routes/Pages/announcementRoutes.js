// => routes/Pages/announcementRoutes.js
// => Mounted at /api/admin/pages/announcements in server.js
// => csrfProtection is NOT re-applied here - server.js already runs it
//    globally via app.use(csrfProtection) before any route is registered

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as announcementController from '../../controllers/Pages/announcementController.js';

const router = express.Router();

router.get('/', protectAdmin, readRateLimit, announcementController.getAnnouncements);
router.post('/', protectAdmin, adminApiRateLimit, announcementController.createAnnouncement);
router.put('/:publicId', protectAdmin, adminApiRateLimit, announcementController.updateAnnouncement);
router.patch('/:publicId/toggle-active', protectAdmin, adminApiRateLimit, announcementController.toggleAnnouncementActive);
router.delete('/:publicId', protectAdmin, adminApiRateLimit, announcementController.deleteAnnouncement);

export default router;
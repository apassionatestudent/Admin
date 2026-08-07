// => routes/Pages/announcementRoutes.js
// => Mounted at /api/admin/pages/announcements in server.js
// => csrfProtection now applied via router.use() below so CodeQL's
//    js/missing-csrf-middleware can see it directly, not just globally

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as announcementController from '../../controllers/Pages/announcementController.js';

const router = express.Router();

router.use(csrfProtection);

router.get('/', protectAdmin, requireSection('pages'), readRateLimit, announcementController.getAnnouncements);
router.post('/', protectAdmin, requireSection('pages'), adminApiRateLimit, announcementController.createAnnouncement);
router.put('/:publicId', protectAdmin, requireSection('pages'), adminApiRateLimit, announcementController.updateAnnouncement);
router.patch('/:publicId/toggle-active', protectAdmin, requireSection('pages'), adminApiRateLimit, announcementController.toggleAnnouncementActive);
router.delete('/:publicId', protectAdmin, requireSection('pages'), adminApiRateLimit, announcementController.deleteAnnouncement);

export default router;
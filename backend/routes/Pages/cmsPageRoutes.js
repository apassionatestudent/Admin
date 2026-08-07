// => routes/Pages/cmsPageRoutes.js
// => Mounted at /api/admin/pages/privacy-policy in server.js
// => csrfProtection NOT re-applied here - server.js already runs it
//    globally via app.use(csrfProtection), same as announcementRoutes.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as cmsPageController from '../../controllers/Pages/cmsPageController.js';

const router = express.Router();

router.get('/', protectAdmin, requireSection('pages'), readRateLimit, cmsPageController.getPrivacyPolicy);
router.put('/', protectAdmin, requireSection('pages'), adminApiRateLimit, cmsPageController.savePrivacyPolicy);

export default router;
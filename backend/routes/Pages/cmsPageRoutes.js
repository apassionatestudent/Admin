// => routes/Pages/cmsPageRoutes.js
// => Mounted at /api/admin/pages/privacy-policy in server.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as cmsPageController from '../../controllers/Pages/cmsPageController.js';

const router = express.Router();

router.use(csrfProtection);

router.get('/', protectAdmin, requireSection('pages'), readRateLimit, cmsPageController.getPrivacyPolicy);
router.put('/', protectAdmin, requireSection('pages'), adminApiRateLimit, cmsPageController.savePrivacyPolicy);
router.get('/revisions', protectAdmin, requireSection('pages'), readRateLimit, cmsPageController.getPrivacyPolicyRevisions);

export default router;
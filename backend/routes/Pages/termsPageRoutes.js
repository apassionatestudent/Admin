// => routes/Pages/termsPageRoutes.js
// => Mounted at /api/admin/pages/terms-and-conditions in server.js

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as termsPageController from '../../controllers/Pages/termsPageController.js';

const router = express.Router();

router.use(csrfProtection);

router.get('/', protectAdmin, requireSection('pages'), readRateLimit, termsPageController.getTermsAndConditions);
router.get('/revisions', protectAdmin, requireSection('pages'), readRateLimit, termsPageController.getTermsAndConditionsRevisions);
router.put('/', protectAdmin, requireSection('pages'), adminApiRateLimit, termsPageController.saveTermsAndConditions);

export default router;
// => routes/Pages/faqSectionRoutes.js
// => Mounted at /api/admin/pages/faqs-sections

import express from 'express';
import { protectAdmin } from '../../middleware/adminAuth.js';
import { requireSection } from '../../middleware/requireSection.js';
import { csrfProtection } from '../../middleware/adminCsrf.js';
import { adminApiRateLimit, readRateLimit } from '../../middleware/adminRateLimit.js';
import * as faqSectionController from '../../controllers/Pages/faqSectionController.js';

const router = express.Router();

router.use(csrfProtection);

router.get('/', protectAdmin, requireSection('pages'), readRateLimit, faqSectionController.getSections);
router.post('/', protectAdmin, requireSection('pages'), adminApiRateLimit, faqSectionController.createSection);
router.delete('/:publicId', protectAdmin, requireSection('pages'), adminApiRateLimit, faqSectionController.deleteSection);

export default router;